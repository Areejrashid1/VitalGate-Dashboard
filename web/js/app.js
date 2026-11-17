// VitalGate console: application shell (sidebar, top bar, search, notifications, profile) and the router.
import { icon, LOGO } from "./ui/icons.js";
import { esc, initials, ago, time } from "./core/fmt.js";
import { api } from "./core/api.js";
import { store, conn } from "./core/store.js";
import { prefs, applyTheme } from "./core/prefs.js";
import { mode, pipeline, devices, now, eventIcon, eventTone, EVENT_LABEL, shortName, clsShort } from "./core/derive.js";
import { toast } from "./ui/feedback.js";

const NAV = [
  { group: "Monitor" },
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "devices", label: "Medical Devices", icon: "devices" },
  { id: "network", label: "Network Monitoring", icon: "activity" },
  { group: "Detect & explain" },
  { id: "threats", label: "Threat Detection", icon: "shieldAlert" },
  { id: "explain", label: "AI Explainability", icon: "bulb" },
  { id: "incidents", label: "Security Incidents", icon: "siren", count: true },
  { group: "Respond" },
  { id: "zero-trust", label: "Zero-Trust Response", icon: "layers" },
  { id: "quarantine", label: "Quarantine Management", icon: "archive" },
  { group: "Model & insight" },
  { id: "federated", label: "Federated Learning", icon: "network" },
  { id: "analytics", label: "Analytics & Reports", icon: "chart" },
  { id: "logs", label: "System Logs", icon: "logs" },
  { id: "how-it-works", label: "How VitalGate Works", icon: "route" },
];
const PAGES = {
  dashboard: () => import("./pages/dashboard.js"), devices: () => import("./pages/devices.js"), network: () => import("./pages/network.js"),
  threats: () => import("./pages/threats.js"), explain: () => import("./pages/explain.js"), "zero-trust": () => import("./pages/zerotrust.js"),
  quarantine: () => import("./pages/quarantine.js"), federated: () => import("./pages/federated.js"), incidents: () => import("./pages/incidents.js"),
  analytics: () => import("./pages/analytics.js"), logs: () => import("./pages/logs.js"), settings: () => import("./pages/settings.js"),
  "how-it-works": () => import("./pages/how.js"),
};
const TITLES = Object.fromEntries(NAV.filter((n) => n.id).map((n) => [n.id, n.label])); TITLES.settings = "Settings";

const root = document.getElementById("app");
let me = { user: "" }, current = null, currentId = null;
export const nav = (path) => { location.hash = `#/${path}`; };
const ctx = { store, nav, get me() { return me; } };

function shell() {
  root.className = `app ${prefs.get("sidebarCollapsed") ? "collapsed" : ""}`;
  root.innerHTML = `
  <aside class="sidebar" aria-label="Main navigation">
    <div class="brand">${LOGO}<div class="brand-text"><b>VitalGate</b><small>Medical imaging SOC</small></div></div>
    <nav class="nav">${NAV.map((n) => n.group ? `<div class="nav-group">${n.group}</div>` :
      `<a href="#/${n.id}" data-nav="${n.id}" title="${n.label}">${icon(n.icon)}<span>${n.label}</span>${n.count ? '<b class="count hidden" data-count></b><i class="dot-count hidden" data-dot></i>' : ""}</a>`).join("")}</nav>
    <div class="side-foot">
      <a href="#/settings" data-nav="settings" title="Settings">${icon("settings")}<span>Settings</span></a>
      <a href="#" data-logout title="Sign out">${icon("logout")}<span>Sign out</span></a>
    </div>
  </aside>
  <div class="backdrop" data-close-nav></div>
  <div class="main">
    <header class="topbar">
      <button class="icon-btn menu-btn" data-menu aria-label="Open navigation">${icon("menu")}</button>
      <button class="icon-btn collapse-btn" data-collapse aria-label="Collapse sidebar" title="Collapse sidebar">${icon("panel")}</button>
      <div class="title"><div class="crumb">VitalGate <span data-crumb></span></div><h1 data-title>Dashboard</h1></div>
      <div class="search" data-search>${icon("search")}<input type="search" placeholder="Search devices, IPs, AE titles, incidents, pages" aria-label="Global search" autocomplete="off"><kbd>/</kbd><div class="search-results hidden" role="listbox"></div></div>
      <div class="top-actions">
        <button class="icon-btn search-toggle" data-search-toggle aria-label="Search">${icon("search")}</button>
        <span class="mode-pill" data-mode title=""><span class="dot mute"></span><span class="lbl">Connecting</span></span>
        <span style="position:relative"><button class="icon-btn" data-bell aria-label="Notifications">${icon("bell")}<b class="badge-dot hidden" data-unread></b></button><div class="dropdown hidden" data-notif></div></span>
        <button class="icon-btn" data-theme-toggle aria-label="Toggle dark mode" title="Toggle light / dark">${icon(prefs.get("theme") === "dark" ? "sun" : "moon")}</button>
        <span style="position:relative"><button class="profile-btn" data-profile aria-haspopup="true"><span class="avatar" data-avatar>?</span><span class="who ellipsis" data-who></span>${icon("chevDown")}</button><div class="dropdown hidden" data-profile-menu></div></span>
      </div>
    </header>
    <div data-conn-banner></div>
    <main class="content" id="content" tabindex="-1"></main>
    <div class="foot"><span>VitalGate · Securing the future of medical imaging</span><span data-foot></span></div>
  </div>`;
  wire();
}

