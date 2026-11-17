// System logs: event feed, gateway (PEP) log, quarantine store log and pipeline process logs, merged.
import { icon } from "../ui/icons.js";
import { pageHead, empty, banner } from "../ui/components.js";
import { esc, dateTime, time, csv, download } from "../core/fmt.js";
import { api } from "../core/api.js";
import * as D from "../core/derive.js";

export default {
  mount(el, params, ctx) {
    let data = null, err = null, auto = true, timer = null, open = new Set(), limit = 200;
    const f = { q: "", comp: "", level: "" };
    el.innerHTML = `${pageHead("System logs", "Logs of the VitalGate pipeline: response events, gateway enforcement, quarantine store and the replay/live/server processes. Secrets are redacted and no patient data is logged.",
      `<label class="row small" style="gap:8px"><span class="switch"><input type="checkbox" data-auto checked><span></span></span>Auto-refresh (5 s)</label><button class="btn" data-ref>${icon("refresh")}<span>Refresh</span></button><button class="btn" data-exp>${icon("download")}<span>Export</span></button>`)}
      <div data-err></div>
      <div class="card"><div class="toolbar">
        <div class="input-icon" style="flex:1;min-width:220px">${icon("search")}<input class="input" data-f="q" placeholder="Search text, device IP, incident ID"></div>
        <select class="input" data-f="comp"><option value="">All components</option></select>
        <div class="seg" data-lv>${[["", "All"], ["critical", "Critical"], ["error", "Error"], ["warning", "Warning"], ["info", "Info"]].map(([v, l]) => `<button data-v="${v}" class="${v === "" ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="small muted" data-n></span></div>
        <div class="log-row" style="cursor:default;background:var(--card-2);font-size:11px;font-weight:650;color:var(--text-2)"><span>TIME</span><span>COMPONENT</span><span>LEVEL</span><span>EVENT</span></div>
        <div data-list></div><div class="pager" data-more></div></div>`;
    const $ = (s) => el.querySelector(s);
    const load = async () => { try { data = await api.logs(); err = null; } catch (e) { err = e.message; } draw(); };
    const loop = () => { clearTimeout(timer); if (auto) timer = setTimeout(async () => { await load(); loop(); }, 5000); };
    load(); loop();
    $("[data-auto]").onchange = (e) => { auto = e.target.checked; loop(); };
    $("[data-ref]").onclick = async (e) => { e.currentTarget.classList.add("loading"); await load(); e.currentTarget.classList.remove("loading"); };
    el.querySelectorAll("[data-f]").forEach((i) => i.addEventListener("input", () => { f[i.dataset.f] = i.value; limit = 200; draw(); }));
    $("[data-lv]").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; el.querySelectorAll("[data-lv] button").forEach((x) => x.classList.toggle("on", x === b)); f.level = b.dataset.v; limit = 200; draw(); };
    $("[data-list]").onclick = (e) => { const r = e.target.closest("[data-i]"); if (!r || e.target.closest("a")) return; const k = r.dataset.k; open.has(k) ? open.delete(k) : open.add(k); draw(); };
    $("[data-more]").onclick = (e) => { if (e.target.closest("[data-morebtn]")) { limit += 300; draw(); } };
    let rows = [];
    $("[data-exp]").onclick = () => download(`vitalgate-logs-${Date.now()}.csv`, csv(rows, [{ label: "time", get: (r) => r.t ? new Date(r.t * 1000).toISOString() : "" }, { label: "component", get: (r) => r.component },
      { label: "level", get: (r) => r.level }, { label: "event", get: (r) => r.text }, { label: "device", get: (r) => r.host || "" }, { label: "incident", get: (r) => r.incident || "" }, { label: "source", get: (r) => r.source }]));
    function draw() {
      $("[data-err]").innerHTML = err ? banner("crit", `Could not load logs: ${esc(err)}`) : "";
      if (!data) { $("[data-list]").innerHTML = `<div class="skel" style="height:300px;margin:16px"></div>`; return; }
      const s = ctx.store.get(), comps = [...new Set(data.entries.map((e) => e.component))].sort(), cs = el.querySelector("[data-f=comp]");
      if (cs.dataset.n !== comps.join()) { cs.innerHTML = `<option value="">All components</option>${comps.map((c) => `<option>${esc(c)}</option>`).join("")}`; cs.dataset.n = comps.join(); cs.value = f.comp; }
      const q = f.q.toLowerCase();
      rows = data.entries.filter((e) => (!f.comp || e.component === f.comp) && (!f.level || e.level === f.level) && (!q || `${e.text} ${e.host || ""} ${e.incident || ""} ${e.source}`.toLowerCase().includes(q)));
      $("[data-n]").textContent = `${rows.length} entries`;
      $("[data-list]").innerHTML = rows.length ? rows.slice(0, limit).map((e, i) => { const k = `${e.source}|${e.t || e.file_time}|${i}|${(e.text || "").slice(0, 40)}`; return `<div class="log-row" data-i="${i}" data-k="${esc(k)}">
        <span class="mono small">${e.t ? esc(dateTime(e.t)) : `<span class="faint" title="process log line (file updated ${esc(dateTime(e.file_time))})">${esc(e.source)}</span>`}</span>
        <span class="small">${esc(e.component)}</span><span class="lv ${esc(e.level)}">${esc(e.level)}</span>
        <span><span class="small">${esc(e.text)}</span> ${e.host ? `<a class="tiny mono" href="#/devices/${esc(e.host)}">${esc((D.hostByIp(s, e.host) && D.shortName(D.hostByIp(s, e.host))) || e.host)}</a>` : ""} ${e.incident ? `<a class="tiny mono" href="#/incidents/${esc(e.incident)}">${esc(e.incident)}</a>` : ""}</span>
        ${open.has(k) ? `<div class="log-detail"><div class="code">source: ${esc(e.source)}\n${esc(JSON.stringify(e.detail || { line: e.text }, null, 2))}</div></div>` : ""}</div>`; }).join("")
        : empty("No log entries match", "Change the filters.", "logs");
      $("[data-more]").innerHTML = rows.length > limit ? `<span>Showing ${limit} of ${rows.length}</span><button class="btn sm" data-morebtn>Show more</button>` : `<span>${rows.length} shown · last refresh ${esc(time(data.server_time))}</span>`;
    }
    return { destroy: () => clearTimeout(timer) };
  },
};
