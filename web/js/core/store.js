// Live state of the VitalGate pipeline. Polls /api/state (ETag: unchanged data costs one 304), tracks the
// connection to this server and whether the pipeline (replay.py / live.py) is still writing.
import { api } from "./api.js";
import { prefs } from "./prefs.js";

const subs = new Set();
let state = null, etag = null, timer = null, inflight = false, version = 0;
export const conn = { server: "connecting", lastOk: null, lastError: null, failures: 0 };
const cache = {};

function notify(changed) { subs.forEach((f) => { try { f(state, changed); } catch (e) { console.error(e); } }); }

async function poll() {
  if (inflight) return;
  inflight = true;
  try {
    const r = await api.state(etag);
    conn.server = "online"; conn.lastOk = Date.now(); conn.failures = 0; conn.lastError = null;
    if (!r.notModified) { state = r.data; etag = r.etag; version++; notify(true); }
    else { if (state) state.server_time = Date.now() / 1000; notify(false); }
  } catch (e) {
    conn.failures++; conn.lastError = e.message;
    conn.server = conn.failures >= 2 ? "offline" : "degraded";
    notify(false);
  } finally {
    inflight = false;
    schedule();
  }
}
function schedule() {
  clearTimeout(timer);
  const base = Math.max(1, Number(prefs.get("refresh")) || 2) * 1000;
  const backoff = conn.failures ? Math.min(30000, base * 2 ** Math.min(conn.failures, 4)) : base;
  timer = setTimeout(poll, document.hidden ? Math.max(backoff, 10000) : backoff);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { clearTimeout(timer); poll(); } });
prefs.on((k) => { if (k === "refresh") schedule(); });

export const store = {
  start() { poll(); },
  refresh() { clearTimeout(timer); return poll(); },
  get: () => state,
  version: () => version,
  on(f) { subs.add(f); return () => subs.delete(f); },
  // occasional data (model metadata, research results...) cached for maxAge seconds
  async once(key, fn, maxAge = 300) {
    const c = cache[key];
    if (c && Date.now() - c.t < maxAge * 1000) return c.v;
    const v = await fn(); cache[key] = { v, t: Date.now() }; return v;
  },
  forget(key) { delete cache[key]; },
  // optimistic local merge after an analyst action, before the next poll confirms it
  patchFeedback(iid, fb) { if (state) { state.feedback = { ...(state.feedback || {}), [iid]: fb }; notify(true); } },
};
