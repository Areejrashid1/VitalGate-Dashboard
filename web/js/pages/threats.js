// Threat detection: engine status, interactive detection pipeline, detection timeline and attack events.
import { icon } from "../ui/icons.js";
import { card, badge, lvl, pageHead, seg, bindSeg } from "../ui/components.js";
import { timeChart, hbars, columns } from "../ui/charts.js";
import { Table } from "../ui/table.js";
import { esc, time, dateTime, num, pct, dur, ago } from "../core/fmt.js";
import { api } from "../core/api.js";
import * as D from "../core/derive.js";

const STAGES = [
  { icon: "network", name: "PACS network traffic", sub: "DICOM over TCP", text: "Imaging devices (CT, MRI, X-ray, ultrasound) and reading workstations exchange DICOM with the PACS archive. This is the traffic VitalGate protects; it never reads image pixels or patient fields." },
  { icon: "radio", name: "Sensor", sub: "512-byte capture + GRO", text: "Captures the first 512 bytes of each packet on the PACS link and re-assembles TCP segments (software GRO), so large transfers look like what the application sent." },
  { icon: "hash", name: "Feature extraction", sub: "2 s windows · 83 features", text: "Per device and per 2-second window: 27 network and DICOM features, plus the same for the two previous windows and gap features: 83 numbers describing the device's behaviour." },
  { icon: "scan", name: "DICOM rule inspection", sub: "executable preamble", text: "Deep packet inspection of the 128-byte DICOM preamble: a Windows (MZ) or Linux (ELF) executable header marks a polyglot file. The rule raises an alarm on its own and such uploads are never released from quarantine." },
  { icon: "cpu", name: "Federated XGBoost", sub: "calibrated probabilities", text: "The frozen federated model (FedXgbBagging over three hospitals) gives a probability per attack class, calibrated with temperature scaling. The window score is the probability that it is not benign." },
  { icon: "activity", name: "CUSUM detection", sub: "evidence over time", text: "A per-device CUSUM accumulates (score − k). A single noisy window does not alarm; sustained suspicious behaviour does, within seconds. The sum decays during silence." },
  { icon: "target", name: "Threat classification", sub: "class + severity", text: "The most likely attack class (and the DPI rule) set the incident's category and severity (low / medium / high), which drives the response." },
  { icon: "layers", name: "Zero-trust response", sub: "graded L0–L4", text: "The response ladder picks Watch, Restrict, Quarantine or Isolate from severity and confidence, escalates if the alarm persists, caps the level by device criticality and lets every action expire (fail-open)." },
  { icon: "dashboard", name: "SOC dashboard", sub: "explain & triage", text: "Analysts see the incident, the SHAP evidence behind it and the actions taken, and record a verdict. Confirmed attacks keep quarantined uploads on hold; verdicts are labelled data for federated retraining." },
];

