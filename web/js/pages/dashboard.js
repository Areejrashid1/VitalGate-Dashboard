// Main SOC dashboard: a calm overview. Details live on the other pages.
import { icon } from "../ui/icons.js";
import { kpi, card, lvl, seg, bindSeg, empty } from "../ui/components.js";
import { timeChart, donut, hbars } from "../ui/charts.js";
import { Table } from "../ui/table.js";
import { esc, time, ago, bytes, num } from "../core/fmt.js";
import { prefs } from "../core/prefs.js";
import { conn } from "../core/store.js";
import * as D from "../core/derive.js";

export default {
  mount(el, params, ctx) {
    let range = ["1h", "6h", "24h", "7d"].includes(prefs.get("range")) ? prefs.get("range") : "1h";
    el.innerHTML = `
      <div data-overview></div>
      <div class="kpis" data-kpis></div>
      <div class="grid g-21">
        ${card({ title: "Threat activity", icon: "activity", actions: seg("range", [["1h", "1 h"], ["6h", "6 h"], ["24h", "24 h"], ["7d", "7 d"]], range), body: `<div data-tl style="height:230px"></div><div class="legend mt8"><span><i class="line" style="background:var(--crit)"></i>Suspicious</span><span><i class="line" style="background:var(--blue)"></i>Normal</span><span><i style="background:var(--crit);border-radius:50%"></i>Incident</span></div>` })}
        ${card({ title: "Device status", icon: "devices", body: `<div data-donut style="max-width:180px;margin:0 auto"></div><div data-donut-legend class="mt12"></div>` })}
      </div>
      <div class="grid g-21 mt16">
        ${card({ title: "Recent alerts", icon: "siren", actions: `<a class="btn sm" href="#/incidents">View all ${icon("arrowRight")}</a>`, bodyCls: "flush", body: `<div data-alerts></div>` })}
        ${card({ title: "Attack types", icon: "target", body: `<div data-cls></div>` })}
      </div>
      <div class="grid g3 mt16">
        ${card({ title: "DICOM traffic", icon: "activity", sub: "Last 5 minutes", body: `<div data-net style="height:170px"></div>` })}
        ${card({ title: "System health", icon: "server", bodyCls: "flush", body: `<div data-health></div>` })}
        ${card({ title: "Recent activity", icon: "clock", actions: `<a class="btn sm" href="#/logs">Logs</a>`, bodyCls: "flush", body: `<div data-activity></div>` })}
      </div>`;
    const $ = (s) => el.querySelector(s);
    bindSeg(el, "range", (v) => { range = v; prefs.set("range", v); draw(ctx.store.get()); });
    const alerts = new Table($("[data-alerts]"), [
      { key: "name", label: "Device", get: (i) => i.name, html: (i) => `<b class="small">${esc(D.shortName(i))}</b>` },
      { key: "cls", label: "Attack", get: (i) => D.clsShort(i.cls), html: (i) => `<span class="small">${esc(D.clsShort(i.cls))}</span>` },
      { key: "severity", label: "Severity", get: (i) => ({ high: 3, medium: 2, low: 1 }[i.severity]), html: (i) => `<span class="badge ${D.sevTone(i.severity)}">${esc(i.severity)}</span>` },
      { key: "opened", label: "Time", get: (i) => i.opened, html: (i) => `<span class="small muted nowrap">${esc(time(i.opened))}</span>` },
      { key: "level", label: "Response", get: (i) => i.status === "active" ? i.level : -1, html: (i) => i.status === "active" ? lvl(i.level) : `<span class="small faint">closed</span>` },
    ], { pageSize: 5, sortKey: "opened", onRow: (i) => ctx.nav(`incidents/${i.id}`), empty: "No alerts yet", emptyIcon: "shieldCheck" });

    function draw(s) {
      if (!s) return;
      const t = D.now(s), m = D.mode(s), p = D.pipeline(s), hosts = D.devices(s), incs = s.incidents || [];
      const active = incs.filter((i) => i.status === "active"), sys = s.system || {};
      // ---- status strip
      const worst = Math.max(0, ...hosts.map((h) => h.level || 0));
      const [tone, title, ic] = active.length ? (worst >= 3 ? ["crit", "Active threat contained", "shieldAlert"] : ["warn", "Suspicious activity under watch", "alert"]) : ["ok", "All clear: no active threats", "shieldCheck"];
      $("[data-overview]").innerHTML = `<div class="card" style="padding:16px 18px;margin-bottom:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <div class="ovi" style="width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:var(--${tone}-soft);color:var(--${tone})">${icon(ic)}</div>
        <div class="grow"><div style="font-size:17px;font-weight:700">${title}</div>
          <div class="small muted">${m === "live" ? "Live test bed" : m === "replay" ? "Replay of recorded traffic" : "No data"} · ${esc(p.label.toLowerCase())}</div></div>
        <button class="btn sm" data-refresh>${icon("refresh")}<span>Refresh</span></button></div>`;
      $("[data-refresh]").onclick = async (e) => { const b = e.currentTarget; b.classList.add("loading"); await ctx.store.refresh(); b.classList.remove("loading"); };
      // ---- 4 key numbers
      const tt = D.trafficTotals(s, 60), online = hosts.filter((h) => h.status === "online").length;
      const contained = hosts.filter((h) => (h.level || 0) >= 3).length;
      $("[data-kpis]").innerHTML = [
        kpi({ label: "Devices online", value: `${online}`, unit: `/ ${hosts.length}`, icon: "devices", tone: "ok" }),
        kpi({ label: "Active threats", value: active.length, icon: "shieldAlert", tone: active.length ? "crit" : "ok", foot: `${incs.length} detected this run` }),
        kpi({ label: "Quarantined / isolated", value: contained, icon: "archive", tone: contained ? "orange" : "" }),
        kpi({ label: "DICOM traffic", value: bytes(tt.total), icon: "activity", foot: "last 60 s" }),
      ].join("");
      // ---- timeline
      const span = D.RANGES[range], t0 = t - span, n = Math.min(160, Math.max(30, Math.floor($("[data-tl]").clientWidth / 6)));
      const wins = D.windowsAll(s).filter((w) => w.t >= t0), bk = D.bucketize(wins, t0, t, n), cov = D.seriesCoverage(s);
      timeChart($("[data-tl]"), [
        { name: "Normal", color: "var(--blue)", points: bk.filter((b) => cov != null && b.t >= cov).map((b) => [b.t, b.items.filter((w) => w.score < .5 && !w.alarm).length]), type: "area" },
        { name: "Suspicious", color: "var(--crit)", points: bk.map((b) => [b.t, b.items.filter((w) => w.score >= .5 || w.alarm).length]), type: "area" },
      ], { t0, t1: t, height: 230, yFmt: (v) => Math.round(v), int: true, tol: span / n,
        markers: incs.filter((i) => i.opened >= t0).map((i) => ({ t: i.opened, color: "var(--crit)", tip: `<b>${esc(i.id)}</b> ${esc(D.clsLabel(i.cls))}<br>${esc(D.shortName(i))}` })) });
      // ---- device status donut
      const counts = [0, 1, 2, 3, 4].map((L) => hosts.filter((h) => (h.level || 0) === L).length);
      donut($("[data-donut]"), D.LEVELS.map((L, k) => ({ label: D.STATUS[D.secStatus(k)].label, value: counts[k], color: L.color })), { size: 170, center: { value: hosts.length, label: "devices" } });
      $("[data-donut-legend]").innerHTML = D.LEVELS.map((L, k) => counts[k] ? `<div class="row between small" style="padding:4px 0"><span class="row"><i class="dot" style="background:${L.color}"></i>${D.STATUS[D.secStatus(k)].label}</span><b>${counts[k]}</b></div>` : "").join("");
      // ---- alerts + types
      alerts.set([...incs].reverse().slice(0, 5));
      const by = {}; incs.forEach((i) => { by[i.cls] = (by[i.cls] || 0) + 1; });
      hbars($("[data-cls]"), Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ label: D.clsShort(c), value: v, color: D.CLASS_COLORS[c] || "var(--blue)" })), { empty: "No incidents yet", labelW: "minmax(100px,45%)", valW: "28px" });
      // ---- traffic
      const nb = D.bucketize(D.windowsAll(s).filter((w) => w.out != null && w.t >= t - 300), t - 300, t, 60);
      timeChart($("[data-net]"), [
        { name: "To PACS", color: "var(--blue)", points: nb.map((b) => [b.t, b.items.reduce((a, w) => a + w.out, 0) / 5]), type: "area", fmt: (v) => `${bytes(v)}/s` },
        { name: "From PACS", color: "var(--c2)", points: nb.map((b) => [b.t, b.items.reduce((a, w) => a + w.inb, 0) / 5]), type: "line", fmt: (v) => `${bytes(v)}/s` },
      ], { t0: t - 300, t1: t, height: 170, yFmt: (v) => bytes(v), padL: 56, empty: "No traffic in the last 5 minutes" });
      // ---- health (name + one dot)
      const sens = sys.sensor || {}, pep = sys.pep || {}, lastPacs = Math.max(0, ...hosts.map((h) => h.last_seen || 0));
      const H = [
        ["radio", "Sensor", m === "live" ? (sens.packet_age_s != null && sens.packet_age_s < 10 ? "ok" : "crit") : p.state === "running" ? "ok" : "warn", m === "live" ? `${num(sens.packets)} packets` : p.state === "running" ? "replaying" : "stopped"],
        ["cpu", "AI model", sys.model && sys.model.bundle ? "ok" : "crit", sys.model && sys.model.bundle ? "loaded" : "not loaded"],
        ["shield", "Gateway", m === "live" ? (pep.mode === "enforcing" ? "ok" : "crit") : "info", m === "live" ? (pep.mode || "not running") : "simulated"],
        ["database", "PACS", lastPacs && t - lastPacs < 60 ? "ok" : "warn", lastPacs ? ago(lastPacs, t) : "no traffic"],
        ["wifi", "Console", conn.server === "online" ? "ok" : "crit", conn.server],
      ];
      $("[data-health]").innerHTML = H.map(([ic, name, tn, txt]) => `<div class="health"><div class="hic">${icon(ic)}</div><b class="small grow">${name}</b><span class="tiny muted">${esc(txt)}</span><span class="dot ${tn}"></span></div>`).join("");
      // ---- activity (latest 6)
      const ev = (s.events || []).slice(0, 6);
      $("[data-activity]").innerHTML = ev.length ? `<div class="list">${ev.map((e) => `<div class="li click" data-go="${e.incident ? `incidents/${esc(e.incident)}` : e.host ? `devices/${esc(e.host)}` : ""}"><div class="lic ${D.eventTone(e)}">${icon(D.eventIcon(e))}</div><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(D.EVENT_LABEL[e.kind] || e.kind)}</div><div class="tiny muted ellipsis">${esc(e.name || e.host || "")}</div></div><div class="tiny faint nowrap">${esc(time(e.t))}</div></div>`).join("")}</div>` : empty("No activity yet", "", "clock");
      el.querySelectorAll("[data-go]").forEach((x) => x.onclick = () => x.dataset.go && ctx.nav(x.dataset.go));
    }
    return { update: (s) => draw(s) };
  },
};
