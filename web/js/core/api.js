// One place for every call to the VitalGate server. Cookies carry the session; a 401 sends the user to sign in.
export class ApiError extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data; } }

async function call(method, url, body, opts = {}) {
  let r;
  try {
    r = await fetch(url, {
      method, credentials: "same-origin", cache: "no-store",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    throw new ApiError("Cannot reach the VitalGate server", 0);
  }
  if (r.status === 401 && !opts.noRedirect) { location.href = "/login?expired"; throw new ApiError("Signed out", 401); }
  if (r.status === 304) return { notModified: true, etag: r.headers.get("ETag") };
  let data = null;
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok) throw new ApiError((data && data.error) || `Request failed (${r.status})`, r.status, data);
  if (opts.withEtag) return { data, etag: r.headers.get("ETag") };
  return data;
}

export const api = {
  state: (etag) => call("GET", "/api/state", undefined, { withEtag: true, headers: etag ? { "If-None-Match": etag } : {} }),
  me: () => call("GET", "/api/me"),
  model: () => call("GET", "/api/model"),
  research: () => call("GET", "/api/research"),
  logs: () => call("GET", "/api/logs"),
  quarantine: () => call("GET", "/api/quarantine"),
  gateway: () => call("GET", "/api/gateway"),
  verify: (bundle) => call("POST", `/api/model/verify/${encodeURIComponent(bundle)}`, {}),
  feedback: (iid, body) => call("POST", `/api/feedback/${encodeURIComponent(iid)}`, body),
  profile: (body) => call("POST", "/api/profile", body),
  password: (body) => call("POST", "/api/password", body),
  logout: () => call("POST", "/api/logout", {}, { noRedirect: true }),
  ping: () => call("GET", "/api/ping", undefined, { noRedirect: true }),
};