export default {
  mount(el, params, ctx) {
    let stage = 4, range = 3600, policy = null, hostSel = "";
    el.innerHTML = `${pageHead("AI threat detection", "How VitalGate decides that DICOM traffic is malicious, and every detection it has made in this run.")}
      <div class="kpis" data-k></div>
      ${card({ title: "Detection pipeline", icon: "route", sub: "Click a stage to see what it does and its live status", body: `<div class="pipe" data-pipe>${STAGES.map((s, i) => `${i ? '<div class="pipe-arrow" aria-hidden="true"></div>' : ""}<button class="pipe-step ${i === stage ? "on" : ""}" data-st="${i}"><span class="pic">${icon(s.icon)}</span><b>${s.name}</b><small>${s.sub}</small></button>`).join("")}</div><div class="stage-detail" data-sd></div>` })}
      <div class="grid g-21 mt16">
        ${card({ title: "Detection timeline", icon: "activity", sub: "Model score of each window (incident windows and recent windows of every device)", actions: `<select class="input sm" data-host aria-label="Device"><option value="">All devices</option></select>${seg("r", [["900", "15 min"], ["3600", "1 h"], ["21600", "6 h"], ["86400", "24 h"]], "3600")}`, body: `<div data-tl></div><div class="legend mt8"><span><i style="background:var(--crit);border-radius:50%"></i>Alarm</span><span><i style="background:var(--blue-2);border-radius:50%"></i>Score</span></div>` })}
        ${card({ title: "Attack classification", icon: "target", sub: "Detected incidents per class and severity", body: `<div data-cls></div><div class="mt12" data-sev></div>` })}
      </div>
      ${card({ title: "Attack events", icon: "siren", sub: "Every incident opened by the detector", cls: "mt16", bodyCls: "flush", actions: `<div class="input-icon">${icon("search")}<input class="input sm" data-q placeholder="Filter by device, class, ID"></div><select class="input sm" data-st2><option value="">Any status</option><option value="active">Active</option><option value="closed">Closed</option></select>`, body: `<div data-ev></div>` })}`;
    const $ = (s) => el.querySelector(s);
    ctx.store.once("model", api.model).then((m) => { policy = m.policy; draw(ctx.store.get()); }).catch(() => {});
    $("[data-pipe]").onclick = (e) => { const b = e.target.closest("[data-st]"); if (!b) return; stage = Number(b.dataset.st); el.querySelectorAll("[data-st]").forEach((x) => x.classList.toggle("on", x === b)); stageDetail(ctx.store.get()); };
    bindSeg(el, "r", (v) => { range = Number(v); draw(ctx.store.get()); });
    $("[data-host]").onchange = (e) => { hostSel = e.target.value; draw(ctx.store.get()); };
    let q = "", stF = "";
    $("[data-q]").oninput = (e) => { q = e.target.value.toLowerCase(); draw(ctx.store.get()); };
    $("[data-st2]").onchange = (e) => { stF = e.target.value; draw(ctx.store.get()); };
    const ev = new Table($("[data-ev]"), [
      { key: "id", label: "ID", get: (i) => i.id, html: (i) => `<b class="mono small">${esc(i.id)}</b>` },
      { key: "opened", label: "Detected", get: (i) => i.opened, html: (i) => esc(dateTime(i.opened)) },
      { key: "dev", label: "Device", get: (i) => i.name, html: (i) => `${esc(D.shortName(i))}<div class="tiny faint mono">${esc(i.host)}</div>` },
      { key: "cls", label: "Classification", get: (i) => i.cls, html: (i) => `${esc(D.clsLabel(i.cls))}${(i.explanations || []).some((e) => e.source === "rule") ? " " + badge("DPI rule", "crit") : ""}` },
      { key: "sev", label: "Severity", get: (i) => ({ high: 3, medium: 2, low: 1 }[i.severity]), html: (i) => badge(i.severity, D.sevTone(i.severity)) },
      { key: "conf", label: "Confidence", num: true, get: (i) => D.confidence(i), html: (i) => esc(pct(D.confidence(i))) },
      { key: "score", label: "Peak score", num: true, get: (i) => i.max_score, html: (i) => num(i.max_score, 3) },
      { key: "alarms", label: "Alarm windows", num: true, get: (i) => i.alarm_windows, html: (i) => `${i.alarm_windows} / ${i.windows}` },
      { key: "lvl", label: "Response", get: (i) => i.max_level, html: (i) => i.status === "active" ? lvl(i.level) : `<span class="small muted">closed · max L${i.max_level}</span>` },
    ], { pageSize: 10, sortKey: "opened", onRow: (i) => ctx.nav(`incidents/${i.id}`), empty: "No attack events", emptySub: "Nothing has crossed the CUSUM threshold in this run.", emptyIcon: "shieldCheck" });

    function stageDetail(s) {
      const st = STAGES[stage], sys = (s && s.system) || {}, det = (s && s.meta && s.meta.detector) || {}, m = D.mode(s);
      const live = {
        0: [["Devices talking to PACS", D.devices(s).filter((h) => h.status === "online").length], ["PACS", s?.pacs ? `${s.pacs.ip}:${s.pacs.port}` : "—"]],
        1: m === "live" ? [["Packets", num(sys.sensor?.packets)], ["GRO merges", num(sys.sensor?.gro_merged)], ["Capture file", sys.sensor?.file || "—"]] : [["Capture files", sys.sensor?.pcaps ?? "—"], ["Mode", "replay"]],
        2: [["Windows scored", num(sys.sensor?.windows)], ["Flush lag", sys.sensor?.flush_lag_s != null ? `${sys.sensor.flush_lag_s} s` : "—"], ["Features", sys.model?.features ?? "—"]],
        3: [["Rule hits this run", (s?.incidents || []).filter((i) => (i.explanations || []).some((e) => e.source === "rule")).length], ["Action", "alarm + never release from quarantine"]],
        4: [["Bundle", sys.model?.bundle || "—"], ["Accepted updates", sys.model?.updates ?? "—"], ["Temperature", sys.model?.temperature ?? "—"], ["Scoring time", sys.model?.score_ms != null ? `${sys.model.score_ms} ms / window` : "live mode only"]],
        5: [["Reference k", sys.response?.kref ?? det.kref ?? "—"], ["Threshold h", sys.response?.h ?? det.h ?? "—"], ["Gap reset", det.gap_s != null ? `${det.gap_s} s` : "—"], ["Per-host k", Object.keys(det.per_host_k || {}).length ? `${Object.keys(det.per_host_k).length} hosts` : "global k"], ["Alarms", sys.response?.alarms ?? "—"]],
        6: [["Classes", policy ? Object.keys(policy.ladder.severity).length : "—"], ["Incidents", (s?.incidents || []).length]],
        7: [["Action TTL", sys.response?.ttl_s != null ? `${sys.response.ttl_s} s` : "—"], ["Escalate after", policy ? `${policy.ladder.escalate_after_s} s` : "—"], ["Fail-open", policy ? (policy.ladder.fail_open ? "yes" : "no") : "—"], ["Gateway", m === "live" ? sys.pep?.mode || "—" : "simulated"]],
        8: [["Untriaged incidents", (s?.incidents || []).filter((i) => D.triage(s, i).key === "new").length], ["Confirmed attacks", (s?.incidents || []).filter((i) => D.triage(s, i).key === "confirmed").length]],
      }[stage] || [];
      $("[data-sd]").innerHTML = `<div><div class="row mb8"><span class="pic" style="width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:var(--blue-soft);color:var(--blue)">${icon(st.icon)}</span><h3>${stage + 1}. ${esc(st.name)}</h3></div><p class="muted">${esc(st.text)}</p>
        ${stage === 7 ? `<a class="btn sm" href="#/zero-trust">Open zero-trust response ${icon("arrowRight")}</a>` : stage === 8 ? `<a class="btn sm" href="#/incidents">Open incidents ${icon("arrowRight")}</a>` : stage === 4 ? `<a class="btn sm" href="#/federated">Model & federation ${icon("arrowRight")}</a>` : ""}</div>
        <div><div class="tiny muted mb8" style="font-weight:650;text-transform:uppercase;letter-spacing:.05em">Current status · ${m} mode</div><dl class="kv">${live.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
    }

    function draw(s) {
      if (!s) return;
      const t = D.now(s), incs = s.incidents || [], sys = s.system || {}, det = (s.meta && s.meta.detector) || {};
      const hs = D.devices(s), hsel = $("[data-host]");
      if (hsel.dataset.n !== String(hs.length)) { hsel.innerHTML = `<option value="">All devices</option>${hs.filter((h) => h.windows).map((h) => `<option value="${esc(h.ip)}">${esc(D.shortName(h))}</option>`).join("")}`; hsel.dataset.n = hs.length; hsel.value = hostSel; }
      const allWins = D.windowsAll(s), rec = allWins.filter((w) => w.t > t - 300);
      $("[data-k]").innerHTML = [
        ["Detection engine", D.pipeline(s).state === "running" ? "Running" : "Stopped", "cpu", D.pipeline(s).state === "running" ? "ok" : "warn", `CUSUM k ${sys.response?.kref ?? det.kref ?? "?"} · h ${sys.response?.h ?? det.h ?? "?"}`],
        ["Suspicious windows (5 min)", String(rec.filter((w) => w.score >= .5).length), "activity", rec.some((w) => w.score >= .5) ? "warn" : "ok", `of ${num(rec.length)} windows scored`],
        ["Attack events", String(incs.length), "siren", incs.some((i) => i.status === "active") ? "crit" : "", `${incs.filter((i) => i.status === "active").length} active · ${incs.filter((i) => i.opened > t - 3600).length} in the last hour`],
        ["Avg. model confidence", incs.length ? pct(incs.map(D.confidence).filter((x) => x != null).reduce((a, b, _, arr) => a + b / arr.length, 0)) : "—", "gauge", "", "over incidents (class probability)"],
      ].map(([l, v, ic, tone, f]) => `<div class="card kpi tone-${tone}"><div class="kic">${icon(ic)}</div><div class="grow"><div class="klabel">${l}</div><div class="kval">${esc(v)}</div><div class="kfoot">${esc(f)}</div></div></div>`).join("");
      stageDetail(s);
      const ws = allWins.filter((w) => w.t >= t - range && (!hostSel || w.ip === hostSel));
      const kref = Number(sys.response?.kref ?? det.kref ?? 0.6);
      timeChart($("[data-tl]"), [
        { name: "Score", color: "var(--blue-2)", points: ws.filter((w) => !w.alarm).map((w) => [w.t, w.score]), type: "line", width: 0, dots: true },
        { name: "Alarm window score", color: "var(--crit)", points: ws.filter((w) => w.alarm).map((w) => [w.t, w.score]), type: "line", width: 0, dots: true },
      ], { t0: t - range, t1: t, height: 250, yMax: 1, refs: [{ y: .5, color: "var(--text-3)", label: "0.5" }, { y: kref, color: "var(--orange)", label: `k ${kref}` }],
        markers: incs.filter((i) => i.opened >= t - range && (!hostSel || i.host === hostSel)).map((i) => ({ t: i.opened, color: "var(--crit)", tip: `<b>${esc(i.id)}</b> opened<br>${esc(D.clsLabel(i.cls))} on ${esc(D.shortName(i))}` })), empty: "No windows in this range" });
      const by = {}; incs.forEach((i) => by[i.cls] = (by[i.cls] || 0) + 1);
      hbars($("[data-cls]"), Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ label: D.clsLabel(c), value: v, color: D.CLASS_COLORS[c] })), { empty: "No incidents yet", valW: "30px", labelW: "minmax(110px,50%)" });
      columns($("[data-sev]"), ["low", "medium", "high"].map((sv) => ({ label: sv, value: incs.filter((i) => i.severity === sv).length, color: { low: "var(--warn)", medium: "var(--orange)", high: "var(--crit)" }[sv] })), { height: 150 });
      ev.set(incs.filter((i) => (!stF || i.status === stF) && (!q || `${i.id} ${i.name} ${i.host} ${i.cls} ${D.clsLabel(i.cls)}`.toLowerCase().includes(q))));
    }
    return { update: draw };
  },
};
