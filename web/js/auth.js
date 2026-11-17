// Sign-in, account request and password-help pages.
import { icon, LOGO } from "./ui/icons.js";

const page = document.body.dataset.page;
const $ = (s) => document.querySelector(s);
document.querySelectorAll("[data-ic]").forEach((s) => { s.outerHTML = icon(s.dataset.ic); });

// ---- theme
const getPrefs = () => { try { return JSON.parse(localStorage.getItem("vg_prefs") || "{}"); } catch { return {}; } };
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  const p = getPrefs(); p.theme = t; try { localStorage.setItem("vg_prefs", JSON.stringify(p)); } catch { /* ignore */ }
  $("[data-theme-fab]").innerHTML = icon(t === "dark" ? "sun" : "moon");
}
setTheme(document.documentElement.dataset.theme || "light");
$("[data-theme-fab]").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

// ---- brand panel (animated imaging network: modalities -> VitalGate gateway -> PACS, one device isolated)
$("[data-mbrand]").innerHTML = `${LOGO}<div><b style="font-size:18px">VitalGate</b><div class="small muted">Securing the Future of Medical Imaging.</div></div>`;
$("[data-brand]").innerHTML = `
  <div class="auth-logo">${LOGO}<div><b>VitalGate</b><small>Intelligent Security for Medical Imaging Infrastructure</small></div></div>
  <div class="auth-hero">
    <h1>Securing the Future of Medical Imaging.</h1>
    <p>Federated, explainable, real-time intrusion detection with graded zero-trust isolation for DICOM networks: every scanner watched, every alert explained, and clinical imaging kept running.</p>
    <svg class="auth-map" viewBox="0 0 560 230" aria-hidden="true">
      <defs><linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60A5FA"/><stop offset="1" stop-color="#1769E0"/></linearGradient></defs>
      ${[["CT", 40], ["MRI", 100], ["X-ray", 160]].map(([n, y]) => `<g><rect x="6" y="${y - 18}" width="112" height="36" rx="9" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.28)"/><circle cx="22" cy="${y}" r="7" fill="none" stroke="#9CC3FF" stroke-width="2"/><circle cx="22" cy="${y}" r="2.5" fill="#9CC3FF"/><text x="35" y="${y + 4}">${n} scanner</text>
        <path id="f${n}" class="flow" d="M118 ${y} C170 ${y},170 115,224 115" stroke="#9CC3FF" stroke-width="2" fill="none"/></g>`).join("")}
      <g><rect x="6" y="196" width="112" height="30" rx="9" fill="rgba(220,53,69,.18)" stroke="rgba(255,120,130,.6)"/><text x="22" y="215">Unknown host</text>
        <path class="flow bad" d="M118 211 C150 211,170 150,224 135" stroke="#FF8A94" stroke-width="2" fill="none"/>
        <g transform="translate(166 172)"><circle r="11" fill="#DC3545"/><path d="M-4 -4 4 4M4 -4 -4 4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></g></g>
      <g transform="translate(262 115)"><circle r="44" fill="none" stroke="rgba(150,195,255,.5)" class="ringpulse"/><circle r="38" fill="url(#gw)" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>
        <path d="M0 -18 15 -12v8C15 6 8 13 0 16-8 13-15 6-15-4v-8z" fill="#fff" opacity=".95"/><path d="M-7 0h4l2-5 3 9 2-5h3" stroke="#1769E0" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <text y="58" text-anchor="middle" style="font-weight:700">VitalGate gateway</text><text y="72" text-anchor="middle" style="opacity:.7">AI · XAI · zero-trust</text></g>
      <path class="flow" d="M306 115 H420" stroke="#9CC3FF" stroke-width="2.5" fill="none"/>
      <g transform="translate(420 70)"><rect width="120" height="90" rx="12" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.35)"/>
        ${[0, 1, 2].map((i) => `<rect x="16" y="${16 + i * 22}" width="88" height="14" rx="3" fill="rgba(255,255,255,.18)"/><circle cx="26" cy="${23 + i * 22}" r="2.5" fill="#6EE7B7"/>`).join("")}
        <text x="60" y="110" text-anchor="middle" style="font-weight:700">PACS archive</text></g>
    </svg>
  </div>
  <div>
    <div class="auth-feats">
      <div class="auth-feat">${icon("network")}<b>Federated</b><span>Hospitals train together without sharing traffic.</span></div>
      <div class="auth-feat">${icon("bulb")}<b>Explainable</b><span>Every alert shows the evidence behind it.</span></div>
      <div class="auth-feat">${icon("shieldCheck")}<b>Fail-open</b><span>Gateway actions expire on their own: imaging never blocked for good.</span></div>
    </div>
    <div class="auth-foot" style="margin-top:22px">© VitalGate · NETSOL IDS research · Authorised personnel only</div>
  </div>`;

