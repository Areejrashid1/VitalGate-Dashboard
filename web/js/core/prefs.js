// Per-browser preferences (theme, refresh rate, notifications...). Stored in localStorage; never security relevant.
const KEY = "vg_prefs";
const DEFAULTS = { theme: "light", refresh: 2, range: "1h", notifyBrowser: false, notifyMinLevel: 3, sidebarCollapsed: false,
  dense: false, lastSeenEvent: 0, deviceView: "grid" };
let cur = { ...DEFAULTS };
try { cur = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { /* storage blocked */ }
const subs = new Set();
export const prefs = {
  get: (k) => cur[k],
  all: () => ({ ...cur }),
  set(k, v) { cur[k] = v; try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* ignore */ } subs.forEach((f) => f(k, v)); },
  on(f) { subs.add(f); return () => subs.delete(f); },
  reset() { cur = { ...DEFAULTS, lastSeenEvent: cur.lastSeenEvent }; try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* ignore */ } subs.forEach((f) => f("*")); },
};
export function applyTheme(t = cur.theme) {
  document.documentElement.dataset.theme = t === "dark" ? "dark" : "light";
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === "dark" ? "#0A1628" : "#F5F8FC";
}
