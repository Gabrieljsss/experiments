-- Username + password accounts for syncing study progress (no email involved).
--
-- The tables are never exposed through the API: row-level security is on with no
-- policies, so the public anon key can't read or write them directly. The app can
-- only call the functions below, which check the password or a sync token first.
-- Passwords are stored as bcrypt hashes; devices keep a random token, not the password.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.accounts (
  username   text primary key,
  pass_hash  text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_data_size check (pg_column_size(data) < 512000)
);

create table if not exists public.account_tokens (
  token_hash text primary key,                 -- sha256 of the token; the token itself is never stored
  username   text not null references public.accounts (username) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.login_failures (
  username  text not null,
  failed_at timestamptz not null default now()
);
create index if not exists login_failures_recent on public.login_failures (username, failed_at);

alter table public.accounts       enable row level security;
alter table public.account_tokens enable row level security;
alter table public.login_failures enable row level security;
revoke all on public.accounts, public.account_tokens, public.login_failures from anon, authenticated;

-- ---------- helpers (not callable from the API) ----------

create or replace function public.sd_new_token(p_username text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text := encode(gen_random_bytes(32), 'hex');
begin
  insert into account_tokens (token_hash, username) values (encode(digest(t, 'sha256'), 'hex'), p_username);
  return t;
end $$;

create or replace function public.sd_user_for(p_token text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select username from account_tokens where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- ---------- API ----------

-- Create an account and return a sync token for this device.
create or replace function public.sd_register(p_username text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(trim(p_username));
begin
  if u !~ '^[a-z0-9_.-]{3,32}$' then
    raise exception 'Usernames are 3–32 characters: letters, numbers, dot, dash or underscore' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Passwords need at least 6 characters' using errcode = '22023';
  end if;
  begin
    insert into accounts (username, pass_hash) values (u, crypt(p_password, gen_salt('bf', 10)));
  exception when unique_violation then
    raise exception 'That username is taken. Pick another, or sign in if it''s yours' using errcode = '23505';
  end;
  return sd_new_token(u);
end $$;

-- Check the password and return a sync token for this device, or null if it's wrong.
-- (Returning null instead of raising keeps the failure record: an error would roll it back.)
-- After 10 wrong passwords in 15 minutes the username is locked for the rest of that window.
create or replace function public.sd_login(p_username text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(trim(p_username)); h text;
begin
  if (select count(*) from login_failures where username = u and failed_at > now() - interval '15 minutes') >= 10 then
    raise exception 'Too many wrong passwords. Try again in 15 minutes' using errcode = '28P01';
  end if;
  select pass_hash into h from accounts where username = u;
  if h is null or h <> crypt(coalesce(p_password, ''), h) then
    insert into login_failures (username) values (u);
    delete from login_failures where failed_at < now() - interval '1 day';
    return null;
  end if;
  return sd_new_token(u);
end $$;

-- Read this account's progress.
create or replace function public.sd_pull(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u text := sd_user_for(p_token); d jsonb;
begin
  if u is null then raise exception 'Signed out: please sign in again' using errcode = '28000'; end if;
  select data into d from accounts where username = u;
  return jsonb_build_object('username', u, 'data', d);
end $$;

-- Replace this account's progress (the app merges before pushing).
create or replace function public.sd_push(p_token text, p_data jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u text := sd_user_for(p_token);
begin
  if u is null then raise exception 'Signed out: please sign in again' using errcode = '28000'; end if;
  update accounts set data = p_data, updated_at = now() where username = u;
end $$;

-- Forget this device's token.
create or replace function public.sd_logout(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from account_tokens where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- Only the API functions are callable with the public key.
revoke execute on function public.sd_new_token(text), public.sd_user_for(text) from public, anon, authenticated;
revoke execute on function public.sd_register(text, text), public.sd_login(text, text), public.sd_pull(text),
  public.sd_push(text, jsonb), public.sd_logout(text) from public;
grant execute on function public.sd_register(text, text), public.sd_login(text, text), public.sd_pull(text),
  public.sd_push(text, jsonb), public.sd_logout(text) to anon, authenticated;
