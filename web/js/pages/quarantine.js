// Quarantine management: DICOM uploads that L3 devices sent to the quarantine store, their checks and release.
import { icon } from "../ui/icons.js";
import { card, badge, lvl, pageHead, banner, empty, liveOnly } from "../ui/components.js";
import { Table } from "../ui/table.js";
import { donut } from "../ui/charts.js";
import { esc, time, dateTime, bytes, dur, num, csv, download } from "../core/fmt.js";
import { api } from "../core/api.js";
import * as D from "../core/derive.js";

const ST_TONE = { held: "orange", released: "ok", blocked: "crit" };
function incidentFor(s, it) {
  return ((s && s.incidents) || []).filter((i) => i.host === it.ip && i.opened <= (it.received || 0) + 5 && (i.closed || Infinity) >= (it.received || 0) - 5).pop();
}

export default {
  mount(el, params, ctx) {
    let data = null, err = null, timer = null, fSt = "", fDev = "", q = "", drawFn = null;
    const load = async () => { try { data = await api.quarantine(); err = null; } catch (e) { err = e.message; } if (drawFn) drawFn(ctx.store.get()); };
    const loop = () => { load().finally(() => { timer = setTimeout(loop, 5000); }); };
    if (params[0]) { const r = detail(el, params[0], ctx, () => data, () => err, (f) => { drawFn = f; }, () => clearTimeout(timer)); loop(); return r; }
    el.innerHTML = `${pageHead("Quarantine management", "When a device reaches L3 (quarantine), the gateway redirects its DICOM uploads to a separate quarantine store instead of the PACS. Each upload is checked and released to the PACS once it is safe.",
      `<button class="btn" data-ref>${icon("refresh")}<span>Refresh</span></button><button class="btn" data-exp>${icon("download")}<span>Export CSV</span></button>`)}
      <div data-banner></div>
      <div class="kpis" data-k></div>
      <div class="grid g-21">
        ${card({ title: "How quarantine works", icon: "route", body: `<div class="pipe" style="padding:0">${[["siren", "Device at L3", "detector + ladder"], ["shield", "Gateway redirects", "DICOM uploads → store"], ["archive", "Held separately", "never reaches PACS"], ["scan", "Preamble check", "MZ / ELF header?"], ["checkCircle", "Release to PACS", "device below L3, no hold"]].map(([ic, a, b], i) => `${i ? '<div class="pipe-arrow"></div>' : ""}<div class="pipe-step" style="cursor:default"><span class="pic">${icon(ic)}</span><b>${a}</b><small>${b}</small></div>`).join("")}</div>
          <div class="grid g2 mt12"><p class="note">${icon("checkCircle")}<span>Clean uploads are released automatically once the device is back below L3, unless an analyst confirmed an attack on that device (hold).</span></p><p class="note">${icon("ban")}<span>Uploads with an executable in the DICOM preamble are <b>never</b> released.</span></p></div>` })}
        ${card({ title: "Upload status", icon: "archive", body: `<div data-d style="max-width:200px;margin:0 auto"></div><div class="legend mt12" style="justify-content:center"><span><i style="background:var(--l3)"></i>Held</span><span><i style="background:var(--ok)"></i>Released</span><span><i style="background:var(--crit)"></i>Blocked</span></div>` })}
      </div>
      ${card({ title: "Quarantined DICOM uploads", icon: "list", cls: "mt16", bodyCls: "flush", actions: `<div class="input-icon">${icon("search")}<input class="input sm" data-q placeholder="Search AE title, IP, ID"></div><select class="input sm" data-st><option value="">Any status</option><option>held</option><option>released</option><option>blocked</option></select><select class="input sm" data-dev><option value="">All devices</option></select>`, body: `<div data-t></div>` })}`;
    const $ = (s) => el.querySelector(s);
    $("[data-ref]").onclick = async (e) => { e.currentTarget.classList.add("loading"); await load(); e.currentTarget.classList.remove("loading"); };
    $("[data-q]").oninput = (e) => { q = e.target.value.toLowerCase(); draw(ctx.store.get()); };
    $("[data-st]").onchange = (e) => { fSt = e.target.value; draw(ctx.store.get()); };
    $("[data-dev]").onchange = (e) => { fDev = e.target.value; draw(ctx.store.get()); };
    $("[data-exp]").onclick = () => data && download(`vitalgate-quarantine-${Date.now()}.csv`, csv(data.items, [
      { label: "instance", get: (i) => i.instance }, { label: "aet", get: (i) => i.aet }, { label: "ip", get: (i) => i.ip }, { label: "bytes", get: (i) => i.bytes },
      { label: "check", get: (i) => i.check }, { label: "status", get: (i) => i.status }, { label: "received", get: (i) => i.received && new Date(i.received * 1000).toISOString() },
      { label: "released", get: (i) => i.released && new Date(i.released * 1000).toISOString() }]));
    const table = new Table($("[data-t]"), [
      { key: "id", label: "Upload ID", get: (i) => i.instance, html: (i) => `<span class="mono small">${esc(i.instance.slice(0, 17))}…</span>` },
      { key: "dev", label: "Device", get: (i) => i.aet, html: (i) => `${esc(D.shortName(D.hostByIp(ctx.store.get(), i.ip) || { name: i.aet || i.ip }))}<div class="tiny faint mono">${esc(i.aet || "")} · ${esc(i.ip || "")}</div>` },
      { key: "rec", label: "Quarantined", get: (i) => i.received, html: (i) => esc(dateTime(i.received)) },
      { key: "size", label: "Size", num: true, get: (i) => i.bytes, html: (i) => bytes(i.bytes) },
      { key: "chk", label: "Verification", get: (i) => i.check, html: (i) => i.check === "clean" ? badge("clean", "ok", "check") : i.check ? badge("executable preamble", "crit", "alert") : badge("pending", "mute") },
      { key: "st", label: "Status", get: (i) => i.status, html: (i) => `${badge(i.status || "unknown", ST_TONE[i.status] || "mute")}${i.why === "hold" ? " " + badge("analyst hold", "crit", "lock") : ""}` },
      { key: "rel", label: "Released / held for", get: (i) => i.released || 0, html: (i) => esc(i.released ? `${time(i.released)} (after ${dur(i.released - i.received)})` : i.status === "held" ? `held ${dur(Date.now() / 1000 - i.received)}` : "—") },
      { key: "inc", label: "Alert", sort: false, html: (i) => { const inc = incidentFor(ctx.store.get(), i); return inc ? `<a class="mono small" href="#/incidents/${esc(inc.id)}">${esc(inc.id)}</a>` : "<span class='faint'>—</span>"; } },
    ], { pageSize: 15, sortKey: "rec", onRow: (i) => ctx.nav(`quarantine/${i.instance}`), empty: "No quarantined uploads", emptySub: "Uploads appear here when a device at L3 sends DICOM to the PACS (live mode).", emptyIcon: "archive" });
    function draw(s) {
      if (!s) return;
      const m = D.mode(s);
      $("[data-banner]").innerHTML = (err ? banner("crit", `Could not load the quarantine log: ${esc(err)}`) : "") + liveOnly(m, "Live quarantine");
      if (!data) { $("[data-k]").innerHTML = `<div class="skel" style="height:96px;grid-column:1/-1"></div>`; return; }
      const it = data.items, c = (st) => it.filter((i) => i.status === st).length;
      $("[data-k]").innerHTML = [
        ["Currently held", c("held"), "archive", "orange", "waiting for check / release"],
        ["Released to PACS", c("released"), "checkCircle", "ok", "after the device left L3"],
        ["Blocked (never released)", c("blocked"), "ban", "crit", "executable in DICOM preamble"],
        ["Devices with uploads in quarantine", new Set(it.map((i) => i.ip)).size, "devices", "", `${num(it.reduce((a, i) => a + (i.bytes || 0), 0) / 1e6, 1)} MB in total`],
      ].map(([l, v, ic, tone, f]) => `<div class="card kpi tone-${tone}"><div class="kic">${icon(ic)}</div><div class="grow"><div class="klabel">${l}</div><div class="kval">${esc(v)}</div><div class="kfoot">${esc(f)}</div></div></div>`).join("");
      donut($("[data-d]"), [{ label: "Held", value: c("held"), color: "var(--l3)" }, { label: "Released", value: c("released"), color: "var(--ok)" }, { label: "Blocked", value: c("blocked"), color: "var(--crit)" }], { size: 180, center: { value: it.length, label: "uploads" } });
      const ds = $("[data-dev]"), ips = [...new Set(it.map((i) => i.ip))];
      if (ds.dataset.n !== String(ips.length)) { ds.innerHTML = `<option value="">All devices</option>${ips.map((ip) => `<option value="${esc(ip)}">${esc(D.shortName(D.hostByIp(s, ip) || { name: ip }))}</option>`).join("")}`; ds.dataset.n = ips.length; ds.value = fDev; }
      table.set(it.filter((i) => (!fSt || i.status === fSt) && (!fDev || i.ip === fDev) && (!q || `${i.instance} ${i.aet} ${i.ip}`.toLowerCase().includes(q))));
    }
    drawFn = draw; loop();
    return { update: draw, destroy: () => clearTimeout(timer) };
  },
};

