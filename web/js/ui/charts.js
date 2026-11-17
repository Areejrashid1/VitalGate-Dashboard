// Small SVG chart kit (no dependencies): time series, donut, horizontal bars, diverging bars, columns.
// Each chart redraws itself when its container is resized and shows a tooltip on hover.
import { esc, time, hm, dateTime } from "../core/fmt.js";

let tipEl = null;
export function tip(html, x, y) {
  if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; document.body.appendChild(tipEl); }
  if (html == null) { tipEl.style.display = "none"; return; }
  tipEl.innerHTML = html; tipEl.style.display = "block";
  const r = tipEl.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  tipEl.style.left = `${Math.max(8, left)}px`; tipEl.style.top = `${Math.max(8, top)}px`;
}
export function bindTips(root) {
  root.addEventListener("mousemove", (e) => { const t = e.target.closest("[data-tip]"); if (t && root.contains(t)) tip(t.dataset.tip, e.clientX, e.clientY); else tip(null); });
  root.addEventListener("mouseleave", () => tip(null));
}

const ro = new ResizeObserver((entries) => { for (const e of entries) { const el = e.target; if (el._draw && Math.abs(el.clientWidth - (el._w || 0)) > 2) el._draw(); } });
function mount(el, draw) {
  el.classList.add("chart"); el._draw = () => { el._w = el.clientWidth; draw(Math.max(120, el.clientWidth)); };
  if (!el._observed) { ro.observe(el); el._observed = true; }
  el._draw();
}
const niceMax = (v) => { if (!(v > 0)) return 1; const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
function ticksTime(t0, t1, n) {
  const span = t1 - t0, steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800];
  const st = steps.find((s) => span / s <= n) || 86400 * 7;
  const out = []; for (let t = Math.ceil(t0 / st) * st; t <= t1; t += st) out.push(t);
  return { ticks: out, fmt: span > 2 * 86400 ? (t) => new Date(t * 1000).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : span > 600 ? hm : time };
}

/**
 * Time-series chart.
 * series: [{name, color, points: [[t, v], ...], type: "line"|"area"|"bars"|"step", axis: "left"|"right", fmt}]
 * opts: {height, t0, t1, yMax, yMin, y2Max, yFmt, y2Fmt, log, markers:[{t, color, label}], refs:[{y, label, color}], bands:[{t0,t1,label}], empty}
 */
