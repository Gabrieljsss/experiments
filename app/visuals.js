/* Tiny renderer for the lesson diagrams. Each lesson describes its visuals as
 * data (see app/data/*.js) and this file turns them into SVG / HTML. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // allow **bold** and `code` inside visual text
  const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");

  let uid = 0;

  /* ---------- flow: boxes + arrows on a grid ---------- */
  function flow(v) {
    const CW = v.colW || 160, RH = v.rowH || 92, NW = v.nodeW || 136, NH = v.nodeH || 50, PAD = 14;
    const id = "m" + (++uid);
    const nodes = {};
    let maxX = 0, maxY = 0;
    // On phones, a wide-and-short diagram reads better rotated to flow top → bottom.
    const spanX = Math.max(...v.nodes.map((n) => n.x)), spanY = Math.max(...v.nodes.map((n) => n.y));
    const narrow = typeof window !== "undefined" && window.innerWidth < 600;
    const flip = narrow && !v.noFlip && spanX * CW > spanY * CW + 60;
    for (const raw of v.nodes) {
      const n = flip ? { ...raw, x: raw.y, y: raw.x } : raw;
      // widen boxes whose text wouldn't fit
      const longest = Math.max(...String(n.label).split("\n").map((t) => t.length * 8 + 18), ...(n.sub ? String(n.sub).split("\n").map((t) => t.length * 6.6 + 18) : [0]));
      const w = n.w ? n.w * NW : Math.max(NW, longest);
      const h = n.h ? n.h * NH : NH;
      const cx = PAD + NW / 2 + n.x * CW;
      const cy = PAD + NH / 2 + n.y * RH;
      nodes[n.id] = { ...n, cx, cy, w, h };
      maxX = Math.max(maxX, cx + w / 2);
      maxY = Math.max(maxY, cy + h / 2);
    }
    const W = maxX + PAD, H = maxY + PAD;

    const clip = (a, b) => {
      const dx = b.cx - a.cx, dy = b.cy - a.cy;
      if (!dx && !dy) return [a.cx, a.cy];
      const tx = dx ? (a.w / 2 + 4) / Math.abs(dx) : Infinity;
      const ty = dy ? (a.h / 2 + 4) / Math.abs(dy) : Infinity;
      const t = Math.min(tx, ty);
      return [a.cx + dx * t, a.cy + dy * t];
    };

    const markers = ["", "bad", "good", "accent"].map((k) =>
      `<marker id="${id}${k}" class="${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>`
    ).join("");

    let edges = "", labels = "";
    for (const e of v.edges || []) {
      const a = nodes[e.from], b = nodes[e.to];
      if (!a || !b) continue;
      const [x1, y1] = clip(a, b);
      const [x2, y2] = clip(b, a);
      const style = e.style || "";
      const mk = ["bad", "good", "accent"].find((k) => style.includes(k)) || "";
      const head = e.noArrow ? "" : `marker-end="url(#${id}${mk})"`;
      const tail = e.both ? `marker-start="url(#${id}${mk})"` : "";
      let d;
      if (e.bend) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const nx = -(y2 - y1), ny = x2 - x1, len = Math.hypot(nx, ny) || 1;
        const qx = mx + (nx / len) * e.bend, qy = my + (ny / len) * e.bend;
        d = `M${x1},${y1} Q${qx},${qy} ${x2},${y2}`;
        if (e.label) labels += label(e.label, (mx + qx) / 2, (my + qy) / 2);
      } else {
        d = `M${x1},${y1} L${x2},${y2}`;
        if (e.label) labels += label(e.label, (x1 + x2) / 2, (y1 + y2) / 2);
      }
      edges += `<path class="e ${style}" d="${d}" ${head} ${tail}/>`;
    }

    function label(text, x, y) {
      const lines = String(text).split("\n");
      const w = Math.max(...lines.map((l) => l.length)) * 6.8 + 10;
      const h = lines.length * 14 + 4;
      return `<rect class="elabel-bg" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="4"/>` +
        lines.map((l, i) => `<text class="elabel" x="${x}" y="${y - h / 2 + 13 + i * 14}" text-anchor="middle">${esc(l)}</text>`).join("");
    }

    let body = "";
    for (const n of Object.values(nodes)) {
      const x = n.cx - n.w / 2, y = n.cy - n.h / 2;
      const kind = n.kind || "";
      let shape;
      if (kind.includes("db")) {
        const ry = 7;
        shape = `<path class="shape" d="M${x},${y + ry} a${n.w / 2},${ry} 0 0 1 ${n.w},0 v${n.h - 2 * ry} a${n.w / 2},${ry} 0 0 1 ${-n.w},0 z"/>` +
          `<path class="shape" d="M${x},${y + ry} a${n.w / 2},${ry} 0 0 0 ${n.w},0" fill="none"/>`;
      } else if (kind.includes("circle")) {
        shape = `<ellipse cx="${n.cx}" cy="${n.cy}" rx="${n.w / 2}" ry="${n.h / 2}"/>`;
      } else {
        shape = `<rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="10"/>`;
      }
      const lines = String(n.label).split("\n");
      const sub = n.sub ? String(n.sub).split("\n") : [];
      const total = lines.length * 16 + sub.length * 13;
      let ty = n.cy - total / 2 + 12 + (kind.includes("db") ? 3 : 0);
      let text = "";
      for (const l of lines) { text += `<text x="${n.cx}" y="${ty}" text-anchor="middle">${esc(l)}</text>`; ty += 16; }
      for (const l of sub) { text += `<text class="sub" x="${n.cx}" y="${ty - 2}" text-anchor="middle">${esc(l)}</text>`; ty += 13; }
      body += `<g class="n ${esc(kind)}">${shape}${text}</g>`;
    }

    // never upscale beyond natural size; shrink to fit narrow screens
    return `<div class="diagram-scroll"><svg class="diagram" style="max-width:${W}px" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.alt || v.caption || "diagram")}">` +
      `<defs>${markers}</defs>${edges}${labels}${body}</svg></div>`;
  }

  /* ---------- table ---------- */
  function table(v) {
    const cell = (c) => {
      const s = String(c);
      const cls = /^(yes\b|✓)/i.test(s) ? "yes" : /^(no\b|✗)/i.test(s) ? "no" : /^(meh\b|~|some\b|partly\b)/i.test(s) ? "meh" : "";
      return `<td class="${cls}">${rich(s)}</td>`;
    };
    return `<div class="table-scroll"><table class="v-table"><thead><tr>${v.head.map((h) => `<th>${rich(h)}</th>`).join("")}</tr></thead>` +
      `<tbody>${v.rows.map((r) => `<tr>${r.map(cell).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  /* ---------- numbered steps ---------- */
  function steps(v) {
    return `<ol class="v-steps">${v.items.map((it) => {
      const [t, d] = Array.isArray(it) ? it : [it, ""];
      return `<li><b>${rich(t)}</b>${d ? `<span>${rich(d)}</span>` : ""}</li>`;
    }).join("")}</ol>`;
  }

  /* ---------- rating meters (0-5) ---------- */
  function meter(v) {
    return `<div class="v-meter">${v.items.map((it) => `<div class="item"><h4>${rich(it.name)}</h4>` +
      v.metrics.map((m, i) => {
        const val = it.values[i];
        const tone = (v.tones && v.tones[i]) || "";
        return `<div class="m"><span>${esc(m)}</span><div class="track ${tone}">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= val ? "on" : ""}"></i>`).join("")}</div></div>`;
      }).join("") + `</div>`).join("")}</div>`;
  }

  /* ---------- concurrent timelines (threads / nodes over time) ---------- */
  function lanes(v) {
    const cols = v.lanes.length + 1;
    let html = `<div class="v-lanes" style="grid-template-columns: 44px repeat(${v.lanes.length}, 1fr)">`;
    html += `<div class="lh">t</div>` + v.lanes.map((l) => `<div class="lh">${esc(l)}</div>`).join("");
    v.rows.forEach((r, i) => {
      html += `<div class="c t">${i + 1}</div>`;
      for (let k = 0; k < cols - 1; k++) {
        let ev = r[k];
        if (ev == null || ev === "") { html += `<div class="c"></div>`; continue; }
        let cls = "";
        if (typeof ev === "object") { cls = ev.s || ""; ev = ev.t; }
        html += `<div class="c"><span class="ev ${cls}">${rich(ev)}</span></div>`;
      }
    });
    return html + `</div>`;
  }

  /* ---------- rows of cells (arrays, logs, SSTables, buckets) ---------- */
  function cells(v) {
    return `<div class="v-cells">${v.rows.map((r) => `<div class="r"><div class="lbl">${esc(r.label || "")}</div><div class="cells">` +
      r.cells.map((c) => {
        let cls = "", t = c;
        if (typeof c === "object") { cls = c.s || ""; t = c.t; }
        if (t === "…" || t === "...") cls += " gap";
        return `<span class="${cls}">${esc(t)}</span>`;
      }).join("") + `</div></div>`).join("")}</div>`;
  }

  /* ---------- pros / cons ---------- */
  function procon(v) {
    const list = (xs) => `<ul>${xs.map((x) => `<li>${rich(x)}</li>`).join("")}</ul>`;
    return `<div class="v-procon"><div class="pro"><h4>${esc(v.proTitle || "Good at")}</h4>${list(v.pros)}</div>` +
      `<div class="con"><h4>${esc(v.conTitle || "Watch out for")}</h4>${list(v.cons)}</div></div>`;
  }

  /* ---------- icon cards ---------- */
  function cards(v) {
    return `<div class="v-cards">${v.items.map((c) => `<div><div class="ic">${c.icon || ""}</div><b>${rich(c.title)}</b><span>${rich(c.text)}</span></div>`).join("")}</div>`;
  }

  const R = { flow, table, steps, meter, lanes, cells, procon, cards };

  window.renderVisual = function (v) {
    const fn = R[v.type];
    if (!fn) return "";
    const title = v.title ? `<h3>${rich(v.title)}</h3>` : "";
    return `<figure class="visual" style="margin:0">${title}${fn(v)}${v.caption ? `<figcaption class="caption">${rich(v.caption)}</figcaption>` : ""}</figure>`;
  };
  window.richText = rich;
  window.escapeHtml = esc;
})();