// ---- helpers
const alertBox = $("[data-alert]");
function say(kind, html) { alertBox.className = `alert show ${kind}`; alertBox.innerHTML = `${icon(kind === "ok" ? "checkCircle" : kind === "info" ? "info" : "alert")}<div>${html}</div>`; }
const clearAlert = () => { alertBox.className = "alert"; alertBox.innerHTML = ""; };
function fieldErr(name, msg) {
  const e = document.querySelector(`[data-err="${name}"]`), inp = document.querySelector(`[name="${name}"]`);
  if (e) e.textContent = msg || ""; if (inp) inp.classList.toggle("bad", !!msg);
}
function eye(btn, inp) {
  if (!btn) return;
  const draw = () => { btn.innerHTML = icon(inp.type === "password" ? "eye" : "eyeOff"); btn.setAttribute("aria-label", inp.type === "password" ? "Show password" : "Hide password"); };
  btn.onclick = () => { inp.type = inp.type === "password" ? "text" : "password"; draw(); inp.focus(); }; draw();
}
function caps(inp) { const c = $("[data-caps]"); if (!c || !inp) return; const f = (e) => c.classList.toggle("on", !!(e.getModifierState && e.getModifierState("CapsLock"))); inp.addEventListener("keydown", f); inp.addEventListener("keyup", f); }
async function post(url, body) {
  const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let d = {}; try { d = await r.json(); } catch { /* empty */ }
  return { status: r.status, ok: r.ok, data: d };
}
function setBusy(b) { const s = $("[data-submit]"); if (!s) return; s.disabled = b; s.classList.toggle("busy", b); }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- server status (also tells the user when the console is down before they type)
async function ping() {
  const s = $("[data-srv]"); if (!s) return;
  try { const r = await fetch("/api/ping", { cache: "no-store" }); if (!r.ok) throw 0; s.innerHTML = `<span class="dot ok"></span>Server online`; }
  catch { s.innerHTML = `<span class="dot crit"></span>Server unreachable`; }
}

// =========================================================== login
if (page === "login") {
  const form = $("[data-form]"), u = form.username, p = form.password, rem = $("[data-remember]");
  eye($("[data-eye]"), p); caps(p);
  const saved = getPrefs().rememberUser;
  if (saved) { u.value = saved; rem.checked = true; p.focus(); } else u.focus();
  const q = new URLSearchParams(location.search);
  if (q.has("expired")) say("info", "Your session ended. Please sign in again.");
  if (q.has("out")) say("ok", "You have been signed out.");
  if (q.has("requested")) say("ok", "Account request sent. You can sign in once an administrator approves it.");
  history.replaceState(null, "", "/login");
  let lockTimer = null;
  function lock(sec) {
    setBusy(true); const s = $("[data-submit]"), label = $("[data-label]");
    clearInterval(lockTimer);
    const tick = () => { label.textContent = `Try again in ${sec}s`; if (sec-- <= 0) { clearInterval(lockTimer); label.textContent = "Sign in"; setBusy(false); s.classList.remove("busy"); } };
    s.classList.remove("busy"); tick(); lockTimer = setInterval(tick, 1000);
  }
  [u, p].forEach((i) => i.addEventListener("input", () => fieldErr(i.name, "")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); clearAlert();
    let bad = false;
    if (!u.value.trim()) { fieldErr("username", "Enter your username"); bad = true; }
    else if (!/^[A-Za-z0-9_.@-]{2,40}$/.test(u.value.trim())) { fieldErr("username", "Usernames use letters, digits and . _ @ -"); bad = true; }
    if (!p.value) { fieldErr("password", "Enter your password"); bad = true; }
    if (bad) { form.classList.add("shake"); setTimeout(() => form.classList.remove("shake"), 400); return; }
    setBusy(true);
    try {
      const r = await post("/api/login", { username: u.value.trim(), password: p.value, remember: rem.checked });
      if (r.ok) {
        const pr = getPrefs(); if (rem.checked) pr.rememberUser = u.value.trim(); else delete pr.rememberUser;
        try { localStorage.setItem("vg_prefs", JSON.stringify(pr)); } catch { /* ignore */ }
        $("[data-label]").textContent = "Signed in"; say("ok", "Signed in. Opening the console…");
        location.href = "/"; return;
      }
      if (r.status === 429) { say("err", esc(r.data.error)); lock(r.data.retry || 60); return; }
      say("err", esc(r.data.error || "Sign-in failed"));
      p.value = ""; p.focus(); form.classList.add("shake"); setTimeout(() => form.classList.remove("shake"), 400);
    } catch { say("err", "Cannot reach the VitalGate server. Is it running? (start.cmd)"); }
    setBusy(false);
  });
  ping(); setInterval(ping, 10000);
}