export function timeChart(el, series, o = {}) {
  mount(el, (W) => {
    const H = o.height || 220, padL = o.padL ?? 44, padR = series.some((s) => s.axis === "right") ? 44 : 14, padT = 10, padB = 24;
    const pts = series.flatMap((s) => s.points);
    let t0 = o.t0 ?? Math.min(...pts.map((p) => p[0])), t1 = o.t1 ?? Math.max(...pts.map((p) => p[0]));
    if (!pts.length && (o.t0 == null || o.t1 == null)) { el.innerHTML = emptyState(o.empty || "No data in this range yet", H); return; }
    if (t1 <= t0) t1 = t0 + 1;
    const left = series.filter((s) => s.axis !== "right"), right = series.filter((s) => s.axis === "right");
    let yMax = o.yMax ?? niceMax(Math.max(0, ...left.flatMap((s) => s.points.map((p) => p[1] || 0))) * 1.08);
    const istep = o.int ? Math.max(1, Math.ceil(yMax / 4)) : 0; if (o.int) yMax = istep * 4;
    const yMin = o.yMin ?? 0;
    const y2Max = o.y2Max ?? niceMax(Math.max(0, ...right.flatMap((s) => s.points.map((p) => p[1] || 0))) * 1.08);
    const iw = W - padL - padR, ih = H - padT - padB;
    const X = (t) => padL + ((t - t0) / (t1 - t0)) * iw;
    const lg = (v) => Math.log10(1 + Math.max(0, v));
    const Y = (v) => padT + ih - (o.log ? lg(v) / lg(yMax) : (v - yMin) / (yMax - yMin || 1)) * ih;
    const Y2 = (v) => padT + ih - (v / (y2Max || 1)) * ih;
    const yf = o.yFmt || ((v) => +v.toFixed(2)), y2f = o.y2Fmt || ((v) => +v.toFixed(2));
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`;
    for (const b of o.bands || []) {
      const a = X(Math.max(t0, b.t0)), z = X(Math.min(t1, b.t1)); if (z <= a) continue;
      svg += `<rect x="${a}" y="${padT}" width="${z - a}" height="${ih}" fill="${b.color || "var(--grid)"}" opacity="${b.opacity ?? .55}"/>`;
      if (b.label) svg += `<text x="${a + 4}" y="${padT + 12}" style="font-size:10.5px">${esc(b.label)}</text>`;
    }
    const gy = o.int ? [0, 1, 2, 3, 4].map((k) => k * istep) : o.log ? [0, ...[10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9].filter((v) => v <= yMax)].filter((v, i, a) => a.length < 7 || i % 2 === 0 || i === 0) : [0, .25, .5, .75, 1].map((f) => yMin + f * (yMax - yMin));
    for (const v of gy) { const y = Y(v); svg += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${padL - 6}" y="${y + 3.5}" text-anchor="end">${esc(yf(v))}</text>`; }
    if (right.length) for (const f of [0, .5, 1]) svg += `<text x="${W - padR + 6}" y="${Y2(f * y2Max) + 3.5}">${esc(y2f(f * y2Max))}</text>`;
    const tk = ticksTime(t0, t1, Math.max(2, Math.floor(iw / 90)));
    for (const t of tk.ticks) svg += `<text x="${X(t)}" y="${H - 6}" text-anchor="middle">${esc(tk.fmt(t))}</text>`;
    for (const r of o.refs || []) { const y = Y(r.y); svg += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="${r.color || "var(--crit)"}" stroke-dasharray="4 4" opacity=".8"/>${r.label ? `<text x="${W - padR - 4}" y="${y - 4}" text-anchor="end" style="fill:${r.color || "var(--crit)"}">${esc(r.label)}</text>` : ""}`; }
    for (const s of series) {
      const yy = s.axis === "right" ? Y2 : Y, p = s.points.filter((q) => q[0] >= t0 && q[0] <= t1);
      if (!p.length) continue;
      if (s.type === "bars") {
        const bw = Math.max(1.5, (s.barW ? (s.barW / (t1 - t0)) * iw : iw / Math.max(60, p.length)) - 1);
        for (const q of p) { const y = yy(q[1] || 0); svg += `<rect x="${X(q[0])}" y="${y}" width="${bw}" height="${Math.max(0, padT + ih - y)}" fill="${s.color}" opacity="${s.opacity ?? .85}" rx="1"/>`; }
        continue;
      }
      let d = "";
      p.forEach((q, i) => {
        const x = X(q[0]).toFixed(1), y = yy(q[1] || 0).toFixed(1);
        const brk = !i || (s.gap && q[0] - p[i - 1][0] > s.gap);
        if (brk) d += `M${x},${y}`; else if (s.type === "step") d += `H${x}V${y}`; else d += `L${x},${y}`;
      });
      if (s.type === "area" && !s.gap) svg +=`<path d="${d}L${X(p[p.length - 1][0])},${padT + ih}L${X(p[0][0])},${padT + ih}Z" fill="${s.color}" opacity=".12"/>`;
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""}/>`;
      if (s.dots) for (const q of p) svg += `<circle cx="${X(q[0])}" cy="${yy(q[1] || 0)}" r="2.6" fill="${s.color}"/>`;
    }
    for (const m of o.markers || []) {
      if (m.t < t0 || m.t > t1) continue;
      const x = X(m.t);
      svg += `<g data-tip="${esc(m.tip || m.label || "")}"><line x1="${x}" x2="${x}" y1="${padT}" y2="${padT + ih}" stroke="${m.color || "var(--crit)"}" stroke-width="1.2" stroke-dasharray="2 3"/><circle cx="${x}" cy="${padT + 5}" r="4.5" fill="${m.color || "var(--crit)"}" stroke="var(--card)" stroke-width="1.5"/></g>`;
    }
    svg += `<line class="cross" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" stroke="var(--text-3)" stroke-width="1" opacity="0"/>`;
    svg += `<rect class="hit" x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
    el.innerHTML = svg;
    const hit = el.querySelector(".hit"), cross = el.querySelector(".cross");
    hit.addEventListener("mousemove", (e) => {
      const r = el.querySelector("svg").getBoundingClientRect(), t = t0 + ((e.clientX - r.left - padL) / iw) * (t1 - t0);
      cross.setAttribute("x1", e.clientX - r.left); cross.setAttribute("x2", e.clientX - r.left); cross.setAttribute("opacity", ".6");
      const rows = series.map((s) => {
        let best = null, bd = Infinity;
        for (const q of s.points) { const dd = Math.abs(q[0] - t); if (dd < bd) { bd = dd; best = q; } }
        const tol = o.tol ?? (t1 - t0) / 40;
        return best && bd <= tol ? `<div><span style="color:${s.color}">●</span> ${esc(s.name)}: <b>${esc((s.fmt || (s.axis === "right" ? y2f : yf))(best[1]))}</b></div>` : "";
      }).join("");
      tip(`<div style="opacity:.75;margin-bottom:3px">${esc((t1 - t0) > 86400 ? dateTime(t) : time(t))}</div>${rows || "<div>no data</div>"}`, e.clientX, e.clientY);
    });
    hit.addEventListener("mouseleave", () => { tip(null); cross.setAttribute("opacity", "0"); });
    bindTips(el);
  });
}

export function emptyState(text, h = 160) {
  return `<div style="height:${h}px;display:grid;place-items:center;color:var(--text-3);font-size:13px;text-align:center;padding:0 16px">${esc(text)}</div>`;
}

/** Donut: items [{label, value, color}] center {value, label} */
export function donut(el, items, o = {}) {
  mount(el, (W) => {
    const total = items.reduce((a, b) => a + (b.value || 0), 0), size = Math.min(o.size || 180, W);
    const R = size / 2 - 4, r = R * (o.hole ?? .66), cx = size / 2, cy = size / 2;
    let a = -Math.PI / 2, svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="margin:0 auto">`;
    if (!total) svg += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="var(--grid)" stroke-width="${R - r}"/>`;
    for (const it of items) {
      if (!it.value) continue;
      const f = it.value / total, b = a + f * Math.PI * 2 - (f < 1 ? .012 : 0);
      const large = b - a > Math.PI ? 1 : 0, p = (ang, rad) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
      const d = f >= .9999 ? `M${p(-Math.PI / 2, R)}A${R},${R} 0 1 1 ${p(-Math.PI / 2 - .0001, R)}L${p(-Math.PI / 2 - .0001, r)}A${r},${r} 0 1 0 ${p(-Math.PI / 2, r)}Z`
        : `M${p(a, R)}A${R},${R} 0 ${large} 1 ${p(b, R)}L${p(b, r)}A${r},${r} 0 ${large} 0 ${p(a, r)}Z`;
      svg += `<path d="${d}" fill="${it.color}" data-tip="<b>${esc(it.label)}</b>: ${it.value} (${Math.round(f * 100)}%)" style="cursor:default"/>`;
      a += f * Math.PI * 2;
    }
    if (o.center) svg += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" style="font-size:${size / 6.5}px;font-weight:700;fill:var(--text)">${esc(o.center.value)}</text><text x="${cx}" y="${cy + size / 9}" text-anchor="middle" style="font-size:11px">${esc(o.center.label)}</text>`;
    el.innerHTML = svg + "</svg>"; bindTips(el);
  });
}

