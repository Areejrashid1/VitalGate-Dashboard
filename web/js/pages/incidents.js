// Security incidents: list with search/filters/date range, and the investigation page with analyst triage.
import { icon } from "../ui/icons.js";
import { card, badge, lvl, pageHead, empty, banner } from "../ui/components.js";
import { timeChart } from "../ui/charts.js";
import { Table } from "../ui/table.js";
import { esc, time, dateTime, isoDate, dur, pct, num, bytes, csv, download } from "../core/fmt.js";
import { api } from "../core/api.js";
import { toast, confirmDialog, busy } from "../ui/feedback.js";
import * as D from "../core/derive.js";

export default { mount(el, params, ctx) { return params[0] ? detail(el, params[0], ctx) : list(el, ctx); } };

function list(el, ctx) {
  const f = { q: "", status: "", sev: "", cls: "", tri: "", from: "", to: "" };
  el.innerHTML = `${pageHead("Security incidents", "One incident = one response episode on a device: it opens when the device leaves L0 and closes when every action has expired. Triage each one with a verdict and notes.", `<button class="btn" data-exp>${icon("download")}<span>Export CSV</span></button>`)}
    <div class="kpis" data-k></div>
    <div class="card"><div class="toolbar">
      <div class="input-icon" style="min-width:220px;flex:1">${icon("search")}<input class="input" data-f="q" placeholder="Search ID, device, IP, class"></div>
      <select class="input" data-f="status"><option value="">Any status</option><option value="active">Active</option><option value="closed">Closed</option></select>
      <select class="input" data-f="sev"><option value="">Any severity</option><option>high</option><option>medium</option><option>low</option></select>
      <select class="input" data-f="cls"><option value="">Any class</option>${Object.entries(D.CLASS).filter(([k]) => k !== "benign").map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select>
      <select class="input" data-f="tri"><option value="">Any triage</option><option value="new">Untriaged</option><option value="ack">Acknowledged</option><option value="confirmed">Confirmed attack</option><option value="false">False alarm</option></select>
      <label class="row small muted">${icon("calendar")}<input class="input" type="date" data-f="from" aria-label="From date"></label><span class="muted small">to</span><input class="input" type="date" data-f="to" aria-label="To date">
      <button class="btn ghost sm" data-clear>${icon("x")}<span>Clear</span></button></div><div data-t></div></div>`;
  const $ = (s) => el.querySelector(s);
  const table = new Table($("[data-t]"), [
    { key: "id", label: "Incident ID", get: (i) => i.id, html: (i) => `<b class="mono small">${esc(i.id)}</b>` },
    { key: "cls", label: "Attack type", get: (i) => D.clsLabel(i.cls), html: (i) => `${esc(D.clsLabel(i.cls))}` },
    { key: "dev", label: "Affected device", get: (i) => i.name, html: (i) => `${esc(D.shortName(i))}<div class="tiny faint mono">${esc(i.host)}</div>` },
    { key: "sev", label: "Severity", get: (i) => ({ high: 3, medium: 2, low: 1 }[i.severity]), html: (i) => badge(i.severity, D.sevTone(i.severity)) },
    { key: "conf", label: "Confidence", num: true, get: (i) => D.confidence(i), html: (i) => esc(pct(D.confidence(i))) },
    { key: "opened", label: "Detection time", get: (i) => i.opened, html: (i) => `<span class="nowrap small">${esc(dateTime(i.opened))}</span>` },
    { key: "resp", label: "Current response", get: (i) => i.status === "active" ? i.level : -1, html: (i) => i.status === "active" ? lvl(i.level) : `<span class="small muted">ended · max L${i.max_level}</span>` },
    { key: "st", label: "Incident status", get: (i) => i.status, html: (i) => i.status === "active" ? badge("active", "crit") : badge("closed", "mute") },
    { key: "tri", label: "Triage", get: (i) => D.triage(ctx.store.get(), i).key, html: (i) => { const t = D.triage(ctx.store.get(), i); return badge(t.label, t.tone); } },
  ], { pageSize: 15, sortKey: "opened", onRow: (i) => ctx.nav(`incidents/${i.id}`), empty: "No incidents match", emptySub: "Adjust the filters or wait for the detector.", emptyIcon: "siren" });
  el.querySelectorAll("[data-f]").forEach((i) => i.addEventListener("input", () => { f[i.dataset.f] = i.value; table.page = 0; draw(ctx.store.get()); }));
  $("[data-clear]").onclick = () => { Object.keys(f).forEach((k) => f[k] = ""); el.querySelectorAll("[data-f]").forEach((i) => i.value = ""); draw(ctx.store.get()); };
  let rows = [];
  $("[data-exp]").onclick = () => download(`vitalgate-incidents-${Date.now()}.csv`, csv(rows, [
    { label: "id", get: (i) => i.id }, { label: "class", get: (i) => i.cls }, { label: "device", get: (i) => i.name }, { label: "ip", get: (i) => i.host }, { label: "severity", get: (i) => i.severity },
    { label: "confidence", get: (i) => D.confidence(i) }, { label: "max_score", get: (i) => i.max_score }, { label: "opened", get: (i) => new Date(i.opened * 1000).toISOString() },
    { label: "closed", get: (i) => i.closed && new Date(i.closed * 1000).toISOString() }, { label: "status", get: (i) => i.status }, { label: "level", get: (i) => i.level }, { label: "max_level", get: (i) => i.max_level },
    { label: "verdict", get: (i) => D.feedbackOf(ctx.store.get(), i.id).verdict || "" }, { label: "analyst", get: (i) => D.feedbackOf(ctx.store.get(), i.id).analyst || "" }]));
  function draw(s) {
    if (!s) return;
    const incs = s.incidents || [], t0 = f.from ? new Date(`${f.from}T00:00:00`).getTime() / 1000 : -Infinity, t1 = f.to ? new Date(`${f.to}T23:59:59`).getTime() / 1000 : Infinity;
    const fr = $("[data-f=from]"); if (incs.length && !fr.min) { fr.min = $("[data-f=to]").min = isoDate(incs[0].opened); fr.max = $("[data-f=to]").max = isoDate(incs[incs.length - 1].opened); }
    rows = incs.filter((i) => (!f.q || `${i.id} ${i.name} ${i.host} ${i.cls} ${D.clsLabel(i.cls)}`.toLowerCase().includes(f.q.toLowerCase())) && (!f.status || i.status === f.status)
      && (!f.sev || i.severity === f.sev) && (!f.cls || i.cls === f.cls) && (!f.tri || D.triage(s, i).key === f.tri) && i.opened >= t0 && i.opened <= t1);
    table.set(rows);
    const tri = (k) => incs.filter((i) => D.triage(s, i).key === k).length;
    $("[data-k]").innerHTML = [
      ["Active incidents", incs.filter((i) => i.status === "active").length, "siren", "crit", "device still above L0"],
      ["Untriaged", tri("new"), "message", tri("new") ? "warn" : "ok", "waiting for an analyst verdict"],
      ["Confirmed attacks", tri("confirmed"), "shieldAlert", "orange", "analyst verdict: true attack"],
      ["False alarms", tri("false"), "checkCircle", "ok", "analyst verdict: false alarm"],
    ].map(([l, v, ic, tone, ft]) => `<div class="card kpi tone-${tone}"><div class="kic">${icon(ic)}</div><div class="grow"><div class="klabel">${l}</div><div class="kval">${v}</div><div class="kfoot">${ft}</div></div></div>`).join("");
  }
  return { update: draw };
}