function wire() {
  const q = (s) => root.querySelector(s);
  q("[data-collapse]").onclick = () => { const c = !prefs.get("sidebarCollapsed"); prefs.set("sidebarCollapsed", c); root.classList.toggle("collapsed", c); };
  q("[data-menu]").onclick = () => root.classList.add("nav-open");
  q("[data-close-nav]").onclick = () => root.classList.remove("nav-open");
  root.querySelectorAll("[data-logout]").forEach((a) => a.onclick = (e) => { e.preventDefault(); logout(); });
  q("[data-theme-toggle]").onclick = () => { const t = prefs.get("theme") === "dark" ? "light" : "dark"; prefs.set("theme", t); };
  prefs.on((k) => { if (k === "theme" || k === "*") { applyTheme(); q("[data-theme-toggle]").innerHTML = icon(prefs.get("theme") === "dark" ? "sun" : "moon"); redrawCharts(); } });
  // dropdowns
  const toggle = (btn, menu, fill) => {
    q(btn).onclick = (e) => { e.stopPropagation(); const m = q(menu), open = m.classList.contains("hidden"); closeMenus(); if (open) { fill(m); m.classList.remove("hidden"); } };
  };
  toggle("[data-bell]", "[data-notif]", fillNotifs);
  toggle("[data-profile]", "[data-profile-menu]", fillProfile);
  document.addEventListener("click", (e) => { if (!e.target.closest(".dropdown") && !e.target.closest("[data-search]")) closeMenus(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeMenus(); root.classList.remove("nav-open"); }
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); const s = q("[data-search]"); s.classList.add("open"); s.querySelector("input").focus(); }
  });
  q("[data-search-toggle]").onclick = () => { const s = q("[data-search]"); s.classList.toggle("open"); s.querySelector("input").focus(); };
  wireSearch();
}
function closeMenus() { root.querySelectorAll(".dropdown").forEach((d) => d.classList.add("hidden")); root.querySelector(".search-results")?.classList.add("hidden"); }
function redrawCharts() { document.querySelectorAll(".chart").forEach((c) => c._draw && c._draw()); }

async function logout() {
  try { await api.logout(); } catch { /* signing out anyway */ }
  location.href = "/login?out";
}

// ---------------- notifications
function notifEvents(s) {
  return ((s && s.events) || []).filter((e) => ["incident_opened", "level_up", "new_device", "device_offline"].includes(e.kind)).slice(0, 40);
}
function fillNotifs(m) {
  const s = store.get(), ev = notifEvents(s), seen = prefs.get("lastSeenEvent") || 0, t = now(s);
  m.innerHTML = `<div class="dd-head row between"><b>Notifications</b>${ev.length ? `<button class="btn xs" data-readall>Mark all read</button>` : ""}</div>
    <div class="notif-list">${ev.length ? ev.map((e, i) => `<div class="notif ${e.t > seen ? "unread" : ""}" data-i="${i}">
      <div class="ic" style="background:var(--${eventTone(e) === "crit" ? "crit" : eventTone(e) === "ok" ? "ok" : eventTone(e) === "orange" ? "orange" : eventTone(e) === "warn" ? "warn" : "info"}-soft);color:var(--${eventTone(e) === "crit" ? "crit" : eventTone(e) === "ok" ? "ok" : eventTone(e) === "orange" ? "orange" : eventTone(e) === "warn" ? "warn" : "blue"})">${icon(eventIcon(e))}</div>
      <div class="grow"><div class="small" style="font-weight:600">${esc(EVENT_LABEL[e.kind] || e.kind)}</div><div class="small muted">${esc(e.text)}</div><div class="tiny faint">${esc(time(e.t))} · ${esc(ago(e.t, t))}</div></div></div>`).join("")
      : `<div class="empty"><div class="eic">${icon("bell")}</div><b>No notifications</b><div class="small">Alerts and escalations appear here.</div></div>`}</div>
    <div style="padding:6px"><a href="#/settings">${icon("settings")} Notification settings</a></div>`;
  m.querySelector("[data-readall]")?.addEventListener("click", (e) => { e.stopPropagation(); markRead(); fillNotifs(m); });
  m.querySelectorAll(".notif").forEach((n) => n.onclick = () => {
    const e = ev[Number(n.dataset.i)]; closeMenus(); markRead();
    if (e.incident) nav(`incidents/${e.incident}`); else if (e.host) nav(`devices/${e.host}`);
  });
}
function markRead() { const ev = notifEvents(store.get()); if (ev.length) prefs.set("lastSeenEvent", Math.max(...ev.map((e) => e.t || 0))); updateChrome(store.get()); }
let notified = null;
function browserNotify(s) {
  const ev = notifEvents(s);
  if (notified == null) { notified = Math.max(0, ...ev.map((e) => e.t || 0)); return; }
  const fresh = ev.filter((e) => e.t > notified); if (!fresh.length) return;
  notified = Math.max(notified, ...fresh.map((e) => e.t));
  if (!prefs.get("notifyBrowser") || !("Notification" in window) || Notification.permission !== "granted") return;
  for (const e of fresh.slice(0, 3)) if ((e.level || 0) >= Number(prefs.get("notifyMinLevel")) || e.kind === "new_device")
    new Notification(`VitalGate: ${EVENT_LABEL[e.kind] || e.kind}`, { body: e.text, tag: `${e.kind}-${e.t}` });
}