function detail(el, id, ctx, getData, getErr, setDraw, stop) {
  el.innerHTML = `<div class="row mb12"><a class="btn sm" href="#/quarantine">${icon("chevLeft")}<span>Quarantine</span></a></div><div data-p><div class="skel" style="height:300px"></div></div>`;
  const $ = (s) => el.querySelector(s);
  function draw(s) {
    const data = getData();
    if (!data) { if (getErr()) $("[data-p]").innerHTML = banner("crit", esc(getErr())); return; }
    const it = data.items.find((i) => i.instance === id);
    if (!it) { $("[data-p]").innerHTML = `<div class="card">${empty("Record not found", "This upload is not in the quarantine store's log.", "archive")}</div>`; return; }
    const h = D.hostByIp(s, it.ip), inc = incidentFor(s, it), fb = inc ? D.feedbackOf(s, inc.id) : {};
    const relWhy = it.status === "released" ? "Released: the preamble check was clean and the device was below L3 with no analyst hold."
      : it.status === "blocked" ? "Blocked permanently: an executable header was found in the DICOM preamble."
      : it.why === "hold" ? "Kept: an analyst confirmed an attack on this device, so its uploads stay in quarantine."
      : `Held: waiting until ${esc(h ? D.shortName(h) : it.ip)} drops below L3 (now ${h ? `L${h.level}` : "unknown"}).`;
    $("[data-p]").innerHTML = `<div class="grid g-21">
      ${card({ title: "Quarantine record", icon: "archive", sub: `<span class="mono">${esc(it.instance)}</span>`, body: `
        <div class="row wrap mb12">${badge(it.status, ST_TONE[it.status] || "mute")}${it.check === "clean" ? badge("preamble clean", "ok", "check") : badge("executable preamble", "crit", "alert")}${it.why === "hold" ? badge("analyst hold", "crit", "lock") : ""}</div>
        <dl class="kv"><dt>Sending device</dt><dd>${h ? `<a href="#/devices/${esc(h.ip)}">${esc(D.shortName(h))}</a>` : esc(it.ip)} <span class="mono faint">${esc(it.ip)}</span></dd>
          <dt>Calling AE title</dt><dd class="mono">${esc(it.aet || "—")}</dd><dt>Size</dt><dd>${esc(bytes(it.bytes))}</dd>
          <dt>Quarantined at</dt><dd>${esc(dateTime(it.received))}</dd><dt>Released at</dt><dd>${esc(it.released ? `${dateTime(it.released)} (held ${dur(it.released - it.received)})` : "—")}</dd>
          <dt>Associated alert</dt><dd>${inc ? `<a href="#/incidents/${esc(inc.id)}">${esc(inc.id)}</a> · ${esc(D.clsLabel(inc.cls))}${fb.verdict ? ` · ${fb.verdict === "true_attack" ? "confirmed attack" : "false alarm"}` : ""}` : "none found in this run"}</dd></dl>
        <div class="banner info mt16">${icon("info")}<div>${relWhy}</div></div>
        <div class="row wrap mt12"><button class="btn" disabled title="Release is decided by the gateway agent, not by the console">${icon("upload")}<span>Release to PACS</span></button>
          ${inc ? `<a class="btn" href="#/incidents/${esc(inc.id)}">${icon("siren")}<span>View associated event</span></a>` : ""}${h ? `<a class="btn" href="#/devices/${esc(h.ip)}">${icon("devices")}<span>Device profile</span></a>` : ""}</div>
        <p class="note mt8">${icon("lock")}<span>Manual release is not offered: the quarantine store releases only verified uploads, automatically, when the device is safe. To keep a device's uploads held, confirm the attack on its incident.</span></p>` })}
      ${card({ title: "Release history", icon: "clock", sub: "Events logged by the quarantine store", body: `<div class="timeline-v">${(it.events || []).map((e) => `<div class="tv-item" style="--tc:${e.event === "released" ? "var(--ok)" : e.event === "blocked" ? "var(--crit)" : e.event === "kept" ? "var(--crit)" : "var(--l3)"}"><b class="small">${esc(e.event)}</b> <span class="tiny muted">${esc(dateTime(e.t))}</span><div class="tiny muted">${esc(e.reason || e.error || (e.event === "received" ? `check: ${e.check}` : e.held_s != null ? `held ${dur(e.held_s)}` : ""))}</div></div>`).join("") || "<span class='muted small'>No events</span>"}</div>` })}
    </div>`;
  }
  setDraw(draw);
  const iv = setInterval(() => draw(ctx.store.get()), 2000);
  return { update: draw, destroy: () => { clearInterval(iv); stop(); } };
}
