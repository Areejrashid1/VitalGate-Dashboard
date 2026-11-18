// Medical devices: card grid / table of every tracked DICOM device + a full device profile.
import { icon } from "../ui/icons.js";
import { card, badge, lvl, statusBadge, connBadge, pageHead, seg, bindSeg, empty, banner } from "../ui/components.js";
import { deviceArt } from "../ui/devices.js";
import { timeChart, spark } from "../ui/charts.js";
import { Table } from "../ui/table.js";
import { esc, time, ago, bytes, num, pct, dateTime, dur, csv, download } from "../core/fmt.js";
import { prefs } from "../core/prefs.js";
import { api } from "../core/api.js";
import * as D from "../core/derive.js";

const LEVEL_SORT = (h) => -(h.level || 0);
export default {
  mount(el, params, ctx) { return params[0] ? profile(el, params[0], ctx) : list(el, ctx); },
};

function list(el, ctx) {
  let view = prefs.get("deviceView") || "grid", q = "", fStatus = "all", fConn = "all", sortBy = "level";
  el.innerHTML = `${pageHead("Medical imaging devices", "Every DICOM device the VitalGate sensor watches on the PACS network, with its connection, AI threat score and current zero-trust level. Device types come from the test-bed asset inventory.",
    `<button class="btn" data-export>${icon("download")}<span>Export CSV</span></button>${seg("view", [["grid", "Cards"], ["table", "Table"]], view)}`)}
    <div class="card" style="margin-bottom:16px"><div class="toolbar" style="border:0">
      <div class="input-icon grow" style="max-width:340px">${icon("search")}<input class="input" data-q placeholder="Search name, IP, AE title, modality" aria-label="Search devices"></div>
      <select class="input" data-status aria-label="Security status"><option value="all">All security states</option>${Object.entries(D.STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select>
      <select class="input" data-conn aria-label="Connection"><option value="all">Any connection</option>${Object.entries(D.CONN).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select>
      <select class="input" data-sort aria-label="Sort by"><option value="level">Sort: threat level</option><option value="score">Sort: threat score</option><option value="name">Sort: name</option><option value="ip">Sort: IP address</option><option value="last">Sort: last communication</option><option value="alarms">Sort: alarms</option></select>
      <span class="small muted" data-n style="margin-left:auto"></span></div>
</div>
    <div data-list></div>
    <h2 class="mb12" style="margin-top:22px;font-size:15px">Infrastructure</h2><div class="dev-grid" data-infra></div>`;
  const $ = (s) => el.querySelector(s);
  const table = new Table(document.createElement("div"), [
    { key: "name", label: "Device", get: (h) => h.name, html: (h) => `<div class="row"><div style="width:54px;height:36px">${deviceArt(D.deviceKind(h).kind)}</div><div><b class="small">${esc(D.shortName(h))}</b><div class="tiny faint">${esc(D.deviceKind(h).label)}</div></div></div>` },
    { key: "ip", label: "IP address", get: (h) => h.ip.split(".").map((x) => x.padStart(3, "0")).join("."), html: (h) => `<span class="mono">${esc(h.ip)}</span>` },
    { key: "ae", label: "AE title", get: (h) => D.aeTitle(h), html: (h) => `<span class="mono small">${esc(D.aeTitle(h) || "—")}</span>` },
    { key: "mod", label: "Modality", get: (h) => D.deviceKind(h).modality },
    { key: "status", label: "Connection", get: (h) => h.status, html: (h) => connBadge(h.status) },
    { key: "level", label: "Security", get: (h) => h.level, html: (h) => statusBadge(h.level) },
    { key: "score", label: "Threat score", num: true, get: (h) => h.last_score, html: (h) => `<b style="color:${h.last_score >= .5 ? "var(--crit)" : "inherit"}">${num(h.last_score, 2)}</b>` },
    { key: "last", label: "Last communication", get: (h) => h.last_seen, html: (h) => `<span class="small">${esc(h.last_seen ? ago(h.last_seen, D.now(ctx.store.get())) : "never")}</span>` },
    { key: "inc", label: "Incidents", num: true, get: (h) => h.incidents },
  ], { pageSize: 25, sortKey: "level", onRow: (h) => ctx.nav(`devices/${h.ip}`), empty: "No devices match the filters" });
  $("[data-q]").oninput = (e) => { q = e.target.value.toLowerCase(); draw(ctx.store.get()); };
  $("[data-status]").onchange = (e) => { fStatus = e.target.value; draw(ctx.store.get()); };
  $("[data-conn]").onchange = (e) => { fConn = e.target.value; draw(ctx.store.get()); };
  $("[data-sort]").onchange = (e) => { sortBy = e.target.value; draw(ctx.store.get()); };
  bindSeg(el, "view", (v) => { view = v; prefs.set("deviceView", v); draw(ctx.store.get()); });
  $("[data-export]").onclick = () => {
    const s = ctx.store.get(); if (!s) return;
    download(`vitalgate-devices-${Date.now()}.csv`, csv(D.devices(s), [
      { label: "name", get: (h) => h.name }, { label: "ip", get: (h) => h.ip }, { label: "ae_title", get: (h) => D.aeTitle(h) }, { label: "modality", get: (h) => D.deviceKind(h).modality },
      { label: "role", get: (h) => h.role }, { label: "criticality", get: (h) => h.criticality }, { label: "registered", get: (h) => h.registered }, { label: "connection", get: (h) => h.status },
      { label: "level", get: (h) => h.level }, { label: "last_score", get: (h) => h.last_score }, { label: "windows", get: (h) => h.windows }, { label: "alarms", get: (h) => h.alarms },
      { label: "incidents", get: (h) => h.incidents }, { label: "last_seen", get: (h) => h.last_seen && new Date(h.last_seen * 1000).toISOString() }]));
  };
  function filtered(s) {
    const t = D.now(s);
    let hs = D.devices(s).filter((h) => (!q || `${h.name} ${h.ip} ${h.role} ${D.deviceKind(h).label} ${D.deviceKind(h).modality}`.toLowerCase().includes(q))
      && (fStatus === "all" || D.secStatus(h.level) === fStatus) && (fConn === "all" || h.status === fConn));
    const key = { level: (h) => [-(h.level || 0), -(h.last_score || 0)], score: (h) => [-(h.last_score || 0)], name: (h) => [h.name], ip: (h) => [h.ip.split(".").map((x) => x.padStart(3, "0")).join(".")], last: (h) => [-(h.last_seen || 0)], alarms: (h) => [-(h.alarms || 0)] }[sortBy];
    hs.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; });
    return { hs, t };
  }
  function draw(s) {
    if (!s) return;
    const { hs, t } = filtered(s);
    $("[data-n]").textContent = `${hs.length} of ${D.devices(s).length} devices`;
    if (view === "table") {
      if (!$("[data-list]").contains(table.el)) { $("[data-list]").innerHTML = ""; const c = document.createElement("div"); c.className = "card"; c.appendChild(table.el); $("[data-list]").appendChild(c); }
      table.set(hs);
    } else {
      $("[data-list]").innerHTML = hs.length ? `<div class="dev-grid">${hs.map((h) => devCard(h, t)).join("")}</div>` : `<div class="card">${empty("No devices match", "Change the search or filters.", "filter")}</div>`;
    }
    // infrastructure: PACS archive + quarantine store (not scored by the sensor)
    const allT = D.devices(s).map((h) => h.last_seen || 0), lastPacs = allT.length ? Math.max(...allT) : 0, m = D.mode(s), pep = (s.system || {}).pep || {};
    const tt = D.trafficTotals(s, 60);
    $("[data-infra]").innerHTML = infraCard("pacs", s.pacs?.name || "PACS archive", s.pacs?.ip, `port ${s.pacs?.port ?? 104}`, lastPacs && t - lastPacs < 60 ? ["ok", "Receiving"] : ["warn", lastPacs ? "No traffic in 60 s" : "No traffic seen"],
      [["Last DICOM traffic", lastPacs ? ago(lastPacs, t) : "—"], ["In / out (60 s)", `${bytes(tt.out)} / ${bytes(tt.inb)}`], ["Criticality", "critical (auto cap L2)"], ["Role", "PACS server"]])
      + infraCard("quar", "Quarantine store (VG_QUARANTINE)", "172.28.1.21", "holds uploads of L3 devices",
        m === "live" ? (pep.quarantine ? ["ok", "Running"] : ["warn", "No report"]) : ["mute", "Live mode only"],
        [["Held", m === "live" && pep.quarantine ? pep.quarantine.held : "—"], ["Released", m === "live" && pep.quarantine ? pep.quarantine.released : "—"], ["Blocked", m === "live" && pep.quarantine ? pep.quarantine.blocked : "—"], ["Sensor", "excluded (not scored)"]], "#/quarantine");
    el.querySelectorAll(".dev-card[data-ip]").forEach((c) => { c.onclick = () => ctx.nav(`devices/${c.dataset.ip}`); c.onkeydown = (e) => { if (e.key === "Enter") ctx.nav(`devices/${c.dataset.ip}`); }; });
    el.querySelectorAll(".dev-card[data-href]").forEach((c) => { c.onclick = () => { location.hash = c.dataset.href; }; });
  }
  return { update: draw };
}