// ---------------- profile menu
function fillProfile(m) {
  const name = (me.profile && me.profile.fullname) || me.user;
  m.innerHTML = `<div class="dd-head"><div class="row"><span class="avatar">${esc(initials(name))}</span><div><b>${esc(name)}</b><div class="tiny muted">${esc(me.user)} · SOC analyst</div></div></div></div>
    <a href="#/settings">${icon("user")} Profile & account</a><a href="#/settings">${icon("settings")} Preferences</a>
    <button class="dd-item" data-tt>${icon(prefs.get("theme") === "dark" ? "sun" : "moon")} ${prefs.get("theme") === "dark" ? "Light" : "Dark"} theme</button>
    <a href="#/how-it-works">${icon("info")} How VitalGate works</a>
    <button class="dd-item" data-lo style="color:var(--crit)">${icon("logout")} Sign out</button>`;
  m.querySelector("[data-tt]").onclick = () => { prefs.set("theme", prefs.get("theme") === "dark" ? "light" : "dark"); closeMenus(); };
  m.querySelector("[data-lo]").onclick = logout;
  m.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMenus));
}

// ---------------- global search
function wireSearch() {
  const box = root.querySelector("[data-search]"), inp = box.querySelector("input"), res = box.querySelector(".search-results");
  let items = [], sel = 0;
  const go = (it) => { if (!it) return; inp.value = ""; res.classList.add("hidden"); box.classList.remove("open"); nav(it.path); };
  const run = () => {
    const v = inp.value.trim().toLowerCase(), s = store.get();
    if (!v) { res.classList.add("hidden"); return; }
    const pages = Object.entries(TITLES).filter(([, l]) => l.toLowerCase().includes(v)).map(([id, l]) => ({ group: "Pages", label: l, path: id, icon: "arrowRight" }));
    const devs = devices(s).filter((h) => `${h.name} ${h.ip} ${h.role}`.toLowerCase().includes(v)).slice(0, 6)
      .map((h) => ({ group: "Devices", label: `${shortName(h)}`, sub: h.ip, path: `devices/${h.ip}`, icon: "devices" }));
    const incs = ((s && s.incidents) || []).filter((i) => `${i.id} ${i.cls} ${i.name} ${i.host}`.toLowerCase().includes(v)).slice(-6).reverse()
      .map((i) => ({ group: "Incidents", label: `${i.id} · ${clsShort(i.cls)}`, sub: shortName({ name: i.name }), path: `incidents/${i.id}`, icon: "siren" }));
    items = [...devs, ...incs, ...pages]; sel = 0;
    let g = "";
    res.innerHTML = items.length ? items.map((it, k) => `${it.group !== g ? `<div class="sr-group">${(g = it.group)}</div>` : ""}<a href="#/${it.path}" data-k="${k}" class="${k === 0 ? "sel" : ""}">${icon(it.icon)}<span class="grow ellipsis">${esc(it.label)}</span>${it.sub ? `<span class="tiny faint">${esc(it.sub)}</span>` : ""}</a>`).join("")
      : `<div class="empty small" style="padding:18px">No matches for “${esc(inp.value)}”</div>`;
    res.classList.remove("hidden");
  };
  inp.addEventListener("input", run); inp.addEventListener("focus", run);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length); res.querySelectorAll("a").forEach((a) => a.classList.toggle("sel", Number(a.dataset.k) === sel)); }
    if (e.key === "Enter") { e.preventDefault(); go(items[sel]); }
  });
  res.addEventListener("click", (e) => { const a = e.target.closest("a[data-k]"); if (a) { e.preventDefault(); go(items[Number(a.dataset.k)]); } });
}