// =========================================================== signup
if (page === "signup") {
  const form = $("[data-form]"), p = form.password, p2 = form.confirm, user = form.username;
  eye($("[data-eye]"), p); eye($("[data-eye2]"), p2); caps(p);
  form.fullname.focus();
  const rules = { len: (v) => v.length >= 10, let: (v) => /[A-Za-z]/.test(v), dig: (v) => /\d/.test(v), user: (v) => !!v && !(user.value && v.toLowerCase().includes(user.value.toLowerCase())) };
  function strength() {
    const v = p.value; let sc = 0;
    for (const [k, f] of Object.entries(rules)) { const ok = f(v); document.querySelector(`[data-r="${k}"]`).classList.toggle("ok", ok); }
    if (v.length >= 10) sc++; if (v.length >= 14) sc++; if (/[a-z]/.test(v) && /[A-Z]/.test(v)) sc++; if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) sc++;
    if (!Object.values(rules).every((f) => f(v))) sc = Math.min(sc, 1);
    const cols = ["var(--crit)", "var(--orange)", "var(--warn)", "var(--ok)"], names = ["Too weak", "Weak", "Fair", "Good", "Strong"];
    document.querySelectorAll("[data-meter] i").forEach((i, k) => { i.style.background = v && k < Math.max(1, sc) ? cols[Math.max(0, sc - 1)] : "var(--grid)"; });
    $("[data-meter-txt]").textContent = v ? `Strength: ${names[sc]}` : "Password strength";
  }
  p.addEventListener("input", () => { strength(); fieldErr("password", ""); }); user.addEventListener("input", strength);
  form.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => fieldErr(i.name, "")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); clearAlert();
    const v = { fullname: form.fullname.value.trim(), email: form.email.value.trim(), username: user.value.trim(), password: p.value };
    let bad = false;
    const need = (c, n, m) => { if (!c) { fieldErr(n, m); bad = true; } };
    need(v.fullname.length >= 2, "fullname", "Enter your full name");
    need(/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(v.email), "email", "Enter a valid email address");
    need(/^[A-Za-z0-9_.@-]{2,40}$/.test(v.username), "username", "2–40 letters, digits or . _ @ -");
    need(Object.values(rules).every((f) => f(v.password)), "password", "Meet all the password rules below");
    need(p2.value === v.password && !!p2.value, "confirm", "Passwords do not match");
    need($("[data-terms]").checked, "terms", "Please accept the terms of use");
    if (bad) { form.classList.add("shake"); setTimeout(() => form.classList.remove("shake"), 400); return; }
    setBusy(true);
    try {
      const r = await post("/api/signup", { ...v, terms: true });
      if (r.ok) {
        form.reset(); strength();
        say("ok", `<b>Request sent.</b> ${esc(r.data.message)}<br>Administrator command: <code>python server.py --approve ${esc(v.username)}</code>`);
        form.style.display = "none";
      } else { if (r.data.field) fieldErr(r.data.field, r.data.error); say("err", esc(r.data.error || "Request failed")); }
    } catch { say("err", "Cannot reach the VitalGate server."); }
    setBusy(false);
  });
}
