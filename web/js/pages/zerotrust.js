// Zero-trust response: the L0–L4 ladder, criticality caps, current enforcement and the full action history.
import { icon } from "../ui/icons.js";
import { card, badge, lvl, statusBadge, pageHead, banner, empty } from "../ui/components.js";
import { Table } from "../ui/table.js";
import { esc, time, dateTime, dur, pct, num } from "../core/fmt.js";
import { api } from "../core/api.js";
import * as D from "../core/derive.js";

export default {
  mount(el, params, ctx) {
    let policy = null, focus = null, lvF = "";
    el.innerHTML = `${pageHead("Zero-trust response", "VitalGate answers detections with a graded response instead of a hard block. Every action is temporary (fail-open) and capped by how critical the device is to patient care.")}
      <div data-mode></div>
      ${card({ title: "Response ladder", icon: "layers", sub: "Devices currently at each level. Click a level to filter the table below.", body: `<div class="ladder" data-ladder></div>` })}
      <div class="grid g2 mt16">
        ${card({ title: "Device criticality caps", icon: "hospital", sub: "Highest level the automatic response may reach per device class (from the frozen response policy)", body: `<div data-caps></div>` })}
        ${card({ title: "Response policy", icon: "file", sub: "How the level is chosen", body: `<div data-policy></div>` })}
      </div>
      ${card({ title: "Current enforcement", icon: "shield", sub: "Devices above L0 right now", cls: "mt16", bodyCls: "flush", body: `<div data-cur></div>` })}
      <div class="grid g-21 mt16">
        ${card({ title: "Response history", icon: "clock", sub: "Every level change decided by the response engine", bodyCls: "flush", actions: `<select class="input sm" data-lf><option value="">All levels</option>${D.LEVELS.map((L) => `<option value="${L.n}">L${L.n} ${L.name}</option>`).join("")}</select>`, body: `<div data-hist></div>` })}
        ${card({ title: "Analyst controls", icon: "user", body: `<div data-ctl></div>` })}
      </div>`;
    const $ = (s) => el.querySelector(s);
    ctx.store.once("model", api.model).then((m) => { policy = m.policy; draw(ctx.store.get()); }).catch(() => {});
    $("[data-lf]").onchange = (e) => { lvF = e.target.value; draw(ctx.store.get()); };
    $("[data-ladder]").onclick = (e) => { const r = e.target.closest("[data-l]"); if (!r) return; focus = focus === Number(r.dataset.l) ? null : Number(r.dataset.l); draw(ctx.store.get()); };
    const cur = new Table($("[data-cur]"), [
      { key: "dev", label: "Device", get: (r) => r.h.name, html: (r) => `<a href="#/devices/${esc(r.h.ip)}"><b class="small">${esc(D.shortName(r.h))}</b></a><div class="tiny faint mono">${esc(r.h.ip)} · ${esc(r.h.criticality)}</div>` },
      { key: "lvl", label: "Level", get: (r) => r.h.level, html: (r) => lvl(r.h.level) },
      { key: "why", label: "Reason for escalation", get: (r) => r.inc && r.inc.cls, html: (r) => r.inc ? `<a href="#/incidents/${esc(r.inc.id)}">${esc(D.headline(r.inc))}</a><div class="tiny faint">${esc(r.inc.id)}</div>` : "<span class='faint'>—</span>" },
      { key: "sev", label: "Severity", get: (r) => r.inc && r.inc.severity, html: (r) => r.inc ? badge(r.inc.severity, D.sevTone(r.inc.severity)) : "" },
      { key: "conf", label: "Confidence", num: true, get: (r) => r.inc && D.confidence(r.inc), html: (r) => esc(r.inc ? pct(D.confidence(r.inc)) : "—") },
      { key: "dur", label: "Since", get: (r) => r.since, html: (r) => esc(r.since != null ? dur(r.now - r.since) : "—") },
      { key: "exp", label: "Expires (fail-open)", get: (r) => r.left, html: (r) => r.left != null ? `<span class="nowrap">${esc(dur(r.left))}</span>` : "—" },
      { key: "gw", label: "Gateway", get: (r) => r.gw, html: (r) => r.gw },
      { key: "how", label: "", sort: false, html: (r) => r.hold ? badge("hold", "crit", "lock") : "" },
    ], { pageSize: 10, sortKey: "lvl", empty: "No device is restricted", emptySub: "Every device is at L0 (allow).", emptyIcon: "shieldCheck" });
    const hist = new Table($("[data-hist]"), [
      { key: "t", label: "Time", get: (a) => a.t, html: (a) => esc(dateTime(a.t)) },
      { key: "dev", label: "Device", get: (a) => a.dev, html: (a) => `${esc(a.dev)}<div class="tiny faint mono">${esc(a.ip)}</div>` },
      { key: "lvl", label: "Level", get: (a) => a.level, html: (a) => lvl(a.level) },
      { key: "inc", label: "Incident", get: (a) => a.inc, html: (a) => `<a class="mono small" href="#/incidents/${esc(a.inc)}">${esc(a.inc)}</a>` },
      { key: "ap", label: "Gateway", get: (a) => a.applied || 0, html: (a) => a.applied ? badge(a.applied_ok === false ? "error" : `applied +${num(a.applied - a.t, 1)} s`, a.applied_ok === false ? "crit" : "ok") : badge(a.live ? "not confirmed" : "simulated", a.live ? "mute" : "info") },
    ], { pageSize: 12, sortKey: "t" });

    function draw(s) {
      if (!s) return;
      const t = D.now(s), m = D.mode(s), hs = D.devices(s), incs = s.incidents || [], ttl = s.system?.response?.ttl_s ?? policy?.ladder?.ttl_s ?? 60;
      const pepSets = (s.system?.pep && s.system.pep.sets) || {}, setFor = { 1: "watch", 2: "rate", 3: "quar", 4: "iso" };
      $("[data-mode]").innerHTML = m === "live" ? "" : banner("info", "Replay mode: gateway actions are simulated.", "info");
      const counts = D.LEVELS.map((L) => hs.filter((h) => (h.level || 0) === L.n).length);
      $("[data-ladder]").innerHTML = D.LEVELS.map((L) => `<button class="rung ${focus === L.n ? "on" : ""}" data-l="${L.n}" style="--rc:${L.color}"><div class="rl">L${L.n}</div><h3>${L.name.toUpperCase()}</h3><p style="min-height:0">${esc(["Normal traffic", "Logged and watched", "DICOM rate-limited", "Uploads quarantined", "Fully blocked"][L.n])}</p>
        <div class="row between"><span class="rc-count">${counts[L.n]}</span><span class="tiny muted">device${counts[L.n] === 1 ? "" : "s"}</span></div></button>`).join("");
      // caps
      if (policy) {
        const roles = policy.criticality.role_to_criticality, maxL = policy.criticality.max_level;
        $("[data-caps]").innerHTML = Object.entries(roles).map(([role, crit]) => `<div class="cap-row"><div><b class="small">${esc(role)}</b><div class="tiny muted">${esc(crit)} · max L${maxL[crit]}</div></div>
          <div class="cap-track">${D.LEVELS.map((L) => `<i class="${L.n > maxL[crit] ? "off" : ""}" style="background:${L.color}" title="${L.n > maxL[crit] ? "not allowed automatically" : "allowed"}">L${L.n}</i>`).join("")}</div></div>`).join("")
          + `<p class="note mt12">${icon("info")}<span>The PACS never goes above L2 and imaging modalities never above L3 automatically, so a detection can slow imaging down but never cut the archive off. Caps are enforced in the backend response engine; this console cannot override them.</span></p>`;
        const L = policy.ladder;
        $("[data-policy]").innerHTML = `<dl class="kv"><dt>Base rule</dt><dd class="mono small">${esc(L.base).split(" | ").join("<br>")}</dd>
          <dt>Escalation</dt><dd>after ${esc(L.escalate_after_s)} s of alarms</dd><dt>Action lifetime</dt><dd>${esc(L.ttl_s)} s</dd>
          <dt>Fail-open</dt><dd>${L.fail_open ? "yes" : "no"}</dd><dt>Detector</dt><dd>CUSUM k ${esc(policy.detector.kref)}, h ${esc(policy.detector.h)}</dd></dl>
          <div class="tiny muted mt12 mb8" style="font-weight:650">SEVERITY BY CLASS</div><div class="chips">${Object.entries(L.severity).map(([c, v]) => `<span class="badge ${["", "warn", "orange", "crit"][v]}">${esc(D.clsShort(c))} · ${v}</span>`).join("")}</div>`;
      } else { $("[data-caps]").innerHTML = `<div class="skel" style="height:150px"></div>`; $("[data-policy]").innerHTML = `<div class="skel" style="height:150px"></div>`; }
      // current
      const holds = new Set(s.holds || []);
      cur.set(hs.filter((h) => (h.level || 0) > 0 && (focus == null || h.level === focus)).map((h) => {
        const inc = incs.find((i) => i.host === h.ip && i.status === "active"), acts = inc ? inc.actions || [] : [], last = acts[acts.length - 1];
        const kSet = setFor[h.level], left = m === "live" && pepSets[kSet] && pepSets[kSet][h.ip] != null ? pepSets[kSet][h.ip] : last ? Math.max(0, ttl - (t - last.t)) : null;
        const gw = m === "live" ? (pepSets[kSet] && pepSets[kSet][h.ip] != null ? badge(`in ${kSet} set`, "ok", "check") : badge("not in kernel set", "warn")) : badge("simulated", "info");
        return { h, inc, since: inc ? inc.opened : null, now: t, left, gw, hold: holds.has(h.ip) };
      }));
      if (focus === 0) cur.set(hs.filter((h) => !(h.level > 0)).map((h) => ({ h, inc: null, since: null, now: t, left: null, gw: badge("no entry", "mute"), hold: holds.has(h.ip) })));
      // history
      hist.set(incs.flatMap((i) => (i.actions || []).map((a) => ({ ...a, inc: i.id, ip: i.host, dev: D.shortName(i), live: m === "live" })))
        .filter((a) => lvF === "" || a.level === Number(lvF)));
      // controls
      const untri = incs.filter((i) => i.status === "active" && D.triage(s, i).key === "new");
      $("[data-ctl]").innerHTML = `<div class="col" style="gap:10px">
        <div class="row" style="gap:8px">${badge("Confirm attack", "crit", "check")}<span class="small muted">holds the device's quarantined uploads</span></div>
        <div class="row" style="gap:8px">${badge("False alarm", "ok", "check")}<span class="small muted">records the verdict</span></div>
        <div class="row" style="gap:8px">${badge("Manual level change", "mute", "ban")}<span class="small muted">not available (safety caps)</span></div>
        ${holds.size ? `<div class="banner warn" style="margin:0">${icon("lock")}<div>On hold: ${[...holds].map((ip) => esc(D.shortName(D.hostByIp(s, ip) || { name: ip }))).join(", ")}</div></div>` : ""}
        <div class="tiny muted" style="font-weight:650;margin-top:6px">WAITING FOR A VERDICT</div>${untri.length ? untri.map((i) => `<a class="li click" style="padding:8px 0;border-bottom:1px solid var(--border)" href="#/incidents/${esc(i.id)}"><div class="lic crit">${icon("siren")}</div><div class="grow"><div class="small" style="font-weight:600">${esc(i.id)}</div><div class="tiny muted">${esc(D.shortName(i))}</div></div>${lvl(i.level, false)}</a>`).join("") : `<div class="small muted">None</div>`}</div>`;
    }
    return { update: draw };
  },
};
