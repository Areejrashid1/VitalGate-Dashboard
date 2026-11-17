// Network monitoring: PACS traffic, per-device communication and how the sensor turns packets into features.
import { icon } from "../ui/icons.js";
import { card, badge, lvl, connBadge, pageHead, seg, bindSeg } from "../ui/components.js";
import { timeChart, hbars } from "../ui/charts.js";
import { Table } from "../ui/table.js";
import { esc, time, ago, bytes, num, dur } from "../core/fmt.js";
import * as D from "../core/derive.js";

export default {
  mount(el, params, ctx) {
    let win = 300, dev = "all";
    el.innerHTML = `${pageHead("PACS network monitoring", "DICOM traffic between imaging devices and the PACS, as the VitalGate sensor sees it. No image content or patient data is read: only packet headers, the first 512 bytes and DICOM protocol fields.")}
      <div class="kpis" data-k></div>
      ${card({ title: "Live traffic map", icon: "network", sub: "Devices → VitalGate sensor & gateway → PACS. Moving dots = DICOM traffic in the last minute; red = device currently restricted or worse.", body: `<div data-map></div>` })}
      <div class="grid g-21 mt16">
        ${card({ title: "Network activity timeline", icon: "activity", sub: "Bytes per 2-second window, summed over devices", actions: `<select class="input sm" data-dev aria-label="Device"><option value="all">All devices</option></select>${seg("win", [["300", "5 min"], ["900", "15 min"], ["3600", "1 h"]], "300")}`, body: `<div data-tl></div><div class="legend mt8"><span><i style="background:var(--blue)"></i>Device → PACS (outgoing)</span><span><i style="background:var(--c2)"></i>PACS → device (incoming)</span><span><i class="line" style="background:var(--crit)"></i>Suspicious window</span></div><div class="tiny faint mt8" data-cov></div>` })}
        ${card({ title: "Top talkers", icon: "chart", sub: "Bytes exchanged with the PACS in the selected range", body: `<div data-top></div>` })}
      </div>
      ${card({ title: "Sensor pipeline", icon: "radio", sub: "What happens to every packet before the model sees it", cls: "mt16", body: pipelineHtml() })}
      ${card({ title: "Device connections", icon: "devices", sub: "Per-device DICOM communication with the PACS", cls: "mt16", bodyCls: "flush", body: `<div data-t></div>` })}`;
    const $ = (s) => el.querySelector(s);
    bindSeg(el, "win", (v) => { win = Number(v); draw(ctx.store.get()); });
    $("[data-dev]").onchange = (e) => { dev = e.target.value; draw(ctx.store.get()); };
    const table = new Table($("[data-t]"), [
      { key: "name", label: "Device", get: (h) => h.name, html: (h) => `<a href="#/devices/${esc(h.ip)}"><b class="small">${esc(D.shortName(h))}</b></a><div class="tiny faint mono">${esc(h.ip)}</div>` },
      { key: "conn", label: "Connection", get: (h) => h.status, html: (h) => connBadge(h.status) },
      { key: "out", label: "To PACS (60 s)", num: true, get: (h) => h._out, html: (h) => bytes(h._out) },
      { key: "in", label: "From PACS (60 s)", num: true, get: (h) => h._in, html: (h) => bytes(h._in) },
      { key: "w", label: "Active windows (60 s)", num: true, get: (h) => h._w },
      { key: "err", label: "DICOM errors (held)", num: true, get: (h) => h._err, html: (h) => h._err ? `<b style="color:var(--orange)">${h._err}</b>` : "0" },
      { key: "sus", label: "Suspicious windows (held)", num: true, get: (h) => h._sus, html: (h) => h._sus ? `<b style="color:var(--crit)">${h._sus}</b>` : "0" },
      { key: "last", label: "Last packet", get: (h) => h.last_seen, html: (h) => esc(h.last_seen ? ago(h.last_seen, D.now(ctx.store.get())) : "never") },
      { key: "lvl", label: "Level", get: (h) => h.level, html: (h) => lvl(h.level, false) },
    ], { pageSize: 12, sortKey: "out", onRow: (h) => ctx.nav(`devices/${h.ip}`) });
    el.querySelectorAll("[data-stage]").forEach((b) => b.onclick = () => {
      el.querySelectorAll("[data-stage]").forEach((x) => x.classList.toggle("on", x === b));
      $("[data-stage-detail]").innerHTML = STAGES[Number(b.dataset.stage)].detail(ctx.store.get());
    });
    let lastMap = "";
    function draw(s) {
      if (!s) return;
      const t = D.now(s), hs = D.devices(s), sys = s.system || {}, sens = sys.sensor || {}, m = D.mode(s);
      const sel = $("[data-dev]"), opts = `<option value="all">All devices</option>${hs.filter((h) => h.windows).map((h) => `<option value="${esc(h.ip)}" ${h.ip === dev ? "selected" : ""}>${esc(D.shortName(h))}</option>`).join("")}`;
      if (sel.dataset.n !== String(hs.length)) { sel.innerHTML = opts; sel.dataset.n = hs.length; }
      const tt = D.trafficTotals(s, 60);
      $("[data-k]").innerHTML = [
        ["Outgoing to PACS (60 s)", bytes(tt.out), "upload", "", `${num(tt.windows)} device windows`],
        ["Incoming from PACS (60 s)", bytes(tt.inb), "download", "", "retrieves / C-MOVE responses"],
        ["Active connections", String(hs.filter((h) => h.status === "online").length), "wifi", "ok", `of ${hs.length} tracked devices`],
        m === "live" ? ["Packets captured", num(sens.packets), "radio", "", `GRO merged ${num(sens.gro_merged)} · late ${num(sens.late)} · file ${sens.file || "—"}`]
          : ["Windows replayed", num(sens.windows), "radio", "", `${sens.pcaps || "?"} capture files from the test bed`],
      ].map(([l, v, ic, tone, f]) => `<div class="card kpi tone-${tone}"><div class="kic">${icon(ic)}</div><div class="grow"><div class="klabel">${l}</div><div class="kval">${esc(v)}</div><div class="kfoot">${esc(f)}</div></div></div>`).join("");
      // map
      const key = hs.map((h) => `${h.ip}${h.level}${h.status}`).join() + (t - (hs[0]?.last_seen || 0) < 60);
      if (key !== lastMap) { $("[data-map]").innerHTML = mapSvg(s); lastMap = key; }
      // timeline
      const t0 = t - win, n = Math.min(150, Math.max(30, Math.floor(win / 2)));
      const ws = D.windowsAll(s).filter((w) => w.out != null && (dev === "all" || w.ip === dev) && w.t >= t0);
      const b = D.bucketize(ws, t0, t, n), bw = win / n;
      timeChart($("[data-tl]"), [
        { name: "Device → PACS", color: "var(--blue)", points: b.map((x) => [x.t, x.items.reduce((a, w) => a + w.out, 0)]), type: "bars", barW: bw, fmt: bytes },
        { name: "PACS → device", color: "var(--c2)", points: b.map((x) => [x.t + bw / 2, x.items.reduce((a, w) => a + w.inb, 0)]), type: "bars", barW: bw / 2, opacity: .7, fmt: bytes },
      ], { t0, t1: t, height: 240, yFmt: bytes, log: true, padL: 56, tol: bw,
        markers: ws.filter((w) => w.score >= .5).slice(-60).map((w) => ({ t: w.t, color: "var(--crit)", tip: `<b>${esc(D.shortName(D.hostByIp(s, w.ip) || { name: w.ip }))}</b><br>score ${w.score.toFixed(2)} at ${time(w.t)}` })),
        empty: "No traffic in this range" });
      const cov = D.seriesCoverage(s);
      $("[data-cov]").textContent = cov && cov > t0 ? `Per-device window history starts ${ago(cov, t)} (the sensor keeps the most recent 150 windows per device).` : "";
      // top talkers
      const by = {}; for (const w of D.windowsAll(s)) if (w.out != null && w.t >= t0) by[w.ip] = (by[w.ip] || 0) + w.out + w.inb;
      hbars($("[data-top]"), Object.entries(by).sort((a, c) => c[1] - a[1]).slice(0, 8).map(([ip, v]) => ({ label: D.shortName(D.hostByIp(s, ip) || { name: ip }), sub: ip, value: v, color: (D.hostByIp(s, ip)?.level || 0) >= 2 ? "var(--crit)" : "var(--blue)" })), { fmt: bytes, valW: "70px", empty: "No traffic in this range" });
      // table
      table.set(hs.map((h) => {
        const ser = h.series || [], rec = ser.filter((r) => r[0] > t - 60);
        return { ...h, _out: rec.reduce((a, r) => a + r[1], 0), _in: rec.reduce((a, r) => a + r[2], 0), _w: rec.length, _err: ser.reduce((a, r) => a + (r[6] || 0), 0), _sus: ser.filter((r) => r[3] >= .5).length };
      }));
      const on = el.querySelector("[data-stage].on"); if (on) $("[data-stage-detail]").innerHTML = STAGES[Number(on.dataset.stage)].detail(s);
    }
    return { update: draw };
  },
};

