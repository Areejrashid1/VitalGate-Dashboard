// Federated learning: how the deployed model was built (FedXgbBagging over three hospitals), its validation gate,
// bundle integrity, adaptation bundles, and the research results (clearly separated from live data).
import { icon } from "../ui/icons.js";
import { card, badge, pageHead, research, banner, empty } from "../ui/components.js";
import { hbars } from "../ui/charts.js";
import { esc, time, num, dateTime } from "../core/fmt.js";
import { api } from "../core/api.js";
import { busy, toast } from "../ui/feedback.js";
import * as D from "../core/derive.js";

export default {
  mount(el, params, ctx) {
    let model = null, err = null; const verified = {};
    el.innerHTML = `${pageHead("Federated learning", "VitalGate's detector is trained across hospitals that never share their network traffic: each site trains trees locally and only model updates travel. The console reads the frozen bundle the pipeline actually loads.")}<div data-p><div class="skel" style="height:420px"></div></div>`;
    ctx.store.once("model", api.model).then((m) => { model = m; draw(ctx.store.get()); }).catch((e) => { err = e.message; draw(ctx.store.get()); });
    const $ = (s) => el.querySelector(s);
    let built = false;
    function draw(s) {
      if (err) { $("[data-p]").innerHTML = banner("crit", `Could not load model metadata: ${esc(err)}`); return; }
      if (!model) return;
      const main = model.bundles.find((b) => b.dir === "bundle") || model.bundles[0] || {}, fc = model.fed_config || {}, ups = model.updates || [];
      const clients = [...new Set(ups.map((u) => u.client))].sort(), rounds = Math.max(0, ...ups.map((u) => u.round || 0));
      const inUse = (s && s.system && s.system.model) || {}, activeDir = inUse.bundle_dir || (inUse.bundle === main.frozen_at ? "bundle" : null);
      if (!built) {
        $("[data-p]").innerHTML = `
          <div class="kpis" data-k></div>
          <div class="grid g-32">
            ${card({ title: "Federated architecture", icon: "network", sub: "Updates, not traffic, leave each hospital", body: `<div data-map></div>` })}
            ${card({ title: "Global model", icon: "cpu", sub: "Frozen bundle loaded by the pipeline", body: `<div data-gm></div>` })}
          </div>
          <div class="grid g2 mt16">
            ${card({ title: "Training round history", icon: "clock", sub: "Accepted update per hospital per round (from the bundle manifest)", body: `<div data-rounds></div>` })}
            ${card({ title: "Peer-validation gate", icon: "shieldCheck", sub: "Poisoning protection before an update is accepted", body: `<div data-gate></div>` })}
          </div>
          ${card({ title: "Model bundles & integrity", icon: "fingerprint", sub: "SHA-256 of every file is recorded when a bundle is frozen; verify it was not modified since", cls: "mt16", bodyCls: "flush", body: `<div data-bundles></div>` })}
          <div class="research-sec mt16"><div class="row between wrap mb12"><h2>${icon("file")} Research results</h2>${research("Measured offline in the notebooks · not live")}</div><div data-res></div></div>`;
        built = true;
      }
      $("[data-k]").innerHTML = [
        ["Participating hospitals", clients.length, "hospital", "", clients.map((c) => `Site ${c}`).join(" · ")],
        ["Accepted model updates", ups.length, "merge", "ok", `${rounds} rounds · ${fc.local_trees || "?"} trees per update`],
        ["Model version", main.frozen_at || "—", "tag", "", `${main.n_features} features · ${(main.classes || []).length} classes`],
        ["In use by the pipeline", activeDir || "unknown", "cpu", activeDir ? "ok" : "warn", inUse.bundle ? `frozen ${inUse.bundle}` : "start replay or live to see"],
      ].map(([l, v, ic, tone, f]) => `<div class="card kpi tone-${tone}"><div class="kic">${icon(ic)}</div><div class="grow" style="min-width:0"><div class="klabel">${l}</div><div class="kval ellipsis" style="${String(v).length > 10 ? "font-size:17px" : ""}">${esc(v)}</div><div class="kfoot">${esc(f)}</div></div></div>`).join("");
      $("[data-map]").innerHTML = fedMap(clients, ups);
      $("[data-gm]").innerHTML = `<dl class="kv"><dt>Method</dt><dd>${esc(model.method || fc.method || "—")}</dd><dt>Aggregation</dt><dd>equal 1/n scaling (each hospital's trees weighted ${ups[0] ? num(ups[0].scale, 3) : "1/n"})</dd>
        <dt>Defence</dt><dd>${esc(model.defence || "—")}</dd><dt>Temperature</dt><dd>${esc(main.temperature)} (probability calibration)</dd><dt>Detector</dt><dd>${esc(main.detector || "CUSUM")}</dd>
        <dt>XGBoost</dt><dd class="small">depth ${esc(fc.xgb?.max_depth)} · eta ${esc(fc.xgb?.eta)} · subsample ${esc(fc.xgb?.subsample)} · class weights ${esc(fc.xgb?.class_weights)}</dd>
        <dt>Training</dt><dd class="small">max ${esc(fc.max_rounds)} rounds, early stop after ${esc(fc.patience)} without gain</dd></dl>
        <div class="tiny muted mt12 mb8" style="font-weight:650">CLASSES</div><div class="chips">${(model.classes || []).map((c) => `<span class="badge ${c === "benign" ? "ok" : "info"}">${esc(D.clsLabel(c))}</span>`).join("")}</div>`;
      // rounds grid
      const byRC = new Set(ups.map((u) => `${u.round}|${u.client}`));
      $("[data-rounds]").innerHTML = rounds ? `<div style="overflow-x:auto"><div class="round-grid" style="--n:${rounds};min-width:${70 + rounds * 18}px">
        <span></span>${Array.from({ length: rounds }, (_, i) => `<span class="tiny faint center">${i + 1}</span>`).join("")}
        ${clients.map((c) => `<span class="small" style="font-weight:600">Site ${esc(c)}</span>${Array.from({ length: rounds }, (_, i) => `<i class="${byRC.has(`${i + 1}|${c}`) ? "" : "no"}" title="round ${i + 1}, site ${esc(c)}: ${byRC.has(`${i + 1}|${c}`) ? "update accepted" : "no accepted update"}"></i>`).join("")}`).join("")}
        </div></div><div class="legend mt12"><span><i style="background:var(--blue)"></i>Update accepted into the global model</span><span><i style="background:var(--grid)"></i>No accepted update in this round</span></div>
        <p class="note mt8">${icon("info")}<span>The last round in the bundle is ${rounds} (training allows up to ${esc(fc.max_rounds)} rounds and stops early after ${esc(fc.patience)} rounds without improvement). These are historical training rounds stored in the bundle; the console does not run training.</span></p>` : empty("No round information in the manifest");
      const g = fc.defence || {};
      $("[data-gate]").innerHTML = `<div class="pipe" style="padding:0 0 8px">${[["hospital", "Site trains", "local trees"], ["upload", "Submit update", "trees only"], ["users", "Peers validate", "on their own data"], ["checkCircle", "k-of-n accept", `tolerance ${g.tol ?? "?"}`]].map(([ic, a, b], i) => `${i ? '<div class="pipe-arrow"></div>' : ""}<div class="pipe-step" style="cursor:default;min-width:84px"><span class="pic">${icon(ic)}</span><b>${a}</b><small>${b}</small></div>`).join("")}</div>
        <p class="small muted">An update is merged only if enough other hospitals (k of n, assuming up to f = ${esc(g.f_assumed ?? "?")} malicious site) see their validation macro-F1 drop by no more than ${esc(g.tol ?? "?")}. A poisoned update that hurts the others is rejected.</p>
        ${g.notebook04 ? `<div class="grid g2 mt12" style="gap:10px"><div class="stat-mini"><span>Honest updates rejected ${research("research")}</span><b>${esc(g.notebook04.honest_rejected)}</b></div><div class="stat-mini"><span>Malicious updates rejected ${research("research")}</span><b>${esc(g.notebook04.malicious_rejected)}</b></div>
          <div class="stat-mini"><span>Macro-F1 clean</span><b>${esc(g.notebook04.clean_macroF1)}</b></div><div class="stat-mini"><span>Macro-F1 worst attack</span><b>${esc(g.notebook04.worst_attack_macroF1)}</b></div></div>` : ""}`;
      // bundles
      $("[data-bundles]").innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th>Bundle</th><th>Frozen</th><th>Updates</th><th>Description</th><th>Files</th><th>Integrity</th><th></th></tr></thead><tbody>${model.bundles.map((b) => {
        const v = verified[b.dir];
        return `<tr><td><b class="mono small">${esc(b.dir)}</b>${b.dir === activeDir ? ` ${badge("in use", "ok")}` : ""}</td><td class="small">${esc(b.frozen_at || "—")}</td><td>${esc(b.n_updates ?? "—")}</td>
          <td class="small muted">${esc(b.dir === "bundle" ? "Shared federated model (3 hospitals), deployed frozen" : /local/.test(b.dir) ? "Site-personalised: federated model + local trees on the site's own labelled history" : /fed-labelled/.test(b.dir) ? "Federated retraining with SOC-labelled windows" : /adapt/.test(b.dir) ? "Adaptation to a new site's benign traffic" : b.model || "")}</td>
          <td>${esc(b.files)}</td><td>${v ? v.ok ? badge(`verified ${time(v.checked_at)}`, "ok", "check") : badge(v.error || `${v.failed.length} file(s) changed or missing`, "crit", "alert") : badge("not checked", "mute")}</td>
          <td class="right"><button class="btn xs" data-verify="${esc(b.dir)}">${icon("fingerprint")}<span>Verify SHA-256</span></button></td></tr>`;
      }).join("")}</tbody></table></div>`;
      el.querySelectorAll("[data-verify]").forEach((b) => b.onclick = async () => {
        const dir = b.dataset.verify;
        const r = await busy(b, () => api.verify(dir)).catch(() => null);
        if (!r) return; verified[dir] = r; toast(r.ok ? `${dir}: all ${r.files} files match their SHA-256` : `${dir}: integrity check failed`, r.ok ? "ok" : "err"); draw(ctx.store.get());
      });
      // research
      const R = fc.results_notebook03 || {};
      $("[data-res]").innerHTML = Object.keys(R).length ? `<div class="grid g4" style="gap:12px">
        <div class="stat-mini"><span>Federated, 3 hospitals · macro-F1</span><b class="big-num">${esc(R.P1_3_sites_macroF1)}</b></div>
        <div class="stat-mini"><span>Centralised (all data pooled) · macro-F1</span><b class="big-num">${esc(R.centralised_macroF1)}</b></div>
        <div class="stat-mini"><span>Unseen hospital C · macro-F1</span><b class="big-num">${esc(R.unseen_site_C_macroF1)}</b></div>
        <div class="stat-mini"><span>False positives per hour</span><b class="big-num">${esc(R.P1_FP_per_h)}</b></div></div>
        <div class="mt16"><div class="small muted mb8">Macro-F1 under non-IID data (Dirichlet α: smaller = more different hospitals)</div><div data-dir style="max-width:520px"></div></div>
        <p class="note mt12">${icon("info")}<span>From notebook 03 (lab dataset, three simulated hospitals). Test-bed results are on Analytics & Reports.</span></p>` : empty("No research results recorded in fed_config.json");
      if (R.dirichlet_macroF1) hbars($("[data-dir]"), Object.entries(R.dirichlet_macroF1).map(([a, v]) => ({ label: `α = ${a}`, value: v, color: "#7C5CDB" })), { max: 1, fmt: (v) => v.toFixed(3), valW: "50px", labelW: "80px" });
    }
    return { update: draw };
  },
};

function fedMap(clients, ups) {
  const W = 640, H = 300, cy = (i) => 50 + i * ((H - 100) / Math.max(1, clients.length - 1));
  let s = `<svg class="fed-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Federated learning diagram">`;
  clients.forEach((c, i) => {
    const y = cy(i), n = ups.filter((u) => u.client === c).length, path = `M188 ${y} C 260 ${y}, 250 ${H / 2}, 318 ${H / 2}`;
    s += `<path class="wire" d="${path}"/><circle r="4" fill="var(--blue)" class="upd" style="offset-path:path('${path}');animation-delay:${i * .8}s"/>
      <g transform="translate(18 ${y - 30})"><rect width="170" height="60" rx="12" fill="var(--card)" stroke="var(--border-2)"/>
      <rect x="12" y="14" width="32" height="32" rx="8" fill="var(--blue-soft)"/><path d="M28 20v20M18 30h20" stroke="var(--blue)" stroke-width="3" stroke-linecap="round"/>
      <text x="54" y="28" class="t1">Hospital ${esc(c)}</text><text x="54" y="44">${n} updates · data stays</text></g>`;
  });
  s += `<g transform="translate(318 ${H / 2 - 52})"><rect width="140" height="104" rx="14" fill="var(--blue-soft)" stroke="var(--blue)" stroke-width="1.5"/>
    <text x="70" y="30" text-anchor="middle" class="t1">Aggregator</text><text x="70" y="50" text-anchor="middle">equal 1/n scaling</text><text x="70" y="66" text-anchor="middle">k-of-n validation gate</text><text x="70" y="82" text-anchor="middle">poisoning rejected</text></g>`;
  const gp = `M458 ${H / 2} L 500 ${H / 2}`;
  s += `<path class="wire" d="${gp}"/><g transform="translate(500 ${H / 2 - 44})"><circle cx="60" cy="44" r="44" fill="var(--blue)"/><text x="60" y="40" text-anchor="middle" style="fill:#fff;font-weight:700;font-size:12px">Global</text><text x="60" y="56" text-anchor="middle" style="fill:#fff;font-size:11px">model</text></g>
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle">Raw network traffic never leaves a hospital: only trained trees (model updates) are exchanged.</text>`;
  return s + "</svg>";
}