/** Horizontal bars: items [{label, value, color, sub, tip}] */
export function hbars(el, items, o = {}) {
  const max = o.max ?? Math.max(1e-9, ...items.map((i) => Math.abs(i.value || 0)));
  if (!items.length) { el.innerHTML = emptyState(o.empty || "No data", o.emptyH || 120); return; }
  el.innerHTML = items.map((i) => `<div class="hb" ${i.tip ? `data-tip="${esc(i.tip)}"` : ""} style="display:grid;grid-template-columns:${o.labelW || "minmax(90px,38%)"} 1fr ${o.valW || "64px"};gap:10px;align-items:center;padding:5px 0">
    <div class="ellipsis small" title="${esc(i.label)}" style="color:var(--text)">${esc(i.label)}${i.sub ? `<div class="tiny faint ellipsis">${esc(i.sub)}</div>` : ""}</div>
    <div class="bar" style="height:${o.barH || 9}px"><i style="width:${Math.max(i.value ? 1.5 : 0, (Math.abs(i.value || 0) / max) * 100)}%;background:${i.color || "var(--blue)"}"></i></div>
    <div class="small right" style="font-variant-numeric:tabular-nums;font-weight:600">${esc(o.fmt ? o.fmt(i.value) : i.value)}</div></div>`).join("");
  bindTips(el);
}

