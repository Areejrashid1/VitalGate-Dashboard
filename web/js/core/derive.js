// Domain helpers: turn the pipeline's state (incidents.json) into what the pages show. Nothing here invents data;
// every number is computed from fields the VitalGate pipeline wrote.

export const LEVELS = [
  { n: 0, key: "allow", name: "Allow", color: "var(--l0)", text: "Normal zero-trust checks only. No extra restriction." },
  { n: 1, key: "watch", name: "Watch", color: "var(--l1)", text: "Traffic counted and logged at the gateway; SOC ticket." },
  { n: 2, key: "restrict", name: "Restrict", color: "var(--l2)", text: "New DICOM connections limited (rate limit); on-call engineer paged." },
  { n: 3, key: "quarantine", name: "Quarantine", color: "var(--l3)", text: "DICOM uploads redirected to the quarantine store for checking; everything else dropped, open connections reset." },
  { n: 4, key: "isolate", name: "Isolate", color: "var(--l4)", text: "All traffic to and from the host dropped; open connections reset." },
];

export const CLASS = {
  ae_bruteforce: { label: "AE-title brute force", short: "AE brute force" },
  assoc_flood: { label: "Association flood", short: "Assoc. flood" },
  exfiltration: { label: "Bulk data exfiltration", short: "Exfiltration" },
  malformed_pdu: { label: "Malformed DICOM PDU", short: "Malformed PDU" },
  ransomware_like: { label: "Ransomware-like upload burst", short: "Ransomware-like" },
  recon: { label: "Reconnaissance / scanning", short: "Recon" },
  preamble_polyglot: { label: "Executable in DICOM preamble", short: "Preamble exec" },
  benign: { label: "Benign", short: "Benign" },
};
export const clsLabel = (c) => (CLASS[c] || { label: c || "unknown" }).label;
export const clsShort = (c) => (CLASS[c] || { short: c || "unknown" }).short;
export const CLASS_COLORS = { ae_bruteforce: "var(--c3)", assoc_flood: "var(--c4)", exfiltration: "var(--c5)", malformed_pdu: "var(--c2)",
  ransomware_like: "var(--c7)", recon: "var(--c1)", preamble_polyglot: "#B5179E", benign: "var(--c6)" };

export const STATUS = {
  normal: { label: "Normal", tone: "ok", color: "var(--l0)" },
  monitoring: { label: "Monitoring", tone: "info", color: "var(--l1)" },
  restricted: { label: "Restricted", tone: "warn", color: "var(--l2)" },
  quarantined: { label: "Quarantined", tone: "orange", color: "var(--l3)" },
  isolated: { label: "Isolated", tone: "crit", color: "var(--l4)" },
};
export function secStatus(level) { return ["normal", "monitoring", "restricted", "quarantined", "isolated"][Math.max(0, Math.min(4, level | 0))]; }
export const CONN = {
  online: { label: "Online", tone: "ok" }, idle: { label: "Idle", tone: "warn" }, offline: { label: "Offline", tone: "crit" }, "not seen": { label: "Not seen yet", tone: "mute" },
};

export function mode(s) {
  if (!s || s.missing) return "none";
  return (s.meta && s.meta.source) || (s.system && s.system.mode) || "none";
}
/** Data clock: the pipeline's own time (replay plays recorded traffic, so wall-clock time would be wrong). */
export const now = (s) => (s && (s.data_time || s.generated)) || Date.now() / 1000;
/** Is the pipeline still writing? (live saves every second, replay every half second while streaming) */
export function pipeline(s) {
  if (!s || s.missing) return { state: "none", label: "No pipeline output", tone: "crit" };
  const age = (s.server_time || Date.now() / 1000) - (s.generated || 0);
  if (age < 15) return { state: "running", label: mode(s) === "live" ? "Live pipeline running" : "Replay streaming", tone: "ok", age };
  return { state: "stopped", label: mode(s) === "live" ? "Live pipeline not updating" : "Replay finished / stopped", tone: mode(s) === "live" ? "crit" : "warn", age };
}

export function deviceKind(h) {
  const n = `${h.name || ""} ${h.role || ""}`.toLowerCase();
  if (/\bct\b|ct scanner|ct_/.test(n)) return { kind: "ct", modality: "CT", label: "CT scanner" };
  if (/mri|mr_scan|\bmr\b/.test(n)) return { kind: "mri", modality: "MR", label: "MRI scanner" };
  if (/\bcr\b|cr x-ray|cr_/.test(n)) return { kind: "cr", modality: "CR", label: "Computed radiography (X-ray)" };
  if (/\bdx\b|dx x-ray|dx_/.test(n)) return { kind: "dx", modality: "DX", label: "Digital X-ray" };
  if (/ultrasound|us_scan|\bus\b/.test(n)) return { kind: "us", modality: "US", label: "Ultrasound" };
  if (/workstation|ws_read/.test(n)) return { kind: "ws", modality: "—", label: "Reading workstation" };
  if (/monitor|nms/.test(n)) return { kind: "nms", modality: "—", label: "Network monitoring probe" };
  if (/pacs/.test(n)) return { kind: "pacs", modality: "—", label: "PACS archive" };
  if (/quarantine/.test(n)) return { kind: "quar", modality: "—", label: "Quarantine store" };
  return { kind: "unknown", modality: "—", label: "Unregistered device" };
}
export function aeTitle(h) { const m = /\(([A-Z0-9_]{2,16})\)/.exec(h.name || ""); return m ? m[1] : null; }
export function shortName(h) { return (h.name || h.ip || "").replace(/\s*\([^)]*\)\s*$/, ""); }

