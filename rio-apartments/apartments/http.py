"""HTTP client that looks like a real browser at the TLS layer."""

import time

from curl_cffi import requests

# Cloudflare lets some browser fingerprints through and not others, and it
# changes over time; on a block we retry with the next one.
IMPERSONATE = ["safari", "safari_ios", "firefox", "safari17_0", "chrome"]
RETRY_STATUSES = {403, 429, 500, 502, 503, 504}


class Client:
    def __init__(self, delay_s=1.0):
        self.delay_s = delay_s
        self._last = {}

    def _wait(self, host):
        elapsed = time.monotonic() - self._last.get(host, 0)
        if elapsed < self.delay_s:
            time.sleep(self.delay_s - elapsed)
        self._last[host] = time.monotonic()

    def request(self, method, url, **kw):
        host = url.split("/")[2]
        last = None
        for attempt, imp in enumerate(IMPERSONATE):
            self._wait(host)
            try:
                resp = requests.request(method, url, impersonate=imp, timeout=40, **kw)
            except Exception as e:  # network hiccup: try the next fingerprint
                last = e
                continue
            if resp.status_code not in RETRY_STATUSES:
                return resp
            last = RuntimeError(f"HTTP {resp.status_code} for {url}")
            if resp.status_code == 429:
                time.sleep(5 * (attempt + 1))
        raise last

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)