// ---------------- chrome updates on every poll
function updateChrome(s) {
  const pill = root.querySelector("[data-mode]"), m = mode(s), p = pipeline(s);
  if (conn.server === "offline") { pill.className = "mode-pill off"; pill.innerHTML = `<span class="dot crit"></span><span class="lbl">Server offline</span>`; pill.title = conn.lastError || ""; }
  else if (!s) { pill.className = "mode-pill"; pill.innerHTML = `<span class="dot mute"></span><span class="lbl">Connecting</span>`; }
  else {
    pill.className = `mode-pill ${m === "live" ? "live" : m === "replay" ? "replay" : "off"}`;
    pill.innerHTML = `<span class="dot ${p.tone} ${p.state === "running" ? "pulse" : ""}"></span><span class="lbl">${m === "live" ? "LIVE" : m === "replay" ? "REPLAY" : "NO DATA"}${p.state !== "running" && m !== "none" ? " · paused" : ""}</span>`;
    pill.title = `${p.label}${p.age != null ? ` (last update ${Math.round(p.age)} s ago)` : ""}. ${m === "replay" ? "Replay = recorded test-bed traffic, gateway commands simulated." : m === "live" ? "Live = Docker test bed, gateway enforcing." : ""}`;
  }
  const banner = root.querySelector("[data-conn-banner]");
  banner.innerHTML = conn.server === "offline" ? `<div class="banner crit" style="margin:14px 22px 0">${icon("wifiOff")}<div><b>Lost connection to the VitalGate server.</b> Showing the last data received${conn.lastOk ? ` at ${time(conn.lastOk / 1000)}` : ""}. Retrying automatically…</div></div>`
    : s && s.missing ? `<div class="banner warn" style="margin:14px 22px 0">${icon("alert")}<div><b>No pipeline output yet.</b> Start replay or live mode (start.cmd / start.cmd live) so the console has data to show.</div></div>` : "";
  const open = ((s && s.incidents) || []).filter((i) => i.status === "active").length;
  root.querySelectorAll("[data-count]").forEach((c) => { c.textContent = open; c.classList.toggle("hidden", !open); });
  root.querySelectorAll("[data-dot]").forEach((c) => c.classList.toggle("hidden", !open));
  const unread = notifEvents(s).filter((e) => e.t > (prefs.get("lastSeenEvent") || 0)).length, ub = root.querySelector("[data-unread]");
  ub.textContent = unread > 99 ? "99+" : unread; ub.classList.toggle("hidden", !unread);
  root.querySelector("[data-foot]").textContent = s && s.data_time ? `Data clock ${time(s.data_time)} · ${m} mode · refreshed ${time(Date.now() / 1000)}` : "";
}

// ---------------- router
async function route() {
  const parts = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/").map(decodeURIComponent);
  const id = PAGES[parts[0]] ? parts[0] : "dashboard", params = parts.slice(1);
  root.classList.remove("nav-open"); closeMenus();
  root.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === id));
  root.querySelector("[data-title]").textContent = TITLES[id];
  root.querySelector("[data-crumb]").textContent = params.length ? `/ ${TITLES[id]} / ${params[0]}` : `/ ${TITLES[id]}`;
  document.title = `${TITLES[id]} · VitalGate`;
  if (current && current.destroy) current.destroy();
  const el = document.getElementById("content");
  el.innerHTML = `<div class="skel" style="height:90px;margin-bottom:16px"></div><div class="skel" style="height:320px"></div>`;
  const key = `${id}/${params.join("/")}`; currentId = key;
  let mod;
  try { mod = (await PAGES[id]()).default; } catch (e) { el.innerHTML = `<div class="banner crit">${icon("alert")}<div>This page failed to load: ${esc(e.message)}</div></div>`; return; }
  if (currentId !== key) return;
  el.innerHTML = ""; el.scrollTop = 0; window.scrollTo(0, 0);
  current = mod.mount(el, params, ctx) || {};
  if (store.get() && current.update) current.update(store.get(), true);
}

async function boot() {
  applyTheme();
  shell();
  try { me = await api.me(); } catch { return; }
  const name = (me.profile && me.profile.fullname) || me.user;
  root.querySelector("[data-avatar]").textContent = initials(name);
  root.querySelector("[data-who]").textContent = name;
  store.on((s, changed) => {
    updateChrome(s);
    if (changed) browserNotify(s);
    if (current && current.update) { try { current.update(s, changed); } catch (e) { console.error(e); } }
  });
  window.addEventListener("hashchange", route);
  await route();
  store.start();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
boot();
export { toast };