export const feedbackOf = (s, iid) => (s && s.feedback && s.feedback[iid]) || {};
export function confidence(inc) {
  const ps = (inc.explanations || []).map((e) => e.prob).filter((p) => p != null);
  return ps.length ? Math.max(...ps) : null;
}
export function headline(inc) {
  const e = [...(inc.explanations || [])].reverse().find((x) => x.cls === inc.cls);
  return (e && e.headline) || clsLabel(inc.cls);
}
export const sevTone = (s) => ({ high: "crit", medium: "orange", low: "warn" }[s] || "mute");
export function triage(s, inc) {
  const f = feedbackOf(s, inc.id);
  if (f.verdict === "true_attack") return { key: "confirmed", label: "Confirmed attack", tone: "crit" };
  if (f.verdict === "false_alarm") return { key: "false", label: "False alarm", tone: "ok" };
  if (f.ack) return { key: "ack", label: "Acknowledged", tone: "info" };
  return { key: "new", label: "Untriaged", tone: "mute" };
}

/** Devices the SOC tracks (the pipeline's hosts list). */
export function devices(s) { return (s && s.hosts) || []; }
export function hostByIp(s, ip) { return devices(s).find((h) => h.ip === ip); }

/** All 2-second windows the pipeline still holds: device series (recent ~150 per device) + incident timelines. */
export function windowsAll(s) {
  const m = new Map();
  for (const h of devices(s)) for (const r of h.series || []) m.set(`${h.ip}|${r[0]}`, { ip: h.ip, t: r[0], out: r[1], inb: r[2], score: r[3], level: r[4], alarm: r[5], err: r[6] });
  for (const i of (s && s.incidents) || []) for (const r of i.timeline || []) {
    const k = `${i.host}|${r[0]}`;
    if (!m.has(k)) m.set(k, { ip: i.host, t: r[0], score: r[1], level: r[2], alarm: r[3] });
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}
/** Earliest time from which every device's windows (normal ones too) are still held. */
export function seriesCoverage(s) {
  let start = null;
  for (const h of devices(s)) if (h.series && h.series.length) start = start == null ? h.series[0][0] : Math.max(start, h.series[0][0]);
  return start;
}
export function bucketize(items, t0, t1, n, key = (x) => x.t) {
  const w = (t1 - t0) / n, b = Array.from({ length: n }, (_, i) => ({ t: t0 + i * w, t1: t0 + (i + 1) * w, items: [] }));
  for (const it of items) { const t = key(it); if (t < t0 || t >= t1) continue; b[Math.min(n - 1, Math.floor((t - t0) / w))].items.push(it); }
  return b;
}
export const RANGES = { "5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800 };

export function trafficTotals(s, seconds = 60) {
  const t = now(s); let out = 0, inb = 0, n = 0, prevOut = 0, prevIn = 0;
  for (const h of devices(s)) for (const r of h.series || []) {
    if (r[0] > t - seconds) { out += r[1]; inb += r[2]; n++; }
    else if (r[0] > t - 2 * seconds) { prevOut += r[1]; prevIn += r[2]; }
  }
  return { out, inb, total: out + inb, prev: prevOut + prevIn, windows: n };
}
export function eventTone(e) {
  return { incident_opened: "crit", level_up: (e.level || 0) >= 3 ? "crit" : "orange", level_down: "info", incident_closed: "ok",
    enforced: "warn", device_offline: "warn", device_online: "ok", new_device: "orange" }[e.kind] || "info";
}
export function eventIcon(e) {
  return { incident_opened: "siren", level_up: "arrowUp", level_down: "arrowDown", incident_closed: "checkCircle", enforced: "shield",
    device_offline: "wifiOff", device_online: "wifi", new_device: "plus" }[e.kind] || "info";
}
export const EVENT_LABEL = { incident_opened: "Suspicious traffic identified", level_up: "Response escalated", level_down: "Response stepped down",
  incident_closed: "Incident closed", enforced: "Gateway action", device_offline: "Device offline", device_online: "Device back online", new_device: "New device detected" };

/** Guidance for the analyst per attack class (what to check next). Advice text, not data. */
export const CHECKS = {
  exfiltration: ["Confirm whether a legitimate bulk retrieve (C-MOVE/C-GET) was scheduled from this device.", "Check the destination AE titles and the volume against the device's usual daily pattern.", "If unexpected, keep the device isolated and review the workstation's user session."],
  ransomware_like: ["Check the device for unexpected processes or file encryption activity.", "Review the quarantined uploads (if any) before they are released.", "Confirm with imaging staff whether a large legitimate upload was in progress."],
  ae_bruteforce: ["Review association rejects: which calling AE titles were tried?", "Verify the device's configured AE title has not been changed.", "Consider adding the source to the asset inventory or blocking it."],
  assoc_flood: ["Check whether the device is misconfigured (retry loop) or under external control.", "Look at association counts and aborts in the device profile.", "Coordinate with the modality vendor if the pattern persists."],
  malformed_pdu: ["Malformed PDUs often indicate fuzzing or a broken client: check the software version.", "Review PDU anomalies in the explanation evidence.", "Isolate if the device is not a known clinical system."],
  recon: ["Scanning from an imaging device is unusual: identify the process generating it.", "Check port and AE-title spread in the evidence.", "Verify the device is the registered system for this IP address."],
  preamble_polyglot: ["An executable header was found in a DICOM file preamble: treat as malware delivery.", "Uploads carrying it are never released from quarantine.", "Isolate the sending device and investigate its file sources."],
};
