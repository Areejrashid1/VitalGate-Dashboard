// Formatting helpers. All times are unix seconds.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
export function time(t) { if (t == null) return "—"; const d = new Date(t * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
export function hm(t) { if (t == null) return "—"; const d = new Date(t * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function date(t) { if (t == null) return "—"; const d = new Date(t * 1000); return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); }
export function dateTime(t) { if (t == null) return "—"; const d = new Date(t * 1000); return `${d.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} ${time(t)}`; }
export function isoDate(t) { const d = new Date(t * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function dur(s) {
  if (s == null || !isFinite(s)) return "—";
  s = Math.max(0, s);
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 >= 1 && s < 600 ? ` ${Math.round(s % 60)} s` : ""}`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.round((s % 86400) / 3600)} h`;
}
export function ago(t, now) { if (t == null || now == null) return "—"; const s = now - t; return s < 2 ? "just now" : `${dur(s)} ago`; }
export function bytes(b) {
  if (b == null || !isFinite(b)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; b = Number(b);
  while (Math.abs(b) >= 1000 && i < u.length - 1) { b /= 1000; i++; }
  return `${b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)} ${u[i]}`;
}
export function rate(bps) { return bps == null ? "—" : `${bytes(bps)}/s`; }
export function num(n, d = 0) { if (n == null || !isFinite(n)) return "—"; return Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }); }
export function compact(n) { if (n == null) return "—"; return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n); }
export function pct(x, d = 0) { return x == null || !isFinite(x) ? "—" : `${(x * 100).toFixed(d)}%`; }
export function initials(name) { return String(name || "?").split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?"; }
export function csv(rows, cols) {
  const q = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map((c) => q(c.label)).join(","), ...rows.map((r) => cols.map((c) => q(c.get(r))).join(","))].join("\r\n");
}
export function download(name, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