function mapSvg(s) {
  const hs = D.devices(s).filter((h) => h.status !== "not seen" || h.registered), t = D.now(s), W = 980, rowH = 34, H = Math.max(240, hs.length * rowH + 40);
  const gx = 520, gy = H / 2, px = 860;
  let svg = `<svg class="flowmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Traffic map">`;
  hs.forEach((h, i) => {
    const y = 26 + i * rowH, active = h.last_seen && t - h.last_seen < 60, L = h.level || 0, id = `w${i}`;
    const path = `M200 ${y} C 360 ${y}, 380 ${gy}, ${gx - 46} ${gy}`;
    svg += `<path id="${id}" d="${path}" class="wire ${L >= 3 ? "blocked" : L >= 1 && active ? "hot" : ""}"/>`;
    svg += `<g><rect x="12" y="${y - 13}" width="188" height="26" rx="8" fill="var(--card)" stroke="${L ? D.LEVELS[L].color : "var(--border-2)"}"/>
      <circle cx="26" cy="${y}" r="4.5" fill="${h.status === "online" ? "var(--ok)" : h.status === "idle" ? "var(--warn)" : "var(--text-3)"}"/>
      <text x="38" y="${y + 4}" class="lbl" style="font-size:11.5px">${esc(D.shortName(h).slice(0, 22))}</text><text x="194" y="${y + 4}" text-anchor="end" style="font-size:10px">L${L}</text></g>`;
    if (active && L < 3) for (let k = 0; k < 2; k++) svg += `<circle r="3.4" class="pkt" fill="${L ? "var(--crit)" : "var(--blue)"}" style="offset-path:path('${path}');--d:${2 + (i % 3) * .5}s;animation-delay:${k * 1.2 + i * .17}s"/>`;
  });
  svg += `<g transform="translate(${gx} ${gy})"><circle r="44" fill="var(--blue-soft)" stroke="var(--blue)" stroke-width="2"/><circle r="30" fill="var(--blue)"/>
    <path d="M0 -14 11 -9v6C11 4 6 9 0 11-6 9-11 4-11-3v-6z" fill="#fff"/><text y="62" text-anchor="middle" class="lbl">VitalGate sensor + gateway</text>
    <text y="77" text-anchor="middle">GRO · 2 s windows · 83 features · model · CUSUM</text></g>`;
  const pp = `M${gx + 44} ${gy} L ${px - 50} ${gy}`;
  svg += `<path d="${pp}" class="wire"/>${[0, 1, 2].map((k) => `<circle r="3.4" class="pkt" fill="var(--blue)" style="offset-path:path('${pp}');--d:1.6s;animation-delay:${k * .53}s"/>`).join("")}`;
  svg += `<g transform="translate(${px - 50} ${gy - 46})"><rect width="110" height="92" rx="12" fill="var(--card)" stroke="var(--border-2)"/>${[0, 1, 2].map((k) => `<rect x="14" y="${14 + k * 20}" width="82" height="13" rx="3" fill="var(--blue-soft)"/><circle cx="23" cy="${20.5 + k * 20}" r="2.4" fill="var(--ok)" class="blink" style="animation-delay:${k * .4}s"/>`).join("")}
    <text x="55" y="110" text-anchor="middle" class="lbl">${esc((s.pacs && s.pacs.name) || "PACS")}</text><text x="55" y="124" text-anchor="middle">${esc((s.pacs && s.pacs.ip) || "")}:${esc((s.pacs && s.pacs.port) || 104)}</text></g>`;
  return svg + "</svg>";
}