function detail(el, id, ctx) {
  el.innerHTML = `<div class="row between mb12 no-print"><a class="btn sm" href="#/incidents">${icon("chevLeft")}<span>All incidents</span></a><div class="row"><a class="btn sm" href="#/explain/${esc(id)}">${icon("bulb")}<span>Explanation</span></a><button class="btn sm" data-print>${icon("printer")}<span>Print report</span></button></div></div><div data-p></div>`;
  const $ = (s) => el.querySelector(s);
  $("[data-print]").onclick = () => print();
  let built = false, noteDirty = false;
  function build() {
    $("[data-p]").innerHTML = `<div data-head></div>
      <div class="grid g-21 mt16">
        <div class="col" style="gap:16px">
          ${card({ title: "Score and response over time", icon: "activity", sub: "Every 2-second window of this incident", body: `<div data-ch></div><div class="legend mt8"><span><i style="background:var(--crit);border-radius:50%"></i>Alarm</span><span><i style="background:var(--blue-2);border-radius:50%"></i>Score</span><span><i class="line" style="background:var(--orange)"></i>Level</span></div>` })}
          ${card({ title: "Investigation timeline", icon: "clock", body: `<div data-tl></div>` })}
          ${card({ title: "Zero-trust actions and gateway commands", icon: "layers", body: `<div data-acts></div>` })}
        </div>
        <div class="col" style="gap:16px">
          ${card({ title: "Analyst triage", icon: "user", sub: "Saved to the SOC feedback log under your account", body: `<div data-tri></div>` })}
          ${card({ title: "Why it was flagged", icon: "bulb", body: `<div data-why></div>` })}
          ${card({ title: "Details", icon: "info", body: `<div data-det></div>` })}
        </div></div>`;
    built = true;
  }
  async function save(body, btn, msg) {
    const r = await busy(btn, () => api.feedback(id, body), msg);
    ctx.store.patchFeedback(id, r); return r;
  }
  function draw(s) {
    if (!s) return;
    const inc = (s.incidents || []).find((i) => i.id === id);
    if (!inc) { $("[data-p]").innerHTML = `<div class="card">${empty("Incident not found", `${esc(id)} is not in the current ${D.mode(s)} run. Incidents from an earlier run are not kept once a new run starts.`, "siren")}</div>`; built = false; return; }
    if (!built) build();
    const fb = D.feedbackOf(s, id), tri = D.triage(s, inc), m = D.mode(s), conf = D.confidence(inc);
    $("[data-head]").innerHTML = `<div class="card" style="padding:18px 20px"><div class="row between top wrap"><div>
        <div class="row wrap">${inc.status === "active" ? badge("Active", "crit", "siren") : badge("Closed", "mute", "check")}${badge(`${inc.severity} severity`, D.sevTone(inc.severity))}${badge(tri.label, tri.tone)}${(inc.explanations || []).some((e) => e.source === "rule") ? badge("DPI rule", "crit", "scan") : ""}</div>
        <h1 style="margin-top:8px;font-size:22px">${esc(D.headline(inc))}</h1>
        <div class="muted"><b class="mono">${esc(inc.id)}</b> · <a href="#/devices/${esc(inc.host)}">${esc(D.shortName(inc))}</a> <span class="mono">${esc(inc.host)}</span> · ${esc(inc.role)} (${esc(inc.criticality)} criticality)</div></div>
        <div class="row" style="gap:20px"><div><div class="tiny muted">Current</div>${inc.status === "active" ? lvl(inc.level) : badge("L0 allow", "ok")}</div><div><div class="tiny muted">Peak</div>${lvl(inc.max_level)}</div></div></div>
      <div class="grid g4 mt16" style="gap:10px">
        <div class="stat-mini"><span>Opened</span><b style="font-size:14px">${esc(dateTime(inc.opened))}</b></div>
        <div class="stat-mini"><span>Duration</span><b style="font-size:14px">${esc(dur((inc.closed || inc.updated) - inc.opened))}${inc.status === "active" ? " (ongoing)" : ""}</b></div>
        <div class="stat-mini"><span>Confidence · peak score</span><b style="font-size:14px">${esc(pct(conf))} · ${esc(num(inc.max_score, 3))}</b></div>
        <div class="stat-mini"><span>Alarm windows</span><b style="font-size:14px">${inc.alarm_windows} of ${inc.windows}</b></div></div></div>`;
    const tl = inc.timeline || [];
    timeChart($("[data-ch]"), [
      { name: "Score", color: "var(--blue-2)", points: tl.filter((r) => !r[3]).map((r) => [r[0], r[1]]), width: 0, dots: true },
      { name: "Alarm", color: "var(--crit)", points: tl.filter((r) => r[3]).map((r) => [r[0], r[1]]), width: 0, dots: true },
      { name: "Level", color: "var(--orange)", points: tl.map((r) => [r[0], r[2]]), type: "step", axis: "right", fmt: (v) => `L${v}` },
    ], { t0: tl.length ? tl[0][0] - 4 : inc.opened, t1: Math.max(inc.closed || inc.updated, tl.length ? tl[tl.length - 1][0] + 4 : inc.opened + 10), height: 230, yMax: 1, y2Max: 4, y2Fmt: (v) => `L${Math.round(v)}`, refs: [{ y: .5, color: "var(--text-3)" }] });
    // investigation timeline
    const items = [{ t: inc.opened, c: "var(--crit)", h: "Incident opened", b: `${D.headline(inc)} on ${D.shortName(inc)}` },
      ...(inc.explanations || []).map((e) => ({ t: e.t, c: "#7C5CDB", h: `Explanation recorded (L${e.level}, score ${num(e.score, 2)})`, b: e.sentence })),
      ...(inc.actions || []).map((a) => ({ t: a.t, c: D.LEVELS[a.level].color, h: `Response → L${a.level} ${a.name}`, b: a.text + (a.applied ? ` · gateway confirmed at ${time(a.applied)}` : "") })),
      ...((fb.history || []).map((x) => ({ t: x.t, c: "var(--blue)", h: `Analyst ${esc(x.analyst || "")}: ${x.verdict === "true_attack" ? "confirmed attack" : x.verdict === "false_alarm" ? "marked false alarm" : x.verdict === "" ? "cleared verdict" : x.ack ? "acknowledged" : x.ack === false ? "un-acknowledged" : "note updated"}`, b: x.note || "" }))),
      ...(inc.closed ? [{ t: inc.closed, c: "var(--ok)", h: "Incident closed", b: "All gateway actions expired; device back to L0." }] : [])].sort((a, b) => a.t - b.t);
    $("[data-tl]").innerHTML = `<div class="timeline-v">${items.map((x) => `<div class="tv-item" style="--tc:${x.c}"><div class="row wrap"><b class="small">${esc(x.h)}</b><span class="tiny muted">${esc(dateTime(x.t))}</span></div>${x.b ? `<div class="tiny muted">${esc(x.b)}</div>` : ""}</div>`).join("")}</div>`;
    $("[data-acts]").innerHTML = (inc.actions || []).map((a) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)"><div class="row wrap">${lvl(a.level)}<span class="small muted">${esc(dateTime(a.t))}</span>${a.applied ? badge(a.applied_ok === false ? "gateway error" : "applied at gateway", a.applied_ok === false ? "crit" : "ok", "check") : badge(m === "live" ? "not confirmed" : "simulated (replay)", m === "live" ? "mute" : "info")}${badge("automatic", "mute")}</div>
      <div class="small muted" style="margin:4px 0 6px">${esc(a.text)}</div><div class="code">${(a.commands || []).map(esc).join("\n")}</div></div>`).join("") || empty("No actions");
    // triage (do not overwrite the note while the analyst is typing)
    const tri0 = $("[data-tri]");
    if (!tri0.dataset.built) {
      tri0.innerHTML = `<label class="row between" style="padding-bottom:12px;border-bottom:1px solid var(--border)"><span><b class="small">Acknowledged</b><div class="tiny muted">I am looking at this incident</div></span><span class="switch"><input type="checkbox" data-ack><span></span></span></label>
        <div class="small" style="font-weight:600;margin:12px 0 8px">Verdict</div>
        <div class="verdict-btns"><button class="btn" data-v="true_attack">${icon("shieldAlert")}<span>Confirm attack</span></button><button class="btn" data-v="false_alarm">${icon("checkCircle")}<span>False alarm</span></button></div>
        <button class="btn ghost sm mt8" data-v="">${icon("x")}<span>Clear verdict</span></button>
        <div class="field mt12"><label for="note">Investigation notes</label><textarea class="input" id="note" rows="4" maxlength="4000" data-note placeholder="What did you check? Who did you contact?"></textarea>
        <div class="row between"><span class="tiny muted" data-cnt></span><button class="btn primary sm" data-savenote>${icon("check")}<span>Save note</span></button></div></div>
        <div class="tiny muted mt12" data-last></div>`;
      tri0.dataset.built = "1";
      const ack = tri0.querySelector("[data-ack]");
      ack.onchange = async () => { ack.disabled = true; try { await save({ ack: ack.checked }, tri0.querySelector("[data-savenote]"), ack.checked ? "Incident acknowledged" : "Acknowledgement removed"); } catch { ack.checked = !ack.checked; } ack.disabled = false; };
      tri0.querySelectorAll("[data-v]").forEach((b) => b.onclick = async () => {
        const v = b.dataset.v;
        if (v === "true_attack" && !(await confirmDialog({ title: "Confirm this attack?", danger: true, confirm: "Confirm attack", icon: "shieldAlert", tone: "crit",
          body: `<p>This records <b>${esc(id)}</b> as a true attack under your name.</p><ul class="small"><li>In live mode the gateway <b>keeps all quarantined DICOM uploads</b> from ${esc(D.shortName((ctx.store.get().incidents || []).find((i) => i.id === id) || {}))} on hold: they will not be released to the PACS automatically.</li><li>The verdict becomes labelled data for federated retraining.</li><li>It does not raise the device's level: criticality caps still apply.</li></ul>` }))) return;
        try { await save({ verdict: v, ack: true }, b, v === "true_attack" ? "Attack confirmed" : v === "false_alarm" ? "Marked as false alarm" : "Verdict cleared"); } catch { /* toast shown */ }
      });
      const note = tri0.querySelector("[data-note]"), cnt = tri0.querySelector("[data-cnt]");
      note.value = fb.note || ""; cnt.textContent = `${note.value.length} / 4000`;
      note.oninput = () => { noteDirty = true; cnt.textContent = `${note.value.length} / 4000`; };
      tri0.querySelector("[data-savenote]").onclick = async (e) => { try { await save({ note: note.value }, e.currentTarget, "Note saved"); noteDirty = false; } catch { /* toast shown */ } };
    }
    tri0.querySelector("[data-ack]").checked = !!fb.ack;
    tri0.querySelectorAll("[data-v]").forEach((b) => { b.classList.toggle("sel-true", b.dataset.v === "true_attack" && fb.verdict === "true_attack"); b.classList.toggle("sel-false", b.dataset.v === "false_alarm" && fb.verdict === "false_alarm"); });
    if (!noteDirty && document.activeElement !== tri0.querySelector("[data-note]")) tri0.querySelector("[data-note]").value = fb.note || "";
    const last = (fb.history || []).slice(-1)[0];
    tri0.querySelector("[data-last]").textContent = last ? `Last change by ${last.analyst || fb.analyst || "?"} at ${dateTime(last.t)} · ${fb.history.length} change(s) logged` : "No analyst activity yet.";
    // why
    const e = (inc.explanations || []).slice(-1)[0];
    $("[data-why]").innerHTML = e ? `<p class="small">${esc(e.sentence)}</p>${(e.groups || []).map((g) => `<div class="row between small" style="padding:5px 0;border-bottom:1px solid var(--border)"><span>${esc(g.group)}</span><b style="color:var(--crit)" class="mono">+${num(g.shap, 3)}</b></div>`).join("")}<a class="btn sm mt12" href="#/explain/${esc(id)}">Full explanation ${icon("arrowRight")}</a>` : empty("No explanation", "", "bulb");
    $("[data-det]").innerHTML = `<dl class="kv"><dt>Site</dt><dd>${esc(inc.site)}</dd><dt>Class</dt><dd>${esc(D.clsLabel(inc.cls))}</dd><dt>Peak traffic</dt><dd>${esc(bytes(inc.peak?.out_bytes))} out · ${esc(bytes(inc.peak?.in_bytes))} in (per window)</dd>
      <dt>Last update</dt><dd>${esc(dateTime(inc.updated))}</dd>${(inc.truth || []).length ? `<dt>Test-bed ground truth</dt><dd>${(inc.truth || []).map((x) => badge(x, x === "benign" ? "ok" : "crit")).join(" ")} <div class="tiny faint">from the attack orchestrator log (evaluation only)</div></dd>` : ""}</dl>`;
  }
  return { update: draw };
}
