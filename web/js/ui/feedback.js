// Toasts and modal dialogs.
import { icon } from "./icons.js";
import { esc } from "../core/fmt.js";

let box = null;
export function toast(msg, kind = "info", ms = 3800) {
  if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  const t = document.createElement("div"); t.className = `toast ${kind}`;
  t.innerHTML = `${icon(kind === "ok" ? "checkCircle" : kind === "err" ? "xCircle" : "info")}<div>${esc(msg)}</div>`;
  box.appendChild(t); setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, ms);
}

/** Generic modal. Returns {el, close}. body is HTML. */
export function modal({ title, body, icon: ic = "info", tone = "", wide = false, actions = [] }) {
  const back = document.createElement("div"); back.className = "modal-back";
  back.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="mt">
    <div class="modal-h"><div class="mic ${tone}">${icon(ic)}</div><div class="grow"><h2 id="mt">${esc(title)}</h2></div>
    <button class="icon-btn" data-x aria-label="Close" style="width:32px;height:32px">${icon("x")}</button></div>
    <div class="modal-b">${body}</div><div class="modal-f"></div></div>`;
  const foot = back.querySelector(".modal-f"), prev = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); prev && prev.focus && prev.focus(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  for (const a of actions) {
    const b = document.createElement("button"); b.className = `btn ${a.cls || ""}`; b.innerHTML = `${a.icon ? icon(a.icon) : ""}<span>${esc(a.label)}</span>`;
    b.onclick = async () => {
      if (!a.run) return close();
      b.classList.add("loading"); b.disabled = true;
      try { const keep = await a.run(back); if (keep !== true) close(); }
      catch (e) { toast(e.message || String(e), "err"); }
      finally { b.classList.remove("loading"); b.disabled = false; }
    };
    foot.appendChild(b);
  }
  if (!actions.length) foot.remove();
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-x]")) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(back);
  (back.querySelector("input,textarea,select") || foot.querySelector(".btn:last-child") || back.querySelector("[data-x]"))?.focus();
  return { el: back, close };
}

/** Confirmation for actions with consequences. Resolves true/false. */
export function confirmDialog({ title, body, confirm = "Confirm", tone = "warn", icon: ic = "alert", danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({ title, body, icon: ic, tone, actions: [
      { label: "Cancel", run: () => { done = true; resolve(false); } },
      { label: confirm, cls: danger ? "danger" : "primary", run: () => { done = true; resolve(true); } },
    ] });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

/** Wrap an async button action with loading/disabled state and success/error feedback. */
export async function busy(btn, fn, okMsg) {
  btn.classList.add("loading"); btn.disabled = true;
  try { const r = await fn(); if (okMsg) toast(okMsg, "ok"); return r; }
  catch (e) { toast(e.message || String(e), "err"); throw e; }
  finally { btn.classList.remove("loading"); btn.disabled = false; }
}
