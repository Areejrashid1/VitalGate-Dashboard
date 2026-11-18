// Settings: profile, account (password), appearance, notifications, dashboard preferences, system status.
import { icon } from "../ui/icons.js";
import { card, badge, pageHead, banner } from "../ui/components.js";
import { esc, dateTime, time, num, initials } from "../core/fmt.js";
import { api } from "../core/api.js";
import { prefs } from "../core/prefs.js";
import { conn } from "../core/store.js";
import { toast, busy, confirmDialog } from "../ui/feedback.js";
import * as D from "../core/derive.js";

export default {
  mount(el, params, ctx) {
    const me = ctx.me, p = me.profile || {};
    el.innerHTML = `${pageHead("Settings", "Your profile and preferences, and the status of the VitalGate backend. Preferences are stored in this browser; account data on the VitalGate server.")}
      <div class="grid g2">
        ${card({ title: "User profile", icon: "user", body: `<div class="row mb12" style="gap:14px"><span class="avatar" style="width:52px;height:52px;font-size:18px;border-radius:14px" data-av>${esc(initials(p.fullname || me.user))}</span><div><b>${esc(p.fullname || me.user)}</b><div class="small muted">${esc(me.user)} · SOC analyst · ${me.account === "product" ? "account from the product (read-only)" : "console account"}</div></div></div>
          <form data-prof class="col" style="gap:12px"><div class="field"><label for="fn">Full name</label><input class="input" id="fn" name="fullname" maxlength="80" value="${esc(p.fullname || "")}"></div>
          <div class="field"><label for="em">Email</label><input class="input" id="em" name="email" type="email" maxlength="200" value="${esc(p.email || "")}"></div>
          <div><button class="btn primary" type="submit">${icon("check")}<span>Save profile</span></button></div></form>` })}
        ${card({ title: "Account", icon: "key", body: `<dl class="kv mb12"><dt>Username</dt><dd>${esc(me.user)}</dd><dt>Created</dt><dd>${esc(me.created ? dateTime(me.created) : "—")}</dd><dt>Sign-in</dt><dd>session cookie (HttpOnly, SameSite=Strict)</dd><dt>Role</dt><dd>SOC analyst (all accounts have the same rights)</dd></dl>
          <form data-pw class="col" style="gap:10px"><div class="field"><label for="cp">Current password</label><input class="input" id="cp" name="current" type="password" autocomplete="current-password" required></div>
          <div class="grid g2" style="gap:10px"><div class="field"><label for="np">New password</label><input class="input" id="np" name="new" type="password" autocomplete="new-password" required minlength="10"></div><div class="field"><label for="np2">Repeat new password</label><input class="input" id="np2" name="new2" type="password" autocomplete="new-password" required></div></div>
          <div class="tiny muted">At least 10 characters with letters and a digit. Your other sessions are signed out.</div><div><button class="btn" type="submit">${icon("lock")}<span>Change password</span></button></div></form>` })}
        ${card({ title: "Appearance", icon: "sun", body: `<div class="row between"><div><b class="small">Theme</b><div class="tiny muted">Applies to every page and is remembered in this browser</div></div><div class="seg" data-theme>${[["light", "Light"], ["dark", "Dark"]].map(([v, l]) => `<button data-v="${v}" class="${prefs.get("theme") === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
          <div class="row between mt16"><div><b class="small">Collapsed sidebar</b><div class="tiny muted">Icons only, more room for data</div></div><label class="switch"><input type="checkbox" data-pref="sidebarCollapsed" ${prefs.get("sidebarCollapsed") ? "checked" : ""}><span></span></label></div>` })}
        ${card({ title: "Notifications", icon: "bell", body: `<div class="row between"><div><b class="small">Desktop notifications</b><div class="tiny muted">Browser pop-ups for new incidents and escalations while the console is open</div></div><label class="switch"><input type="checkbox" data-notify ${prefs.get("notifyBrowser") ? "checked" : ""}><span></span></label></div>
          <div class="row between mt16"><div><b class="small">Notify from level</b><div class="tiny muted">Escalations below this level stay in the bell menu only</div></div><select class="input sm" data-minlvl>${[1, 2, 3, 4].map((l) => `<option value="${l}" ${Number(prefs.get("notifyMinLevel")) === l ? "selected" : ""}>L${l} ${D.LEVELS[l].name}</option>`).join("")}</select></div>
          <div class="tiny muted mt12" data-perm></div>` })}
        ${card({ title: "Dashboard preferences", icon: "dashboard", body: `<div class="row between"><div><b class="small">Refresh interval</b><div class="tiny muted">How often the console asks the server for new data</div></div><select class="input sm" data-refresh>${[1, 2, 5, 10, 30].map((v) => `<option value="${v}" ${Number(prefs.get("refresh")) === v ? "selected" : ""}>${v} s</option>`).join("")}</select></div>
          <div class="row between mt16"><div><b class="small">Default timeline range</b></div><select class="input sm" data-range>${["1h", "6h", "24h", "7d"].map((v) => `<option ${prefs.get("range") === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          <div class="row between mt16"><div><b class="small">Device page view</b></div><select class="input sm" data-dview><option value="grid" ${prefs.get("deviceView") === "grid" ? "selected" : ""}>Cards</option><option value="table" ${prefs.get("deviceView") === "table" ? "selected" : ""}>Table</option></select></div>
          <div class="mt16"><button class="btn sm" data-reset>${icon("refresh")}<span>Reset preferences</span></button></div>` })}
        ${card({ title: "System configuration status", icon: "server", body: `<div data-sys></div>` })}
      </div>
      <div class="grid g2 mt16">
        ${card({ title: "Model information", icon: "cpu", body: `<div data-model><div class="skel" style="height:120px"></div></div>` })}
        ${"" && card({ title: "Application information", icon: "info", body: `<dl class="kv"><dt>Application</dt><dd>VitalGate SOC console (multi-page web app, installable PWA)</dd><dt>Tagline</dt><dd>Intelligent Security for Medical Imaging Infrastructure</dd><dt>Backend</dt><dd>server.py (Python standard library) reading the VitalGate product: ${esc(me.product || "product")}</dd>
          <dt>Data sources</dt><dd class="small">soc/data/incidents.json · feedback.json · testbed/out/pep/* · bundle*/ · eval/results/*</dd><dt>Changes from here</dt><dd class="small">analyst triage (feedback.json), your profile and password. Model, policy and gateway are read-only.</dd></dl>` })}
      </div>`;
    const $ = (s) => el.querySelector(s);
    $("[data-prof]").onsubmit = async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      try { const r = await busy(e.submitter || e.target.querySelector("button"), () => api.profile({ fullname: fd.get("fullname"), email: fd.get("email") }), "Profile saved"); me.profile = r.profile;
        document.querySelector("[data-who]").textContent = r.profile.fullname || me.user; document.querySelector("[data-avatar]").textContent = initials(r.profile.fullname || me.user); $("[data-av]").textContent = initials(r.profile.fullname || me.user); } catch { /* toast shown */ }
    };
    $("[data-pw]").onsubmit = async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      if (fd.get("new") !== fd.get("new2")) return toast("The new passwords do not match", "err");
      try { await busy(e.submitter || e.target.querySelector("button"), () => api.password({ current: fd.get("current"), new: fd.get("new") }), "Password changed. Other sessions were signed out."); e.target.reset(); } catch { /* toast shown */ }
    };
    $("[data-theme]").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; prefs.set("theme", b.dataset.v); el.querySelectorAll("[data-theme] button").forEach((x) => x.classList.toggle("on", x === b)); };
    el.querySelector("[data-pref=sidebarCollapsed]").onchange = (e) => { prefs.set("sidebarCollapsed", e.target.checked); document.getElementById("app").classList.toggle("collapsed", e.target.checked); };
    const perm = () => { $("[data-perm]").textContent = !("Notification" in window) ? "This browser does not support desktop notifications." : `Browser permission: ${Notification.permission}.`; };
    perm();
    $("[data-notify]").onchange = async (e) => {
      if (e.target.checked && "Notification" in window && Notification.permission !== "granted") {
        const r = await Notification.requestPermission(); if (r !== "granted") { e.target.checked = false; toast("Notifications were not allowed by the browser", "err"); perm(); return; }
      }
      prefs.set("notifyBrowser", e.target.checked); toast(e.target.checked ? "Desktop notifications on" : "Desktop notifications off", "ok"); perm();
    };
    $("[data-minlvl]").onchange = (e) => { prefs.set("notifyMinLevel", Number(e.target.value)); toast("Saved", "ok"); };
    $("[data-refresh]").onchange = (e) => { prefs.set("refresh", Number(e.target.value)); toast(`Refreshing every ${e.target.value} s`, "ok"); };
    $("[data-range]").onchange = (e) => { prefs.set("range", e.target.value); toast("Saved", "ok"); };
    $("[data-dview]").onchange = (e) => { prefs.set("deviceView", e.target.value); toast("Saved", "ok"); };
    $("[data-reset]").onclick = async () => { if (await confirmDialog({ title: "Reset preferences?", body: "Theme, refresh rate, notification and view settings in this browser go back to defaults.", confirm: "Reset", icon: "refresh", tone: "" })) { prefs.reset(); toast("Preferences reset", "ok"); ctx.nav("settings"); location.reload(); } };
    ctx.store.once("model", api.model).then((m) => {
      const b = m.bundles.find((x) => x.dir === "bundle") || {};
      $("[data-model]").innerHTML = `<dl class="kv"><dt>Model</dt><dd>${esc(b.model || "—")}</dd><dt>Bundle frozen</dt><dd>${esc(b.frozen_at || "—")}</dd><dt>Accepted updates</dt><dd>${esc(b.n_updates)}</dd><dt>Features</dt><dd>${esc(b.n_features)}</dd><dt>Classes</dt><dd>${esc((b.classes || []).length)} (${esc((b.classes || []).join(", "))})</dd><dt>Calibration</dt><dd>temperature ${esc(b.temperature)}</dd><dt>Other bundles</dt><dd>${esc(m.bundles.filter((x) => x.dir !== "bundle").map((x) => x.dir).join(", ") || "none")}</dd></dl><a class="btn sm mt12" href="#/federated">Federated learning ${icon("arrowRight")}</a>`;
    }).catch((e) => { $("[data-model]").innerHTML = banner("crit", esc(e.message)); });
    function draw(s) {
      if (!s) return;
      const m = D.mode(s), pl = D.pipeline(s), sys = s.system || {};
      const rows = [["Console server", conn.server === "online" ? ["ok", `connected · refresh every ${prefs.get("refresh")} s`] : ["crit", conn.server]],
        ["Product folder", me.product_found ? ["ok", me.product] : ["crit", "not found: start server.py with --product"]],
        ["Pipeline output", [pl.tone, `${pl.label}${pl.age != null ? ` · written ${Math.round(pl.age)} s ago` : ""}`]],
        ["Mode", [m === "none" ? "crit" : "info", m === "live" ? "live (Docker test bed + gateway)" : m === "replay" ? "replay (recorded traffic)" : "no data"]],
        ["Detector", ["info", `CUSUM k ${sys.response?.kref ?? "?"} · h ${sys.response?.h ?? "?"} · TTL ${sys.response?.ttl_s ?? "?"} s`]],
        ["Gateway (PEP)", m === "live" ? [sys.pep?.mode === "enforcing" ? "ok" : "crit", sys.pep?.mode || "unknown"] : ["info", "simulated in replay"]],
        ["Started by launcher", s.run ? ["ok", `${s.run.mode} · ${s.run.started}`] : ["mute", "started by hand or unknown"]]];
      $("[data-sys]").innerHTML = rows.map(([k, [tone, v]]) => `<div class="row between" style="padding:7px 0;border-bottom:1px solid var(--border)"><span class="small muted">${esc(k)}</span><span class="row small" style="font-weight:560;text-align:right"><span class="dot ${tone}"></span>${esc(v)}</span></div>`).join("");
    }
    return { update: draw };
  },
};
