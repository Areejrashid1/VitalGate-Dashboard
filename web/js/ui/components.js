// Shared building blocks for pages (return HTML strings).
import { icon } from "./icons.js";
import { esc } from "../core/fmt.js";
import { LEVELS, STATUS, CONN, secStatus } from "../core/derive.js";

export function card({ title, icon: ic, sub = "", actions = "", body = "", id = "", cls = "", bodyCls = "" }) {
  return `<section class="card ${cls}" ${id ? `id="${id}"` : ""}>${title ? `<div class="card-h"><div><h2>${ic ? icon(ic) : ""}${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${actions ? `<div class="row wrap">${actions}</div>` : ""}</div>` : ""}<div class="card-b ${bodyCls}">${body}</div></section>`;
}
/** KPI tile. value null -> "waiting for data" state. */
export function kpi({ label, value, unit = "", icon: ic, tone = "", foot = "", trend = null, unavailable = "", tip = "" }) {
  const t = trend ? `<span class="trend ${trend.cls}">${trend.icon ? icon(trend.icon) : ""}${esc(trend.text)}</span>` : "";
  return `<div class="card kpi tone-${tone} ${value == null ? "unavail" : ""}" ${tip ? `data-tip="${esc(tip)}"` : ""}><div class="kic">${icon(ic)}</div><div class="grow">
    <div class="klabel">${esc(label)}</div><div class="kval">${value == null ? esc(unavailable || "Waiting for data") : `${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ""}`}</div>
    <div class="kfoot">${t}${foot}</div></div></div>`;
}
export const badge = (text, tone = "mute", ic = "") => `<span class="badge ${tone}">${ic ? icon(ic) : ""}${esc(text)}</span>`;
export const lvl = (n, withName = true) => { const L = LEVELS[n | 0] || LEVELS[0]; return `<span class="lvl l${L.n}">L${L.n}${withName ? ` ${L.name}` : ""}</span>`; };
export function statusBadge(level) { const k = secStatus(level), s = STATUS[k]; return `<span class="badge ${s.tone}"><span class="dot ${s.tone}"></span>${s.label}</span>`; }
export function connBadge(st) { const c = CONN[st] || CONN["not seen"]; return `<span class="badge ${c.tone === "mute" ? "mute" : c.tone}"><span class="dot ${c.tone} ${st === "online" ? "pulse" : ""}"></span>${c.label}</span>`; }
export function empty(title, sub = "", ic = "info") { return `<div class="empty"><div class="eic">${icon(ic)}</div><b>${esc(title)}</b>${sub ? `<div class="small">${sub}</div>` : ""}</div>`; }
export const research = (txt = "Research result · measured offline") => `<span class="tag-research">${icon("file")}${esc(txt)}</span>`;
export function banner(kind, html, ic) { return `<div class="banner ${kind}">${icon(ic || (kind === "info" ? "info" : "alert"))}<div>${html}</div></div>`; }
export function pageHead(title, sub, actions = "") { return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${actions ? `<div class="row wrap no-print">${actions}</div>` : ""}</div>`; }
export function seg(name, options, value) { return `<div class="seg" data-seg="${name}" role="tablist">${options.map(([v, l, dis]) => `<button data-v="${v}" class="${v === value ? "on" : ""}" ${dis ? "disabled" : ""}>${esc(l)}</button>`).join("")}</div>`; }
export function bindSeg(root, name, fn) {
  root.querySelector(`[data-seg="${name}"]`)?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]"); if (!b || b.disabled) return;
    b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); fn(b.dataset.v);
  });
}
/** Mode notice for data that only exists in live mode. */
export function liveOnly(m, what) {
  return m === "live" ? "" : banner("info", `<b>${esc(what)} comes from the live gateway.</b> You are in ${m === "replay" ? "replay mode (recorded traffic, gateway commands are simulated and not executed)" : "no-data mode"}. Start live mode (<code>start.cmd live</code>) with the Docker test bed to see real enforcement.`, "info");
}
