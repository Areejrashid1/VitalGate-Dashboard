// Analytics & reports: operational statistics of the current run, plus research results in a separate section.
import { icon } from "../ui/icons.js";
import { card, badge, pageHead, seg, bindSeg, research, empty } from "../ui/components.js";
import { timeChart, donut, hbars, columns } from "../ui/charts.js";
import { esc, dateTime, dur, pct, num, csv, download, time } from "../core/fmt.js";
import { api } from "../core/api.js";
import { conn } from "../core/store.js";
import * as D from "../core/derive.js";

const RUN_LABEL = {
  tb3_frozen: "New hospital, shared model, no adaptation (zero-shot)", tb3_local_onboard: "New hospital, site-personalised model + onboarding",
  tb3_onboard: "New hospital, shared model + onboarding (per-host k)", tb3_local_labelled: "Site-personalised model (labelled history)",
  tb3_fed_labelled: "Federated retraining with SOC labels", tb3_fed_benign: "Federated adaptation, benign traffic only",
  ALL: "All test-bed campaigns", ALL_frozen: "All campaigns, shared model, no adaptation", ALL_onboard: "All campaigns + onboarding",
  benign_baseline: "Benign-only baseline (false alarms)", tb_0001: "Campaign 1", tb_0002: "Campaign 2",
};
export default {
  mount(el, params, ctx) {
    let range = "all", res = null, quar = null;
    el.innerHTML = `${pageHead("Analytics & reports", "Statistics of the current pipeline run, computed from its incidents, windows and analyst verdicts. Research evaluation results are shown separately at the bottom.",
      `${seg("rng", [["1h", "1 h"], ["6h", "6 h"], ["24h", "24 h"], ["all", "Whole run"]], range)}<button class="btn" data-csv>${icon("download")}<span>CSV</span></button><button class="btn" data-json>${icon("file")}<span>JSON report</span></button><button class="btn" data-print>${icon("printer")}<span>Print / PDF</span></button>`)}
      <div class="kpis" data-k></div>
      <div class="grid g2">
        ${card({ title: "Attack trends", icon: "chart", sub: "Incidents opened over time, by severity", body: `<div data-trend></div><div class="legend mt8"><span><i style="background:var(--crit)"></i>High</span><span><i style="background:var(--orange)"></i>Medium</span><span><i style="background:var(--warn)"></i>Low</span></div>` })}
        ${card({ title: "Device-level threat history", icon: "devices", sub: "Incidents and alarm windows per device", body: `<div data-dev></div>` })}
      </div>
      <div class="grid g3 mt16">
        ${card({ title: "Analyst verdicts", icon: "message", sub: "False-positive view from SOC triage", body: `<div data-fp></div><div data-fpl class="mt12"></div>` })}
        ${card({ title: "Response distribution", icon: "layers", sub: "Highest level reached per incident", body: `<div data-resp></div>` })}
        ${card({ title: "Model confidence", icon: "gauge", sub: "Class probability of each incident's explanation", body: `<div data-conf></div>` })}
      </div>
      <div class="grid g2 mt16">
        ${card({ title: "Response timing", icon: "clock", sub: "From the incident records and analyst log", body: `<div data-lat></div>` })}
        ${card({ title: "Quarantine activity", icon: "archive", sub: "Uploads handled by the quarantine store (live runs)", body: `<div data-q></div>` })}
      </div>
      <div class="research-sec mt16"><div class="row between wrap mb12"><h2>${icon("file")} Research performance</h2>${research("Previously measured")}</div><div data-res><div class="skel" style="height:200px"></div></div></div>`;
    const $ = (s) => el.querySelector(s);
    bindSeg(el, "rng", (v) => { range = v; draw(ctx.store.get()); });
    api.research().then((r) => { res = r; draw(ctx.store.get()); }).catch((e) => { $("[data-res]").innerHTML = `<div class="small muted">Could not load research results: ${esc(e.message)}</div>`; });
    api.quarantine().then((q) => { quar = q; draw(ctx.store.get()); }).catch(() => {});
    $("[data-print]").onclick = () => print();
    const sel = () => { const s = ctx.store.get(), t = D.now(s), t0 = range === "all" ? -Infinity : t - D.RANGES[range]; return { s, t, t0, incs: ((s && s.incidents) || []).filter((i) => i.opened >= t0) }; };
    $("[data-csv]").onclick = () => { const { s, incs } = sel(); download(`vitalgate-report-${Date.now()}.csv`, csv(incs, [
      { label: "id", get: (i) => i.id }, { label: "device", get: (i) => i.name }, { label: "ip", get: (i) => i.host }, { label: "class", get: (i) => i.cls }, { label: "severity", get: (i) => i.severity },
      { label: "confidence", get: (i) => D.confidence(i) }, { label: "max_level", get: (i) => i.max_level }, { label: "opened", get: (i) => new Date(i.opened * 1000).toISOString() },
      { label: "duration_s", get: (i) => Math.round((i.closed || i.updated) - i.opened) }, { label: "verdict", get: (i) => D.feedbackOf(s, i.id).verdict || "" }])); };
    $("[data-json]").onclick = () => { const { s, incs } = sel(); download(`vitalgate-report-${Date.now()}.json`, JSON.stringify({ generated: new Date().toISOString(), mode: D.mode(s), range, model: s.meta, incidents: incs.length,
      by_class: incs.reduce((a, i) => (a[i.cls] = (a[i.cls] || 0) + 1, a), {}), by_max_level: incs.reduce((a, i) => (a[`L${i.max_level}`] = (a[`L${i.max_level}`] || 0) + 1, a), {}),
      verdicts: incs.reduce((a, i) => { const v = D.feedbackOf(s, i.id).verdict || "untriaged"; a[v] = (a[v] || 0) + 1; return a; }, {}), devices: D.devices(s).map((h) => ({ ip: h.ip, name: h.name, incidents: h.incidents, alarms: h.alarms, windows: h.windows })) }, null, 1), "application/json"); };

    function draw(s0) {
      const { s, t, t0, incs } = sel(); if (!s) return;
      const hs = D.devices(s), first = incs.length ? incs[0].opened : t, span = Math.max(600, t - (isFinite(t0) ? t0 : first));
      const tri = incs.map((i) => (D.feedbackOf(s, i.id).history || [])[0]).filter(Boolean);
      const ttt = incs.map((i) => { const h = (D.feedbackOf(s, i.id).history || [])[0]; return h ? h.t - i.opened : null; }).filter((x) => x != null && x >= 0);
      const durs = incs.filter((i) => i.status === "closed").map((i) => i.closed - i.opened);
      const med = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
      $("[data-k]").innerHTML = [
        ["Incidents in range", incs.length, "siren", "", `${incs.filter((i) => i.severity === "high").length} high severity`],
        ["Devices affected", new Set(incs.map((i) => i.host)).size, "devices", "", `of ${hs.length} tracked`],
        ["Median incident duration", durs.length ? dur(med(durs)) : "—", "clock", "", "open until all actions expired"],
        ["Scoring latency", D.mode(s) === "live" && s.system?.model?.score_ms != null ? `${s.system.model.score_ms} ms` : "—", "zap", "", D.mode(s) === "live" ? "per 2-s window, live" : "measured in live mode only"],
      ].map(([l, v, ic, tone, f]) => `<div class="card kpi tone-${tone}"><div class="kic">${icon(ic)}</div><div class="grow"><div class="klabel">${l}</div><div class="kval">${esc(v)}</div><div class="kfoot">${esc(f)}</div></div></div>`).join("");
      // trends
      const n = 40, a = isFinite(t0) ? t0 : first - 60, b = D.bucketize(incs, a, t + 1, n, (i) => i.opened), bw = (t + 1 - a) / n;
      const ser = (sev, col, off) => ({ name: sev, color: col, points: b.map((x) => [x.t + off * bw / 3, x.items.filter((i) => i.severity === sev).length]), type: "bars", barW: bw / 3, fmt: (v) => `${v} incidents` });
      timeChart($("[data-trend]"), [ser("high", "var(--crit)", 0), ser("medium", "var(--orange)", 1), ser("low", "var(--warn)", 2)], { t0: a, t1: t, height: 220, yFmt: (v) => Math.round(v), int: true, tol: bw, empty: "No incidents in this range" });
      // devices
      const byD = {}; incs.forEach((i) => { byD[i.host] = byD[i.host] || { n: 0, a: 0, name: D.shortName(i) }; byD[i.host].n++; byD[i.host].a += i.alarm_windows; });
      hbars($("[data-dev]"), Object.entries(byD).sort((x, y) => y[1].n - x[1].n).map(([ip, v]) => ({ label: v.name, sub: `${ip} · ${v.a} alarm windows`, value: v.n, color: "var(--blue)", tip: `${v.name}: ${v.n} incidents, ${v.a} alarm windows` })), { valW: "30px", empty: "No incidents in this range" });
      // verdicts
      const vt = { confirmed: 0, false: 0, ack: 0, new: 0 }; incs.forEach((i) => vt[D.triage(s, i).key]++);
      donut($("[data-fp]"), [{ label: "Confirmed attack", value: vt.confirmed, color: "var(--crit)" }, { label: "False alarm", value: vt.false, color: "var(--ok)" }, { label: "Acknowledged", value: vt.ack, color: "var(--blue)" }, { label: "Untriaged", value: vt.new, color: "var(--border-2)" }], { size: 160, center: { value: vt.confirmed + vt.false ? pct(vt.false / (vt.confirmed + vt.false)) : "—", label: "false-alarm rate" } });
      const gt = incs.filter((i) => (i.truth || []).length), gtFalse = gt.filter((i) => i.truth.every((x) => x === "benign")).length;
      $("[data-fpl]").innerHTML = `<div class="small muted">${vt.confirmed + vt.false} of ${incs.length} incidents have a verdict.</div>`;
      columns($("[data-resp]"), D.LEVELS.slice(1).map((L) => ({ label: `L${L.n}`, sub: L.name, value: incs.filter((i) => i.max_level === L.n).length, color: L.color })), { height: 190 });
      const cf = incs.map(D.confidence).filter((x) => x != null), bins = [[.5, .6], [.6, .7], [.7, .8], [.8, .9], [.9, 1.01]];
      columns($("[data-conf]"), bins.map(([lo, hi]) => ({ label: `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`, value: cf.filter((x) => x >= lo && x < hi).length + (lo === .5 ? cf.filter((x) => x < .5).length : 0), color: "var(--blue)" })), { height: 190 });
      $("[data-lat]").innerHTML = `<div class="grid g2" style="gap:10px">
        <div class="stat-mini"><span>Median time to analyst triage</span><b>${ttt.length ? esc(dur(med(ttt))) : "—"}</b><span class="tiny">${ttt.length} triaged incidents</span></div>
        <div class="stat-mini"><span>Median incident duration</span><b>${durs.length ? esc(dur(med(durs))) : "—"}</b><span class="tiny">${durs.length} closed incidents</span></div>
        <div class="stat-mini"><span>Median time to gateway confirmation</span><b>${(() => { const x = incs.flatMap((i) => (i.actions || []).filter((a) => a.applied).map((a) => a.applied - a.t)).filter((v) => v >= 0); return x.length ? esc(dur(med(x))) : "—"; })()}</b><span class="tiny">decision → nftables applied (live)</span></div>
        <div class="stat-mini"><span>Model scoring time</span><b>${D.mode(s) === "live" && s.system?.model?.score_ms != null ? `${s.system.model.score_ms} ms` : "—"}</b><span class="tiny">per window (live mode)</span></div></div>
        <p class="note mt12">${icon("info")}<span>Detection latency from attack start needs the attack's true start time, which only the offline evaluation has (see research section: median time to detect).</span></p>`;
      if (quar) {
        const it = quar.items.filter((i) => (i.received || 0) >= t0), c = (st) => it.filter((i) => i.status === st).length;
        $("[data-q]").innerHTML = it.length ? `<div class="grid g3" style="gap:10px"><div class="stat-mini"><span>Held</span><b>${c("held")}</b></div><div class="stat-mini"><span>Released</span><b>${c("released")}</b></div><div class="stat-mini"><span>Blocked</span><b>${c("blocked")}</b></div></div>
          <div class="mt12" data-qd></div>` : empty("No quarantine activity in this range", D.mode(s) === "live" ? "" : "Quarantine runs in live mode.", "archive");
        if (it.length) { const byA = {}; it.forEach((i) => byA[i.aet || i.ip] = (byA[i.aet || i.ip] || 0) + 1); hbars($("[data-qd]"), Object.entries(byA).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: k, value: v, color: "var(--l3)" })), { valW: "40px" }); }
      } else $("[data-q]").innerHTML = `<div class="skel" style="height:120px"></div>`;
      if (res) drawResearch();
    }
    function drawResearch() {
      const R = res.runs || [], F = (res.federated || {}).results_notebook03 || {};
      const pick = ["tb3_frozen", "tb3_local_onboard", "ALL_frozen", "benign_baseline"].map((n) => R.find((r) => r.name === n)).filter(Boolean);
      $("[data-res]").innerHTML = `<div class="grid g4" style="gap:12px">
          <div class="stat-mini"><span>Lab macro-F1 (federated, 3 hospitals)</span><b class="big-num">${esc(F.P1_3_sites_macroF1 ?? "—")}</b></div>
          ${["tb3_frozen", "tb3_local_onboard"].map((n) => { const r = R.find((x) => x.name === n); return `<div class="stat-mini"><span>${esc(RUN_LABEL[n])} · macro-F1</span><b class="big-num">${r && r.window_metrics ? r.window_metrics.macro_f1 : "—"}</b></div>`; }).join("")}
          ${(() => { const r = R.find((x) => x.name === "tb3_frozen"); return `<div class="stat-mini"><span>Attacks detected (new hospital)</span><b class="big-num">${r && r.detection ? `${r.detection.detected}/${r.detection.runs}` : "—"}</b><span class="tiny">${r && r.detection ? `median time to detect ${num(r.detection.median_TTD_s, 2)} s` : ""}</span></div>`; })()}
        </div>
        <div class="table-wrap mt16"><table class="t"><thead><tr><th>Evaluation run</th><th class="num">Macro-F1</th><th class="num">Detected</th><th class="num">Median TTD</th><th class="num">False alarms / h</th></tr></thead><tbody>
          ${pick.map((r) => `<tr><td><b class="small">${esc(RUN_LABEL[r.name] || r.name)}</b></td><td class="num">${r.window_metrics ? r.window_metrics.macro_f1 : "—"}</td>
            <td class="num">${r.detection ? `${r.detection.detected}/${r.detection.runs}` : "—"}</td><td class="num">${r.detection && r.detection.median_TTD_s != null ? `${num(r.detection.median_TTD_s, 2)} s` : "—"}</td><td class="num">${r.detection ? num(r.detection.false_episodes_per_h, 2) : "—"}</td></tr>`).join("")}</tbody></table></div>
        <p class="note mt12">${icon("info")}<span>Macro-F1 is computed by this console from each run's windows.csv (prediction = model class when score ≥ 0.5 or the DPI rule fired, otherwise benign). TTD = time to detect from the true attack start. “New hospital” = test-bed campaign 3, never used for training.</span></p>`;
    }
    return { update: draw };
  },
};