function devCard(h, t) {
  const k = D.deviceKind(h), ae = D.aeTitle(h), sc = h.last_score || 0, series = (h.series || []).slice(-40).map((r) => r[3]);
  return `<article class="card dev-card" data-ip="${esc(h.ip)}" data-level="${h.level || 0}" tabindex="0" aria-label="${esc(h.name)}">
    <div class="dev-top">${deviceArt(k.kind)}<span class="st">${statusBadge(h.level)}</span><span class="cn">${D.CONN[h.status] ? connBadge(h.status) : ""}</span>${k.modality !== "—" ? `<span class="mod">${k.modality}</span>` : ""}</div>
    <div class="dev-body">
      <div class="row between top"><div class="grow" style="min-width:0"><h3 class="ellipsis">${esc(D.shortName(h))}</h3><div class="tiny muted">${esc(k.label)}${h.registered ? "" : " · not in inventory"}</div></div>${lvl(h.level, false)}</div>
      <dl class="dev-meta">
        <div><dt>IP address</dt><dd class="mono">${esc(h.ip)}</dd></div><div><dt>AE title</dt><dd class="mono">${esc(ae || "—")}</dd></div>
        <div><dt>Device ID</dt><dd class="mono">${esc(ae || h.ip)}</dd></div><div><dt>Last comm.</dt><dd>${esc(h.last_seen ? ago(h.last_seen, t) : "never")}</dd></div>
        <div><dt>Monitoring</dt><dd>${h.windows ? `${num(h.windows)} windows` : "waiting"}</dd></div><div><dt>Criticality</dt><dd>${esc(h.criticality || "—")}</dd></div>
      </dl>
      <div class="dev-score"><span class="muted">Threat</span><div class="bar"><i style="width:${Math.max(2, sc * 100)}%;background:${sc >= .5 ? "var(--crit)" : sc >= .25 ? "var(--warn)" : "var(--ok)"}"></i></div><b>${num(sc, 2)}</b></div>
      <div class="row between"><span class="tiny muted">${h.alarms || 0} alarm windows · ${h.incidents || 0} incidents</span>${spark(series, { w: 90, h: 24, max: 1, color: sc >= .5 ? "var(--crit)" : "var(--blue)" })}</div>
    </div></article>`;
}
function infraCard(kind, name, ip, sub, [tone, st], rows, href) {
  return `<article class="card dev-card infra-card" ${href ? `data-href="${href}" tabindex="0"` : 'style="cursor:default"'}>
    <div class="dev-top">${deviceArt(kind)}<span class="st"><span class="badge ${tone}"><span class="dot ${tone}"></span>${esc(st)}</span></span></div>
    <div class="dev-body"><div><h3>${esc(name)}</h3><div class="tiny muted"><span class="mono">${esc(ip || "")}</span> · ${esc(sub)}</div></div>
    <dl class="dev-meta">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div></article>`;
}

