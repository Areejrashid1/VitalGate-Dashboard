// Main SOC dashboard.
import { icon } from "../ui/icons.js";
import { kpi, card, badge, lvl, statusBadge, pageHead, seg, bindSeg, empty } from "../ui/components.js";
import { timeChart, donut, hbars } from "../ui/charts.js";
import { Table } from "../ui/table.js";
import { esc, time, ago, bytes, num, pct, dur } from "../core/fmt.js";
import { prefs } from "../core/prefs.js";
import { conn } from "../core/store.js";
import * as D from "../core/derive.js";

export default {
  mount(el, params, ctx) {
    let range = ["1h", "6h", "24h", "7d"].includes(prefs.get("range")) ? prefs.get("range") : "1h";
    el.innerHTML = `
      ${pageHead("Security command center", "Real-time view of the hospital imaging network: devices, DICOM traffic, AI detections and the zero-trust response, straight from the VitalGate pipeline.",
        `<button class="btn" data-refresh>${icon("refresh")}<span>Refresh</span></button><a class="btn" href="#/how-it-works">${icon("route")}<span>How it works</span></a>`)}
      <div data-overview></div>
      <div class="kpis" data-kpis></div>
      <div class="grid g-21">
        ${card({ title: "Threat activity timeline", icon: "activity", sub: "2-second windows scored by the federated model, by data time", actions: seg("range", [["1h", "1 h"], ["6h", "6 h"], ["24h", "24 h"], ["7d", "7 d"]], range), body: `<div data-tl style="height:240px"></div><div class="row between wrap mt8"><div class="legend"><span><i class="line" style="background:var(--crit)"></i>Suspicious windows (score ≥ 0.5)</span><span><i class="line" style="background:var(--blue)"></i>Normal windows</span><span><i style="background:var(--crit);border-radius:50%"></i>Incident opened</span></div><div class="tiny faint" data-tlnote></div></div>` })}
        ${card({ title: "Device security status", icon: "devices", sub: "Current zero-trust level of every tracked device", body: `<div class="row top wrap" style="gap:18px"><div data-donut style="width:170px;flex:none"></div><div class="grow" data-donut-legend style="min-width:160px"></div></div>` })}
      </div>
      <div class="grid g-21 mt16">
        ${card({ title: "Recent security alerts", icon: "siren", sub: "Incidents raised by the detector (newest first)", actions: `<a class="btn sm" href="#/incidents">All incidents ${icon("arrowRight")}</a>`, bodyCls: "flush", body: `<div data-alerts></div>` })}
        ${card({ title: "Attack classification", icon: "target", sub: "Incidents by class predicted by the model / DPI rule", body: `<div data-cls></div>` })}
      </div>
      <div class="grid g3 mt16">
        ${card({ title: "Network activity", icon: "activity", sub: "DICOM bytes between devices and the PACS (all devices)", body: `<div data-net style="height:180px"></div><div class="grid g2 mt12" data-netstats></div>` })}
        ${card({ title: "System health", icon: "server", sub: "Pipeline components", bodyCls: "flush", body: `<div data-health></div>` })}
        ${card({ title: "Recent activity", icon: "clock", sub: "Event feed from the response engine and gateway", actions: `<a class="btn sm" href="#/logs">Logs</a>`, bodyCls: "flush", body: `<div data-activity style="max-height:330px;overflow:auto"></div>` })}
      </div>`;
    const $ = (s) => el.querySelector(s);
    $("[data-refresh]").onclick = async (e) => { e.currentTarget.classList.add("loading"); await ctx.store.refresh(); e.currentTarget.classList.remove("loading"); };
    bindSeg(el, "range", (v) => { range = v; prefs.set("range", v); draw(ctx.store.get()); });
    const alerts = new Table($("[data-alerts]"), [
      { key: "name", label: "Device", get: (i) => i.name, html: (i) => `<div style="font-weight:600" class="ellipsis">${esc(D.shortName(i))}</div><div class="tiny faint mono">${esc(i.host)}</div>` },
      { key: "cls", label: "Attack category", get: (i) => D.clsLabel(i.cls), html: (i) => `<span class="small">${esc(D.clsLabel(i.cls))}</span>` },
      { key: "severity", label: "Severity", get: (i) => ({ high: 3, medium: 2, low: 1 }[i.severity]), html: (i) => D.sevTone ? `<span class="badge ${D.sevTone(i.severity)}">${esc(i.severity)}</span>` : "" },
      { key: "opened", label: "Detected", get: (i) => i.opened, html: (i) => `<span class="small nowrap">${esc(time(i.opened))}</span>` },
      { key: "conf", label: "Confidence", num: true, get: (i) => D.confidence(i), html: (i) => esc(pct(D.confidence(i))) },
      { key: "level", label: "Response", get: (i) => i.max_level, html: (i) => `${i.status === "active" ? lvl(i.level) : `<span class="badge mute">closed</span>`}<div class="tiny faint">max L${i.max_level}</div>` },
    ], { pageSize: 6, sortKey: "opened", onRow: (i) => ctx.nav(`incidents/${i.id}`), empty: "No alerts yet", emptySub: "Incidents appear here when the detector raises an alarm.", emptyIcon: "shieldCheck" });

    function draw(s) {
      if (!s) return;
      const t = D.now(s), m = D.mode(s), p = D.pipeline(s), hosts = D.devices(s), incs = s.incidents || [];
      const active = incs.filter((i) => i.status === "active"), sys = s.system || {};
      // ---- overview banner
      const worst = Math.max(0, ...hosts.map((h) => h.level || 0));
      const st = active.length ? (worst >= 3 ? ["crit", "Active threat — devices contained", "shieldAlert"] : ["warn", "Suspicious activity under watch", "alert"]) : ["ok", "Network secure — no active threats", "shieldCheck"];
      $("[data-overview]").innerHTML = `<div class="card" style="padding:16px 18px;margin-bottom:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:linear-gradient(100deg,var(--card) 60%,var(--blue-soft))">
        <div style="width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:var(--${st[0] === "ok" ? "ok" : st[0] === "warn" ? "warn" : "crit"}-soft);color:var(--${st[0] === "ok" ? "ok" : st[0] === "warn" ? "warn" : "crit"})">${icon(st[2])}</div>
        <div class="grow"><div style="font-size:17px;font-weight:700">${st[1]}</div>
          <div class="small muted">${active.length} active incident${active.length === 1 ? "" : "s"} · ${hosts.filter((h) => h.status === "online").length} of ${hosts.length} devices online · worst current level ${lvl(worst)}</div></div>
        <div class="row wrap" style="gap:18px">
          <div><div class="tiny muted">Monitoring</div><div class="row small" style="font-weight:600"><span class="dot ${p.tone} ${p.state === "running" ? "pulse" : ""}"></span>${esc(p.label)}</div></div>
          <div><div class="tiny muted">Mode</div><div class="small" style="font-weight:600">${m === "live" ? "Live test bed (gateway enforcing)" : m === "replay" ? "Replay of recorded traffic" : "—"}</div></div>
          <div><div class="tiny muted">Data clock</div><div class="small" style="font-weight:600">${esc(time(t))}</div></div>
        </div></div>`;
      // ---- KPIs
      const tt = D.trafficTotals(s, 60), seen = hosts.filter((h) => h.windows > 0), online = hosts.filter((h) => h.status === "online");
      const opened15 = incs.filter((i) => i.opened > t - 900).length, prev15 = incs.filter((i) => i.opened > t - 1800 && i.opened <= t - 900).length;
      const quar = hosts.filter((h) => h.level === 3).length, iso = hosts.filter((h) => h.level === 4).length;
      const trendTraffic = tt.prev ? ((tt.total - tt.prev) / tt.prev) : null;
      $("[data-kpis]").innerHTML = [
        kpi({ label: "Total connected devices", value: hosts.length, icon: "devices", foot: `${hosts.filter((h) => h.registered).length} in asset inventory · ${hosts.filter((h) => !h.registered).length} unregistered`, tip: "Devices the pipeline tracks: the asset inventory plus any unregistered device that talked to the PACS." }),
        kpi({ label: "Active devices", value: online.length, icon: "wifi", tone: "ok", foot: `traffic in the last 60 s · ${hosts.filter((h) => h.status === "idle").length} idle · ${hosts.filter((h) => h.status === "offline").length} offline` }),
        kpi({ label: "Devices under monitoring", value: seen.length, icon: "radio", foot: `scored by the sensor · ${hosts.filter((h) => (h.level || 0) >= 1).length} at L1+ now` }),
        kpi({ label: "Active threats", value: active.length, icon: "shieldAlert", tone: active.length ? "crit" : "ok", trend: { cls: opened15 > prev15 ? "up-bad" : opened15 < prev15 ? "down-good" : "flat", icon: opened15 > prev15 ? "arrowUp" : opened15 < prev15 ? "arrowDown" : "", text: `${opened15} new / 15 min` }, foot: "" }),
        kpi({ label: "Attacks detected", value: incs.length, icon: "siren", tone: "orange", foot: `incidents this ${m === "live" ? "live run" : "replay"} · ${incs.filter((i) => D.feedbackOf(s, i.id).verdict === "true_attack").length} confirmed by analysts` }),
        kpi({ label: "Quarantined devices", value: quar, icon: "archive", tone: quar || iso ? "orange" : "", foot: `L3 quarantine · ${iso} isolated (L4)` }),
        kpi({ label: "Network traffic", value: bytes(tt.total), icon: "activity", foot: `last 60 s of data time`, trend: trendTraffic == null ? null : { cls: "neutral", icon: trendTraffic >= 0 ? "arrowUp" : "arrowDown", text: `${Math.abs(trendTraffic * 100).toFixed(0)}% vs prev. min` } }),
        m === "live" && sys.model && sys.model.score_ms != null
          ? kpi({ label: "Detection latency", value: num(sys.model.score_ms, 1), unit: "ms / window", icon: "zap", foot: `model scoring time · windows wait ${sys.sensor?.flush_lag_s ?? "?"} s for late packets`, tip: "Measured live: time to score one 2-second window (features → model → CUSUM)." })
          : kpi({ label: "Detection latency", value: null, unavailable: "Live mode only", icon: "zap", foot: "Replay replays recorded time; live scoring latency is measured in live mode" }),
      ].join("");
      // ---- timeline
      const span = D.RANGES[range], t0 = t - span, n = Math.min(180, Math.max(30, Math.floor($("[data-tl]").clientWidth / 5)));
      const wins = D.windowsAll(s).filter((w) => w.t >= t0);
      const bk = D.bucketize(wins, t0, t, n), cov = D.seriesCoverage(s);
      const sus = bk.map((b) => [b.t, b.items.filter((w) => w.score >= .5 || w.alarm).length]);
      const nor = bk.filter((b) => cov != null && b.t >= cov).map((b) => [b.t, b.items.filter((w) => w.score < .5 && !w.alarm).length]);
      timeChart($("[data-tl]"), [
        { name: "Normal windows", color: "var(--blue)", points: nor, type: "area" },
        { name: "Suspicious windows", color: "var(--crit)", points: sus, type: "area" },
      ], { t0, t1: t, height: 240, yFmt: (v) => Math.round(v), int: true, tol: span / n,
        markers: incs.filter((i) => i.opened >= t0).map((i) => ({ t: i.opened, color: i.severity === "high" ? "var(--crit)" : "var(--orange)", tip: `<b>${esc(i.id)}</b> ${esc(D.clsLabel(i.cls))}<br>${esc(D.shortName(i))}` })),
        bands: cov != null && cov > t0 ? [{ t0, t1: cov, label: "normal-window history not retained", opacity: .5 }] : [] });
      $("[data-tlnote]").textContent = cov != null && cov > t0 ? `Normal windows are kept for the last ${dur(t - cov)} per device; suspicious windows for the whole run.` : `${num(wins.length)} windows in range`;
      // ---- donut
      const counts = [0, 1, 2, 3, 4].map((L) => hosts.filter((h) => (h.level || 0) === L).length);
      donut($("[data-donut]"), D.LEVELS.map((L, k) => ({ label: `${D.STATUS[D.secStatus(k)].label} (L${k})`, value: counts[k], color: L.color })), { size: 170, center: { value: hosts.length, label: "devices" } });
      $("[data-donut-legend]").innerHTML = D.LEVELS.map((L, k) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="row small"><i class="dot" style="background:${L.color}"></i>${D.STATUS[D.secStatus(k)].label} <span class="faint">L${k} ${L.name}</span></span><b>${counts[k]}</b></div>`).join("")
        + `<div class="row between small" style="padding:8px 0 0"><span class="muted">Not seen / offline</span><b>${hosts.filter((h) => h.status === "offline" || h.status === "not seen").length}</b></div>`;
      // ---- alerts
      alerts.set([...incs].reverse());
      // ---- classes
      const by = {}; incs.forEach((i) => { by[i.cls] = (by[i.cls] || 0) + 1; });
      hbars($("[data-cls]"), Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ label: D.clsLabel(c), value: v, color: D.CLASS_COLORS[c] || "var(--blue)", tip: `${D.clsLabel(c)}: ${v} incident${v === 1 ? "" : "s"}` })), { empty: "No incidents yet", labelW: "minmax(110px,46%)", valW: "30px" });
      // ---- network
      const nb = D.bucketize(D.windowsAll(s).filter((w) => w.out != null && w.t >= t - 300), t - 300, t, 60);
      timeChart($("[data-net]"), [
        { name: "Device → PACS", color: "var(--blue)", points: nb.map((b) => [b.t, b.items.reduce((a, w) => a + w.out, 0) / 5]), type: "area", fmt: (v) => `${bytes(v)}/s` },
        { name: "PACS → device", color: "var(--c2)", points: nb.map((b) => [b.t, b.items.reduce((a, w) => a + w.inb, 0) / 5]), type: "line", fmt: (v) => `${bytes(v)}/s` },
      ], { t0: t - 300, t1: t, height: 180, yFmt: (v) => bytes(v), padL: 56, empty: "No traffic in the last 5 minutes" });
      $("[data-netstats]").innerHTML = `<div class="stat-mini"><span>Device → PACS (60 s)</span><b>${bytes(tt.out)}</b></div><div class="stat-mini"><span>PACS → device (60 s)</span><b>${bytes(tt.inb)}</b></div>`;
      // ---- health
      const sens = sys.sensor || {}, model = sys.model || {}, pep = sys.pep || {}, lastPacs = Math.max(0, ...hosts.map((h) => h.last_seen || 0));
      const H = [
        ["radio", "Network sensor", m === "live" ? (sens.packet_age_s != null && sens.packet_age_s < 10 ? ["ok", `capturing · ${num(sens.packets)} packets`] : ["crit", `no packets for ${dur(sens.packet_age_s)}`]) : p.state === "running" ? ["ok", `replaying ${sens.pcaps || "?"} captures · ${num(sens.windows)} windows`] : ["warn", `replay ${p.state === "none" ? "not started" : "finished"}`]],
        ["cpu", "Detection model", model.bundle ? ["ok", `bundle ${model.bundle} · ${model.updates} updates · ${model.features} features`] : ["crit", "no model status"]],
        ["shield", "Gateway (PEP)", m === "live" ? (pep.mode === "enforcing" ? [pep.controller_age_s != null && pep.controller_age_s < 10 ? "ok" : "warn", `enforcing · controller ${num(pep.controller_age_s, 1)} s ago`] : ["crit", pep.note || pep.mode || "not running"]) : ["info", "simulated in replay (commands rendered, not executed)"]],
        ["database", "PACS connectivity", lastPacs ? (t - lastPacs < 60 ? ["ok", `DICOM traffic ${ago(lastPacs, t)}`] : ["warn", `last DICOM traffic ${ago(lastPacs, t)}`]) : ["mute", "no traffic seen yet"]],
        ["archive", "Quarantine service", m === "live" ? (pep.quarantine ? ["ok", `${pep.quarantine.held} held · ${pep.quarantine.released} released · ${pep.quarantine.blocked} blocked`] : ["warn", "no report from the store"]) : ["info", "used in live mode only"]],
        ["wifi", "Console server", conn.server === "online" ? ["ok", "connected"] : ["crit", conn.server]],
      ];
      $("[data-health]").innerHTML = H.map(([ic, name, [tone, txt]]) => `<div class="health"><div class="hic">${icon(ic)}</div><div class="grow"><div style="font-weight:600" class="small">${name}</div><div class="tiny muted ellipsis">${esc(txt)}</div></div><span class="dot ${tone}"></span></div>`).join("");
      // ---- activity
      const ev = (s.events || []).slice(0, 25);
      $("[data-activity]").innerHTML = ev.length ? `<div class="list">${ev.map((e) => `<div class="li click" data-go="${e.incident ? `incidents/${esc(e.incident)}` : e.host ? `devices/${esc(e.host)}` : ""}"><div class="lic ${D.eventTone(e)}">${icon(D.eventIcon(e))}</div><div class="grow"><div class="small" style="font-weight:600">${esc(D.EVENT_LABEL[e.kind] || e.kind)}</div><div class="tiny muted">${esc(e.text)}</div></div><div class="tiny faint nowrap">${esc(time(e.t))}</div></div>`).join("")}</div>` : empty("No activity yet", "Events from the response engine appear here.", "clock");
      el.querySelectorAll("[data-go]").forEach((x) => x.onclick = () => x.dataset.go && ctx.nav(x.dataset.go));
    }
    return { update: (s) => draw(s) };
  },
};
