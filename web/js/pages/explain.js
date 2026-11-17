// AI explainability: the TreeSHAP evidence the pipeline attached to each alert, in charts and plain language.
import { icon } from "../ui/icons.js";
import { card, badge, lvl, pageHead, empty, banner } from "../ui/components.js";
import { divBars } from "../ui/charts.js";
import { esc, time, dateTime, num, pct, dur } from "../core/fmt.js";
import { api } from "../core/api.js";
import * as D from "../core/derive.js";

const GROUP_HELP = {
  "Association setup": "DICOM A-ASSOCIATE requests/accepts, releases and aborts",
  "Rejects & AE titles": "Association rejects and how many different AE titles were used",
  "PDU anomalies": "Malformed first PDUs and oversized PDU length fields",
  "Outbound volume": "Bytes/packets the device sends, and its out/in byte ratio",
  "Inbound volume": "Bytes/packets the PACS sends back to the device",
  "DICOM data transfer": "P-DATA packets (actual DICOM object transfer)",
  "Packet size & timing": "Packet sizes and inter-arrival times",
  "Scanning / TCP flags": "SYN/RST/FIN counts and port spread (scanning behaviour)",
};
const fmtV = (v) => v == null ? "—" : Math.abs(v) >= 1000 ? num(v, 0) : Math.abs(v) >= 10 ? num(v, 1) : num(v, 3);