// ===================================================================== device profile
function profile(el, ip, ctx) {
  let policy = null, quar = null, tab = "activity";
  el.innerHTML = `<div class="row mb12"><a class="btn sm" href="#/devices">${icon("chevLeft")}<span>All devices</span></a></div><div data-p></div>`;
  ctx.store.once("model", api.model).then((m) => { policy = m.policy; draw(ctx.store.get()); }).catch(() => {});
  const loadQ = () => api.quarantine().then((q) => { quar = q; draw(ctx.store.get()); }).catch(() => {});
  const $ = (s) => el.querySelector(s);
  let built = false, winTable, incTable;
  function build(h) {
    $("[data-p]").innerHTML = `
      <div class="card dev-hero"><div class="art" data-art></div><div style="padding:18px 20px" data-head></div></div>
      <div class="kpis mt16" data-k style="margin-top:16px"></div>
      <div class="card"><div class="tabs" role="tablist">${[["activity", "Network & threat activity"], ["windows", "2-second windows"], ["alerts", "Alerts & predictions"], ["response", "Zero-trust actions"], ["quarantine", "Quarantine history"]].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("")}</div><div data-tabbody></div></div>`;
    $(".tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; tab = b.dataset.tab; el.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); built = "tabs"; if (tab === "quarantine" && !quar) loadQ(); draw(ctx.store.get(), true); };
    built = true;
  }
  function draw(s, forceTab = false) {
    if (!s) return;
    const h = D.hostByIp(s, ip);
    if (!h) { $("[data-p]").innerHTML = `<div class="card">${empty("Device not found", `No tracked device has the address ${esc(ip)}.`, "devices")}</div>`; built = false; return; }
    if (!built) build(h);
    const t = D.now(s), k = D.deviceKind(h), ae = D.aeTitle(h), cap = policy ? policy.criticality.max_level[h.criticality] : null;
    const incs = (s.incidents || []).filter((i) => i.host === ip), open = incs.find((i) => i.status === "active");
    $("[data-art]").innerHTML = deviceArt(k.kind);
    $("[data-head]").innerHTML = `<div class="row between top wrap"><div><div class="row wrap">${statusBadge(h.level)}${connBadge(h.status)}${h.registered ? badge("In asset inventory", "info", "check") : badge("Unregistered", "orange", "alert")}</div>
        <h1 style="margin-top:8px;font-size:22px">${esc(D.shortName(h))}</h1><div class="muted">${esc(k.label)}${k.modality !== "—" ? ` · modality ${k.modality}` : ""}</div></div>
        <div class="right"><div class="tiny muted">Current response</div><div style="margin-top:4px">${lvl(h.level)}</div>${open ? `<a class="small" href="#/incidents/${esc(open.id)}">${esc(open.id)} ${icon("arrowRight")}</a>` : ""}</div></div>
      <dl class="kv mt12" style="grid-template-columns:repeat(4,max-content 1fr);gap:8px 14px">
        <dt>IP address</dt><dd class="mono">${esc(h.ip)}</dd><dt>AE title</dt><dd class="mono">${esc(ae || "—")}</dd>
        <dt>Role</dt><dd>${esc(h.role)}</dd><dt>Criticality</dt><dd>${esc(h.criticality)}${cap != null ? ` · auto cap L${cap}` : ""}</dd>
        <dt>First seen</dt><dd>${esc(dateTime(h.first_seen))}</dd><dt>Last seen</dt><dd>${esc(h.last_seen ? `${dateTime(h.last_seen)} (${ago(h.last_seen, t)})` : "never")}</dd>
      </dl>`;
    const ser = h.series || [], recent = ser.filter((r) => r[0] > t - 60);
    $("[data-k]").innerHTML = [
      ["Threat score", num(h.last_score, 3), "gauge", h.last_score >= .5 ? "crit" : "ok", ""],
      ["Windows scored", num(h.windows), "radio", "", ""],
      ["Incidents", num(h.incidents), "siren", h.incidents ? "orange" : "", open ? "1 active now" : "none active"],
      ["Traffic (60 s)", bytes(recent.reduce((a, r) => a + r[1] + r[2], 0)), "activity", "", ""],
    ].map(([l, v, ic, tone, f]) => `<div class="card kpi tone-${tone}"><div class="kic">${icon(ic)}</div><div><div class="klabel">${l}</div><div class="kval">${esc(v)}</div><div class="kfoot">${esc(f)}</div></div></div>`).join("");
    const body = $("[data-tabbody]");
    if (tab === "activity") {
      if (!body.querySelector("[data-c1]")) body.innerHTML = `<div class="card-b"><div class="grid g2"><div><h3 class="mb8">DICOM traffic with the PACS</h3><div data-c1></div><div class="legend mt8"><span><i style="background:var(--blue)"></i>To PACS</span><span><i style="background:var(--c2)"></i>From PACS</span></div></div>
        <div><h3 class="mb8">Threat score and response level</h3><div data-c2></div><div class="legend mt8"><span><i class="line" style="background:var(--crit)"></i>Score</span><span><i class="line" style="background:var(--orange)"></i>Level</span></div></div></div>
        <p class="note mt12">${icon("info")}<span>The sensor keeps the last ${ser.length} two-second windows of this device (about ${dur(ser.length ? ser[ser.length - 1][0] - ser[0][0] : 0)} of activity). Incident windows are kept for the whole run under Alerts.</span></p></div>`;
      const t0 = ser.length ? ser[0][0] : t - 300;
      timeChart(body.querySelector("[data-c1]"), [
        { name: "Device → PACS", color: "var(--blue)", points: ser.map((r) => [r[0], r[1]]), type: "bars", barW: 2, fmt: bytes },
        { name: "PACS → device", color: "var(--c2)", points: ser.map((r) => [r[0], r[2]]), type: "bars", barW: 2, opacity: .6, fmt: bytes },
      ], { t0, t1: t, height: 220, yFmt: bytes, log: true, padL: 56, empty: "No traffic recorded yet" });
      timeChart(body.querySelector("[data-c2]"), [
        { name: "Score", color: "var(--crit)", points: ser.map((r) => [r[0], r[3]]), type: "line", gap: 30, dots: ser.length < 60 },
        { name: "Level", color: "var(--orange)", points: ser.map((r) => [r[0], r[4]]), type: "step", axis: "right", fmt: (v) => `L${v}` },
      ], { t0, t1: t, height: 220, yMax: 1, y2Max: 4, y2Fmt: (v) => `L${Math.round(v)}`, refs: [{ y: .5, color: "var(--text-3)" }], empty: "No windows scored yet" });
    } else if (tab === "windows") {
      if (!body.querySelector("[data-wt]")) {
        body.innerHTML = `<div data-wt></div>`;
        winTable = new Table(body.querySelector("[data-wt]"), [
          { key: "t", label: "Window start", get: (r) => r[0], html: (r) => `<span class="mono small">${esc(time(r[0]))}</span>` },
          { key: "out", label: "Device → PACS", num: true, get: (r) => r[1], html: (r) => bytes(r[1]) },
          { key: "in", label: "PACS → device", num: true, get: (r) => r[2], html: (r) => bytes(r[2]) },
          { key: "score", label: "Model score", num: true, get: (r) => r[3], html: (r) => `<b style="color:${r[3] >= .5 ? "var(--crit)" : "inherit"}">${num(r[3], 3)}</b>` },
          { key: "alarm", label: "CUSUM alarm", get: (r) => r[5], html: (r) => r[5] ? badge("alarm", "crit") : `<span class="faint small">—</span>` },
          { key: "lvl", label: "Level", get: (r) => r[4], html: (r) => lvl(r[4], false) },
          { key: "err", label: "DICOM errors", num: true, get: (r) => r[6], html: (r) => r[6] ? `<b style="color:var(--orange)">${r[6]}</b>` : "0" },
        ], { pageSize: 25, sortKey: "t", empty: "No windows yet", emptyIcon: "radio" });
      }
      winTable.set(ser);
    } else if (tab === "alerts") {
      if (!body.querySelector("[data-it]")) {
        body.innerHTML = `<div data-it></div>`;
        incTable = new Table(body.querySelector("[data-it]"), [
          { key: "id", label: "Incident", get: (i) => i.id, html: (i) => `<b class="mono small">${esc(i.id)}</b>` },
          { key: "opened", label: "Opened", get: (i) => i.opened, html: (i) => esc(dateTime(i.opened)) },
          { key: "cls", label: "Model prediction", get: (i) => i.cls, html: (i) => `${esc(D.clsLabel(i.cls))}${(i.explanations || []).some((e) => e.source === "rule") ? ` ${badge("DPI rule", "crit")}` : ""}` },
          { key: "conf", label: "Confidence", num: true, get: (i) => D.confidence(i), html: (i) => esc(pct(D.confidence(i))) },
          { key: "score", label: "Peak score", num: true, get: (i) => i.max_score, html: (i) => num(i.max_score, 3) },
          { key: "lvl", label: "Max level", get: (i) => i.max_level, html: (i) => lvl(i.max_level) },
          { key: "dur", label: "Duration", get: (i) => (i.closed || i.updated) - i.opened, html: (i) => esc(dur((i.closed || i.updated) - i.opened)) },
          { key: "tri", label: "Triage", get: (i) => D.triage(ctx.store.get(), i).label, html: (i) => { const tr = D.triage(ctx.store.get(), i); return badge(tr.label, tr.tone); } },
        ], { pageSize: 12, sortKey: "opened", onRow: (i) => ctx.nav(`incidents/${i.id}`), empty: "No alerts for this device", emptyIcon: "shieldCheck" });
      }
      incTable.set(incs);
    } else if (tab === "response") {
      const acts = incs.flatMap((i) => (i.actions || []).map((a) => ({ ...a, inc: i.id }))).sort((a, b) => b.t - a.t);
      body.innerHTML = acts.length ? `<div class="card-b"><div class="timeline-v">${acts.slice(0, 80).map((a) => `<div class="tv-item" style="--tc:${D.LEVELS[a.level].color}">
        <div class="row wrap">${lvl(a.level)}<span class="small muted">${esc(dateTime(a.t))}</span><a class="small mono" href="#/incidents/${esc(a.inc)}">${esc(a.inc)}</a>${a.applied ? badge(a.applied_ok === false ? "gateway error" : `applied ${time(a.applied)}`, a.applied_ok === false ? "crit" : "ok", "check") : D.mode(s) === "live" ? badge("not confirmed", "mute") : badge("simulated", "info")}${badge("automatic", "mute")}</div>
        <div class="small muted mt8" style="margin-top:4px">${esc(a.text)}</div>${(a.commands || []).length ? `<div class="code mt8" style="margin-top:6px">${a.commands.map(esc).join("\n")}</div>` : ""}</div>`).join("")}</div></div>`
        : empty("No zero-trust actions", "This device has stayed at L0 (allow).", "shieldCheck");
    } else if (tab === "quarantine") {
      const note = D.mode(s) !== "live" ? `<div class="card-b" style="padding-bottom:0">${banner("info", "Quarantine history comes from the live quarantine store (records below are from earlier live runs, if any). Replay mode does not route uploads.")}</div>` : "";
      if (!quar) { body.innerHTML = `${note}<div class="card-b"><div class="skel" style="height:120px"></div></div>`; return; }
      const items = quar.items.filter((q) => q.ip === ip);
      body.innerHTML = note + (items.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Upload</th><th>Received</th><th>Size</th><th>Preamble check</th><th>Status</th><th>Released / blocked</th></tr></thead><tbody>${items.slice(0, 200).map((q) => `<tr class="click" data-q="${esc(q.instance)}"><td class="mono small">${esc(q.instance.slice(0, 17))}…</td><td>${esc(dateTime(q.received))}</td><td>${esc(bytes(q.bytes))}</td><td>${q.check === "clean" ? badge("clean", "ok") : badge("executable", "crit")}</td><td>${badge(q.status, q.status === "released" ? "ok" : q.status === "blocked" ? "crit" : "orange")}</td><td>${esc(q.released ? dateTime(q.released) : q.blocked ? dateTime(q.blocked) : "—")}</td></tr>`).join("")}</tbody></table></div>`
        : empty("No quarantined uploads", "No DICOM upload from this device was routed to the quarantine store.", "archive"));
      body.querySelectorAll("[data-q]").forEach((r) => r.onclick = () => ctx.nav(`quarantine/${r.dataset.q}`));
    }
  }
  return { update: (s) => draw(s) };
}