/** Diverging bars around zero (SHAP contributions): positive pushes toward the alert, negative away. */
export function divBars(el, items, o = {}) {
  const max = Math.max(1e-9, ...items.map((i) => Math.abs(i.value)));
  el.innerHTML = items.map((i) => {
    const w = (Math.abs(i.value) / max) * 50, pos = i.value >= 0;
    return `<div data-tip="${esc(i.tip || `${i.label}: ${i.value}`)}" style="display:grid;grid-template-columns:minmax(120px,34%) 1fr 58px;gap:10px;align-items:center;padding:6px 0">
      <div class="small" style="font-weight:${i.strong ? 650 : 500}">${esc(i.label)}</div>
      <div style="position:relative;height:14px;background:linear-gradient(90deg,transparent calc(50% - .5px),var(--border-2) calc(50% - .5px),var(--border-2) calc(50% + .5px),transparent calc(50% + .5px))">
        <i style="position:absolute;top:1px;bottom:1px;border-radius:3px;${pos ? `left:50%` : `right:50%`};width:${Math.max(.5, w)}%;background:${pos ? "var(--crit)" : "var(--blue-2)"};opacity:${i.strong ? 1 : .8}"></i></div>
      <div class="small right mono" style="color:${pos ? "var(--crit)" : "var(--blue)"}">${i.value > 0 ? "+" : ""}${(+i.value).toFixed(3)}</div></div>`;
  }).join("") + `<div class="row between tiny faint" style="padding:4px 0 0 calc(34% + 10px);padding-right:68px"><span>← towards normal</span><span>towards alert →</span></div>`;
  bindTips(el);
}

/** Vertical columns for categories: items [{label, value, color, tip}] */
export function columns(el, items, o = {}) {
  mount(el, (W) => {
    const H = o.height || 180, padB = 34, padT = 16, max = niceMax(Math.max(1, ...items.map((i) => i.value || 0)));
    if (!items.length) { el.innerHTML = emptyState(o.empty || "No data", H); return; }
    const bw = Math.min(56, (W / items.length) * .6), gap = W / items.length;
    let svg = `<svg width="${W}" height="${H}">`;
    for (const f of [0, .5, 1]) { const y = padT + (H - padT - padB) * (1 - f); svg += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--grid)"/>`; }
    items.forEach((it, k) => {
      const h = ((it.value || 0) / max) * (H - padT - padB), x = gap * k + (gap - bw) / 2, y = H - padB - h;
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${it.color || "var(--blue)"}" data-tip="${esc(it.tip || `${it.label}: ${it.value}`)}"/>`;
      svg += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" style="font-weight:650;fill:var(--text)">${esc(o.fmt ? o.fmt(it.value) : it.value)}</text>`;
      svg += `<text x="${x + bw / 2}" y="${H - 18}" text-anchor="middle">${esc(it.label)}</text>${it.sub ? `<text x="${x + bw / 2}" y="${H - 5}" text-anchor="middle" style="font-size:10px;fill:var(--text-3)">${esc(it.sub)}</text>` : ""}`;
    });
    el.innerHTML = svg + "</svg>"; bindTips(el);
  });
}

/** Tiny sparkline (no axes). */
export function spark(values, { w = 120, h = 32, color = "var(--blue)", max } = {}) {
  if (!values.length) return `<svg width="${w}" height="${h}"></svg>`;
  const m = max ?? Math.max(1e-9, ...values), step = w / Math.max(1, values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - 2 - (v / m) * (h - 4)).toFixed(1)}`).join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}L${w},${h}L0,${h}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
}