export default {
  mount(el, params, ctx) {
    let sel = params[0] || null, expIdx = -1, xai = null;
    el.innerHTML = `${pageHead("Explainable AI", "Why VitalGate raised each alert: the TreeSHAP contributions of the eight evidence groups, computed by the pipeline for the exact window that triggered or escalated the incident.")}
      <div class="grid g-12"><div class="card"><div class="card-h"><div><h2>${icon("siren")}Alerts with explanations</h2><div class="sub">Select an alert</div></div></div>
        <div class="toolbar" style="border-bottom:1px solid var(--border);border-top:0"><div class="input-icon grow">${icon("search")}<input class="input sm" data-q placeholder="Filter alerts"></div></div><div class="inc-list" data-list></div></div>
        <div data-main></div></div>`;
    const $ = (s) => el.querySelector(s);
    let q = "";
    $("[data-q]").oninput = (e) => { q = e.target.value.toLowerCase(); draw(ctx.store.get()); };
    ctx.store.once("model", api.model).then((m) => { xai = m.xai; }).catch(() => {});
    $("[data-list]").onclick = (e) => { const it = e.target.closest("[data-id]"); if (!it) return; sel = it.dataset.id; expIdx = -1; history.replaceState(null, "", `#/explain/${sel}`); draw(ctx.store.get(), true); };
    let lastKey = "";
    function draw(s, force = false) {
      if (!s) return;
      const incs = (s.incidents || []).filter((i) => (i.explanations || []).length).slice().reverse();
      const shown = incs.filter((i) => !q || `${i.id} ${i.name} ${i.cls} ${D.clsLabel(i.cls)}`.toLowerCase().includes(q));
      if (!sel && incs.length) sel = incs[0].id;
      $("[data-list]").innerHTML = shown.length ? shown.map((i) => `<div class="inc-item ${i.id === sel ? "on" : ""}" data-id="${esc(i.id)}"><div class="row between"><b class="small">${esc(D.headline(i))}</b>${i.status === "active" ? badge("active", "crit") : ""}</div>
        <div class="tiny muted">${esc(D.shortName(i))} · ${esc(i.id)}</div><div class="tiny faint">${esc(dateTime(i.opened))} · ${i.explanations.length} explanation${i.explanations.length > 1 ? "s" : ""}</div></div>`).join("")
        : empty("No explained alerts", "Explanations are attached when an alarm opens or escalates an incident.", "bulb");
      const inc = (s.incidents || []).find((i) => i.id === sel);
      const key = inc ? `${inc.id}|${inc.explanations.length}|${inc.level}|${expIdx}|${JSON.stringify(D.feedbackOf(s, inc.id))}` : "none";
      if (key === lastKey && !force) return; lastKey = key;
      if (!inc) { $("[data-main]").innerHTML = `<div class="card">${empty(incs.length ? "Select an alert" : "No alerts to explain yet", "When the detector raises an alarm, its SHAP explanation appears here.", "bulb")}</div>`; return; }
      const exps = inc.explanations, k = expIdx < 0 ? exps.length - 1 : expIdx, e = exps[k];
      const groups = Object.entries(e.all_groups || {}).sort((a, b) => b[1] - a[1]);
      const acts = inc.actions || [], fb = D.feedbackOf(s, inc.id), rule = e.source === "rule";
      $("[data-main]").innerHTML = `
        <div class="card"><div class="card-h"><div><h2>${icon("bulb")}${esc(e.headline || D.clsLabel(e.cls))}</h2><div class="sub">${esc(D.shortName(inc))} <span class="mono">${esc(inc.host)}</span> · ${esc(inc.id)}</div></div>
          <a class="btn sm" href="#/incidents/${esc(inc.id)}">Incident ${icon("arrowRight")}</a></div>
          <div class="card-b">
            <div class="grid g4" style="gap:10px">
              <div class="stat-mini"><span>Predicted class</span><b style="font-size:14px">${esc(D.clsLabel(e.cls))}</b></div>
              <div class="stat-mini"><span>Model confidence</span><b>${rule ? "rule" : esc(pct(e.prob))}</b></div>
              <div class="stat-mini"><span>Window score</span><b>${esc(num(e.score, 3))}</b></div>
              <div class="stat-mini"><span>Severity · level</span><b style="font-size:14px">${badge(inc.severity, D.sevTone(inc.severity))} ${lvl(e.level, false)}</b></div>
            </div>
            ${exps.length > 1 ? `<div class="row wrap mt12"><span class="small muted">Explanation at:</span>${exps.map((x, j) => `<button class="chip ${j === k ? "on" : ""}" data-e="${j}">${esc(time(x.t))} · L${x.level}</button>`).join("")}</div>` : ""}
            ${e.consistent === false ? banner("warn", "The top SHAP evidence does not clearly support the predicted class for this window. Treat the classification with extra care.") : ""}
          </div></div>
        <div class="grid g2 mt16">
          ${card({ title: "Evidence group contributions (SHAP)", icon: "chart", sub: "Sum of TreeSHAP values per group for the predicted class (log-odds). Red pushes towards the alert.", body: groups.length ? `<div data-div></div>` : empty("No group values", rule ? "This alert came from the DPI rule, not the model." : "") })}
          ${card({ title: "Top evidence", icon: "fingerprint", sub: "Strongest feature in each top group, compared with normal traffic", body: (e.groups || []).length ? `<div class="evid"><span class="h">Feature</span><span class="h right">This window</span><span class="h right">Normal (median)</span><span class="h right">SHAP</span>
            ${e.groups.map((g) => `<span><b>${esc(g.label)}</b><div class="tiny faint">${esc(g.group)}</div></span><span class="right mono">${esc(fmtV(g.value))}</span><span class="right mono faint">${esc(fmtV(g.benign_median))}</span><span class="right mono" style="color:${g.shap > 0 ? "var(--crit)" : "var(--blue)"}">${g.shap > 0 ? "+" : ""}${esc(num(g.shap, 3))}</span>`).join("")}</div>
            <p class="note mt12">${icon("info")}<span>“Normal” = median of benign training windows. Values ending in “(n windows ago)” come from the lag features of earlier windows.</span></p>` : empty("No feature evidence", rule ? "Executable content was found in a DICOM file preamble: the rule fires regardless of the model." : "") })}
        </div>
        ${card({ title: "Plain-language summary", icon: "message", cls: "mt16", body: `<div class="qa">
          <div><h4><span>1</span>What happened?</h4><p>${esc(D.shortName(inc))} (${esc(inc.host)}, ${esc(inc.role)}) showed traffic the model classified as <b>${esc(D.clsLabel(e.cls).toLowerCase())}</b> at ${esc(time(e.t))}${rule ? ", and the DICOM inspection rule found an executable in a file preamble" : ""}. The incident ${inc.status === "active" ? "is still active" : `closed after ${dur((inc.closed || inc.updated) - inc.opened)}`}.</p></div>
          <div><h4><span>2</span>Why did VitalGate flag it?</h4><p>${rule ? "A deterministic rule: executable headers (MZ/ELF) have no place in the DICOM preamble." : `The calibrated probability was ${pct(e.prob)} and CUSUM accumulated enough evidence to alarm. Main evidence: `}</p>${!rule ? `<ul>${(e.groups || []).slice(0, 3).map((g) => `<li><b>${esc(g.group)}</b>: ${esc(g.label)} = ${esc(fmtV(g.value))} (normal ≈ ${esc(fmtV(g.benign_median))}). <span class="faint">${esc(GROUP_HELP[g.group] || "")}</span></li>`).join("")}</ul>` : ""}</div>
          <div><h4><span>3</span>What did VitalGate do?</h4><ul>${acts.slice(0, 6).map((a) => `<li>${esc(time(a.t))}: L${a.level} ${esc(a.name)} — ${esc(a.text)}${a.applied ? " <b>(applied at the gateway)</b>" : D.mode(s) === "live" ? "" : " (simulated in replay)"}</li>`).join("")}${acts.length > 6 ? `<li>… ${acts.length - 6} more on the incident page</li>` : ""}</ul></div>
          <div><h4><span>4</span>What should the analyst check?</h4><ul>${(D.CHECKS[e.cls] || ["Review the device's recent traffic and confirm whether it matches a scheduled clinical activity."]).map((c) => `<li>${esc(c)}</li>`).join("")}<li>Record a verdict on the incident: ${fb.verdict ? `<b>${fb.verdict === "true_attack" ? "confirmed attack" : "false alarm"}</b> recorded by ${esc(fb.analyst || "an analyst")}` : "<b>not triaged yet</b>"}.</li></ul></div>
        </div>` })}
        ${card({ title: "Raw explanation sentence", icon: "file", cls: "mt16", body: `<div class="code">${esc(e.sentence || "")}</div><p class="note mt8">${icon("info")}<span>Generated by <span class="mono">vitalgate/explain/explainer.py</span> (TreeSHAP over the frozen bundle; ${groups.length || 8} groups${xai && xai.groups ? ` defined in xai_config.json` : ""}).</span></p>` })}`;
      if (groups.length) divBars($("[data-div]"), groups.map(([g, v], j) => ({ label: g, value: v, strong: j < 3, tip: `<b>${esc(g)}</b>: ${v > 0 ? "+" : ""}${v}<br>${esc(GROUP_HELP[g] || "")}` })));
      el.querySelectorAll("[data-e]").forEach((b) => b.onclick = () => { expIdx = Number(b.dataset.e); draw(ctx.store.get(), true); });
    }
    return { update: (s) => draw(s) };
  },
};