const STAGES = [
  { icon: "radio", name: "Capture", sub: "tcpdump on the PACS link", detail: (s) => `<h3>Packet capture</h3><p class="muted small">The sensor captures the DICOM link of the PACS (port ${s?.pacs?.port ?? 104}) with a snap length of <b>512 bytes</b>: enough for TCP/IP headers, DICOM association and PDU headers and the 128-byte file preamble, but never the image pixels. ${D.mode(s) === "live" ? `Now reading <span class="mono">${esc(s.system?.sensor?.file || "—")}</span>, ${num(s.system?.sensor?.packets)} packets so far.` : `Replay reads ${s?.system?.sensor?.pcaps ?? "the"} recorded capture files.`}</p>` },
  { icon: "merge", name: "Software GRO", sub: "re-assemble segments", detail: (s) => `<h3>Software GRO (generic receive offload)</h3><p class="muted small">Large DICOM transfers arrive as many TCP segments. VitalGate merges consecutive segments of the same flow the same way the NIC/kernel would, so features count real application messages instead of capture artefacts.${s?.system?.sensor?.gro_merged != null ? ` <b>${num(s.system.sensor.gro_merged)}</b> segments merged in this run.` : ""}</p>` },
  { icon: "clock", name: "2-second windows", sub: "one per device", detail: (s) => `<h3>Per-device 2-second windows</h3><p class="muted small">Packets are grouped by the device (client IP) talking to the PACS into 2-second windows. A window waits ${s?.system?.sensor?.flush_lag_s ?? 4} s for late packets before it is scored (live mode)${s?.system?.sensor?.late != null ? `; ${num(s.system.sensor.late)} packets arrived too late so far` : ""}.</p>` },
  { icon: "hash", name: "83 features", sub: "network + DICOM", detail: () => `<h3>83 features per window</h3><p class="muted small">27 features of the current window (packets, bytes, sizes, timing, TCP flags, ports, association requests/accepts/rejects, aborts, releases, P-DATA packets, AE-title counts, malformed first PDUs, oversized PDU lengths, ratios), the same 27 for the two previous windows (lag 1 and 2), and 2 gap features: 27 × 3 + 2 = 83.</p>` },
  { icon: "scan", name: "Preamble rule", sub: "DPI on DICOM files", detail: () => `<h3>Executable-in-preamble rule</h3><p class="muted small">Every DICOM file starts with a 128-byte preamble. A Windows (MZ) or Linux (ELF) executable header there is a known polyglot-malware trick. The rule flags it regardless of the model score.</p>` },
  { icon: "cpu", name: "Federated model", sub: "XGBoost score", detail: (s) => `<h3>Federated XGBoost model</h3><p class="muted small">The frozen federated bundle (${esc(s?.system?.model?.bundle || "—")}, ${s?.system?.model?.updates ?? "?"} accepted updates) gives a calibrated probability per attack class (temperature ${s?.system?.model?.temperature ?? "?"}). Score = probability that the window is not benign.</p><a class="btn sm" href="#/threats">Open threat detection ${icon("arrowRight")}</a>` },
];
function pipelineHtml() {
  return `<div class="pipe">${STAGES.map((st, i) => `${i ? '<div class="pipe-arrow" aria-hidden="true"></div>' : ""}<button class="pipe-step ${i === 0 ? "on" : ""}" data-stage="${i}"><span class="pic">${icon(st.icon)}</span><b>${st.name}</b><small>${st.sub}</small></button>`).join("")}</div>
    <div class="stage-detail" style="grid-template-columns:1fr;padding:14px 4px 0" data-stage-detail>${STAGES[0].detail(null)}</div>`;
}
