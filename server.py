"""VitalGate web console (multi-page SOC application).

A standard-library web server that serves the console in web/ and exposes the real VitalGate pipeline to it.
It does not run its own detector: it reads what the existing product writes.

  product/soc/data/incidents.json      incidents, devices, events, system status   (soc/replay.py or soc/live.py)
  product/soc/data/feedback.json       analyst triage (written here too: the live controller reads it for "hold")
  product/testbed/out/pep/*            gateway (PEP) state, applied actions, quarantine store log   (live mode)
  product/bundle*/                     frozen federated model bundles (metadata + SHA-256 manifest)
  product/eval/results/*/              evaluation results (research section)
  product/soc/data/logs/*.log          process logs of the pipeline

Accounts: data/users.json in this folder (PBKDF2-SHA256). Accounts that already exist in the product
(product/soc/data/users.json) can also sign in, read-only. New sign-ups are *requests*: an administrator approves
them on this machine with  python server.py --approve NAME  (the existing admin-created account policy is kept).

Usage:
  python server.py                                   -> http://localhost:8090
  python server.py --product "D:/path/to/product"    (default: ../VitalGate Project Code/product)
  python server.py --add-user NAME | --approve NAME | --reject NAME | --requests | --remove-user NAME"""
import argparse, csv, getpass, hashlib, hmac, json, mimetypes, os, re, secrets, socket, sys, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote

HERE = Path(__file__).resolve().parent
WEB = HERE / "web"


def default_product():
    env = os.environ.get("VITALGATE_PRODUCT")
    if env: return env
    cfg = HERE / "config.json"
    if cfg.exists():
        try:
            p = json.loads(cfg.read_text(encoding="utf-8")).get("product")
            if p: return str((HERE / p).resolve()) if not os.path.isabs(p) else p
        except ValueError:
            pass
    return str(HERE.parent / "VitalGate Project Code" / "product")


p = argparse.ArgumentParser(description="VitalGate web console")
p.add_argument("--port", type=int, default=8090); p.add_argument("--host", default="127.0.0.1")
p.add_argument("--product", default=default_product(), help="path to the VitalGate product folder")
p.add_argument("--data", default=str(HERE / "data"))
for opt in ("add-user", "remove-user", "approve", "reject"): p.add_argument(f"--{opt}", metavar="NAME")
p.add_argument("--requests", action="store_true", help="list pending account requests")
a = p.parse_args()

PROD = Path(a.product).resolve()
DATA = Path(a.data); DATA.mkdir(parents=True, exist_ok=True)
USERS, REQS, PROFILES, SESS = (DATA / f for f in ("users.json", "requests.json", "profiles.json", "sessions.json"))
P_USERS = PROD / "soc" / "data" / "users.json"          # existing product accounts (read-only here)
INC, FB = PROD / "soc" / "data" / "incidents.json", PROD / "soc" / "data" / "feedback.json"
PEP = PROD / "testbed" / "out" / "pep"
LOGS = PROD / "soc" / "data" / "logs"
LOCK = threading.Lock()
IID = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
UNAME = re.compile(r"^[A-Za-z0-9_.@-]{2,40}$")
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$")
VERDICTS = (None, "", "true_attack", "false_alarm")
MAX_BODY = 64 * 1024
SESSION_S, REMEMBER_S = 12 * 3600, 7 * 86400
ITER = 200_000
FAILS = {}
SECRET_RX = re.compile(r"(?i)(password|passwd|token|secret|api[_-]?key|authorization)\s*[:=]\s*\S+")


# ------------------------------------------------------------------ files
def load(path, default):
    for _ in range(20):                       # Windows: a writer may be replacing the file right now
        try:
            with open(path, encoding="utf-8") as f: return json.load(f)
        except FileNotFoundError:
            return default
        except (PermissionError, json.JSONDecodeError, UnicodeDecodeError):
            time.sleep(0.05)
    return default


def save(path, obj):
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(obj, f, indent=1)
    for _ in range(40):
        try:
            os.replace(tmp, path); return
        except PermissionError:
            time.sleep(0.05)


def tail_lines(path, n=2000, max_bytes=2_000_000):
    try:
        with open(path, "rb") as f:
            f.seek(0, 2); size = f.tell(); f.seek(max(0, size - max_bytes))
            data = f.read()
    except OSError:
        return []
    lines = data.decode("utf-8", "replace").splitlines()
    if size > max_bytes: lines = lines[1:]
    return lines[-n:]


def jsonl(path, n=2000):
    out = []
    for line in tail_lines(path, n):
        try: out.append(json.loads(line))
        except ValueError: pass
    return out


# ------------------------------------------------------------------ accounts
def hash_pw(pw, salt=None):
    salt = salt or secrets.token_bytes(16)
    return dict(salt=salt.hex(), hash=hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, ITER).hex(), iter=ITER)


def all_users():
    u = {k: dict(v, source="product") for k, v in load(P_USERS, {}).items()}
    u.update({k: dict(v, source="console") for k, v in load(USERS, {}).items()})   # console accounts take precedence
    return u


def check_pw(user, pw):
    rec = all_users().get(user)
    if not rec:
        hashlib.pbkdf2_hmac("sha256", pw.encode(), b"x" * 16, ITER); return False
    got = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(rec["salt"]), int(rec.get("iter", ITER))).hex()
    return hmac.compare_digest(got, rec["hash"])


def pw_problem(pw, user=""):
    if len(pw) < 10: return "at least 10 characters"
    if len(pw) > 200: return "at most 200 characters"
    if not (re.search(r"[A-Za-z]", pw) and re.search(r"\d", pw)): return "use letters and at least one digit"
    if user and user.lower() in pw.lower(): return "must not contain the username"
    return None


def cli_set_user(name):
    if not UNAME.match(name): sys.exit("username: 2-40 letters, digits or . _ @ -")
    while True:
        pw = getpass.getpass(f"password for {name}: ")
        prob = pw_problem(pw, name)
        if prob: print("password:", prob); continue
        if getpass.getpass("repeat password: ") != pw: print("passwords differ"); continue
        break
    users = load(USERS, {}); new = name not in users
    users[name] = dict(hash_pw(pw), created=users.get(name, {}).get("created", time.time()))
    save(USERS, users); print(f"{'added' if new else 'password changed for'} {name}  ({USERS})")


if a.add_user: cli_set_user(a.add_user); sys.exit()
if a.remove_user:
    users = load(USERS, {})
    if users.pop(a.remove_user, None) is None: sys.exit(f"no console account {a.remove_user} (product accounts are managed in the product)")
    save(USERS, users); print(f"removed {a.remove_user}"); sys.exit()
if a.requests:
    r = load(REQS, {})
    if not r: print("no pending account requests")
    for k, v in r.items(): print(f"{k:20} {v.get('fullname',''):30} {v.get('email',''):30} {time.strftime('%Y-%m-%d %H:%M', time.localtime(v['requested']))}")
    sys.exit()
if a.approve or a.reject:
    name = a.approve or a.reject; r = load(REQS, {}); req = r.pop(name, None)
    if not req: sys.exit(f"no pending request for {name}")
    if a.approve:
        users = load(USERS, {})
        users[name] = dict(salt=req["salt"], hash=req["hash"], iter=req["iter"], created=time.time(), approved=time.time())
        save(USERS, users)
        prof = load(PROFILES, {}); prof[name] = dict(fullname=req.get("fullname", ""), email=req.get("email", "")); save(PROFILES, prof)
    save(REQS, r); print(f"{'approved' if a.approve else 'rejected'} {name}"); sys.exit()
if not all_users():
    if not sys.stdin.isatty(): sys.exit("no accounts yet: run  python server.py --add-user <name>")
    print("No accounts yet. Create the first administrator account.")
    cli_set_user(input("username: ").strip())


# ------------------------------------------------------------------ sessions (token hashes persisted: restart keeps sign-ins)
def _sid_hash(sid): return hashlib.sha256(sid.encode()).hexdigest()


SESSIONS = {k: v for k, v in load(SESS, {}).items() if v.get("expires", 0) > time.time()}


def sessions_save():
    try: save(SESS, SESSIONS)
    except OSError: pass


# ------------------------------------------------------------------ derived data (cached by file mtime)
_cache = {}


def cached(key, paths, fn):
    sig = []
    for p_ in paths:
        try: st = os.stat(p_); sig.append((str(p_), st.st_mtime_ns, st.st_size))
        except OSError: sig.append((str(p_), None))
    hit = _cache.get(key)
    if hit and hit[0] == sig: return hit[1]
    val = fn(); _cache[key] = (sig, val); return val


def bundles():
    out = []
    for d in sorted(PROD.glob("bundle*")):
        meta = load(d / "BUNDLE.json", None)
        if not isinstance(meta, dict): continue
        out.append(dict(dir=d.name, frozen_at=meta.get("frozen_at"), model=meta.get("model"), n_updates=meta.get("n_updates"),
                        n_features=meta.get("n_features"), classes=meta.get("classes"), temperature=meta.get("temperature"),
                        detector=meta.get("detector"), files=len(meta.get("sha256", {})),
                        **{k: meta[k] for k in ("adapt", "mode", "site", "note") if k in meta}))
    return out


def model_info():
    b = PROD / "bundle"
    man = load(b / "fed_xgb" / "manifest.json", {})
    ups = man.get("updates", [])
    return dict(bundles=bundles(), fed_config=load(b / "fed_config.json", {}), policy=load(b / "response_policy.json", {}),
                xai=load(b / "xai_config.json", {}), features=man.get("features", []), classes=man.get("classes", []),
                method=man.get("method"), defence=man.get("defence"),
                updates=[dict(round=u.get("round"), client=u.get("client"), scale=u.get("scale"), file=u.get("file")) for u in ups])


def verify_bundle(name):
    d = PROD / name
    meta = load(d / "BUNDLE.json", None)
    if not isinstance(meta, dict): return dict(ok=False, error="bundle not found")
    res, ok = [], True
    for rel, want in (meta.get("sha256") or {}).items():
        f = (d / rel).resolve()
        if d.resolve() not in f.parents: continue
        try:
            h = hashlib.sha256()
            with open(f, "rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""): h.update(chunk)
            good = h.hexdigest() == want
        except OSError:
            good = None
        ok = ok and bool(good); res.append(dict(file=rel, ok=good))
    return dict(ok=ok and bool(res), bundle=name, files=len(res), failed=[r["file"] for r in res if not r["ok"]], checked_at=time.time())


def macro_f1(path):
    """Window-level macro-F1 from an evaluation windows.csv (prediction: model class if score >= 0.5 or DPI rule)."""
    lab, prd = [], []
    try:
        with open(path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                try: s = float(r.get("score") or 0)
                except ValueError: s = 0.0
                rule = str(r.get("rule", "")).strip().lower() in ("1", "true", "1.0")
                lab.append(r.get("label") or "benign")
                prd.append((r.get("pred_attack") or "benign") if (s >= 0.5 or rule) else "benign")
    except OSError:
        return None
    if not lab: return None
    classes = sorted(set(lab)); per = {}
    for c in classes:
        tp = sum(1 for x, y in zip(lab, prd) if x == c and y == c)
        fp = sum(1 for x, y in zip(lab, prd) if x != c and y == c)
        fn = sum(1 for x, y in zip(lab, prd) if x == c and y != c)
        per[c] = round(2 * tp / (2 * tp + fp + fn), 3) if tp + fp + fn else 0.0
    ya = [x != "benign" for x in lab]; pa = [y != "benign" for y in prd]
    tp = sum(1 for x, y in zip(ya, pa) if x and y); fp = sum(1 for x, y in zip(ya, pa) if not x and y); fn = sum(1 for x, y in zip(ya, pa) if x and not y)
    return dict(macro_f1=round(sum(per.values()) / len(per), 3), binary_f1=round(2 * tp / (2 * tp + fp + fn), 3) if tp + fp + fn else None,
                windows=len(lab), attack_windows=sum(ya), per_class=per)


def research():
    runs = []
    for d in sorted((PROD / "eval" / "results").glob("*")):
        s = load(d / "summary.json", None)
        if not isinstance(s, dict): continue
        w = d / "windows.csv"
        mf = cached("mf:" + d.name, [w], lambda w=w: macro_f1(w)) if w.exists() else None
        runs.append(dict(name=d.name, created=s.get("created"), bundle=s.get("bundle"), windows=s.get("windows"),
                         host_hours=s.get("host_hours"), detection=s.get("detection"), response=s.get("response"),
                         window_level=s.get("window_level"), by_novelty=s.get("by_novelty"), by_class=s.get("by_class"),
                         onboarding=bool((s.get("onboarding") or {}).get("per_host_k")), window_metrics=mf))
    return dict(runs=runs, federated=load(PROD / "bundle" / "fed_config.json", {}))


def redact(text):
    return SECRET_RX.sub(lambda m: m.group(1) + "=[redacted]", str(text))[:2000]


def logs():
    s = load(INC, {})
    out = []
    for e in s.get("events", []) or []:
        comp = "gateway" if e.get("kind") == "enforced" else "sensor" if e.get("kind", "").startswith("device") or e.get("kind") == "new_device" else "response"
        lvl = "critical" if (e.get("level") or 0) >= 3 and e.get("kind") in ("incident_opened", "level_up") else \
              "warning" if e.get("kind") in ("incident_opened", "level_up", "device_offline", "new_device") else "info"
        out.append(dict(t=e.get("t"), component=comp, level=lvl, text=e.get("text"), host=e.get("host"), incident=e.get("incident"),
                        source="event feed", detail=e))
    for e in jsonl(PEP / "applied.jsonl", 1500):
        ok = e.get("ok", True) is not False
        txt = {"level": f"set {e.get('set')}: L{e.get('frm')} -> L{e.get('to')} (ttl {e.get('ttl')} s)",
               "removed": f"entry removed: L{e.get('frm')} -> L0", "expired": "entry expired in the kernel (fail-open)",
               "start": "PEP agent started, nftables table loaded", "rejected": f"rejected malformed instruction ({e.get('reason')})"}.get(e.get("event"), e.get("event"))
        out.append(dict(t=e.get("t"), component="gateway", level="error" if not ok or e.get("event") == "rejected" else "info",
                        text=redact(txt), host=e.get("ip"), incident=None, source="pep applied.jsonl", detail=e))
    for e in jsonl(PEP / "quarantine.jsonl", 1500):
        ev = e.get("event")
        lvl = "error" if ev in ("error", "release-failed") else "warning" if ev in ("blocked", "kept") else "info"
        out.append(dict(t=e.get("t"), component="quarantine", level=lvl, host=e.get("ip"), incident=None, source="quarantine.jsonl",
                        text=redact(f"{ev}: {e.get('aet') or ''} {e.get('reason') or e.get('error') or ''}".strip()),
                        detail={k: v for k, v in e.items() if k != "sop"}))
    files = [f for d in (DATA / "logs", LOGS) if d.exists() for f in sorted(d.glob("*.log"))]
    for f in files:
        try: mt = f.stat().st_mtime
        except OSError: continue
        comp = f.stem.replace(".err", "")
        for line in tail_lines(f, 200):
            if not line.strip(): continue
            lvl = "error" if (f.stem.endswith(".err") or re.search(r"(?i)traceback|error|exception", line)) else "info"
            out.append(dict(t=None, file_time=mt, component=comp, level=lvl, text=redact(line), host=None, incident=None,
                            source=f"logs/{f.name}", detail=None))
    out.sort(key=lambda r: (r["t"] or r.get("file_time") or 0), reverse=True)
    return out[:4000]


def quarantine():
    st = load(PEP / "state.json", {})
    hist = jsonl(PEP / "quarantine.jsonl", 3000)
    items = {}
    for e in hist:                                   # rebuild every record from the store's own log
        iid = e.get("instance")
        if not iid: continue
        it = items.setdefault(iid, dict(instance=iid, events=[]))
        it["events"].append({k: v for k, v in e.items() if k != "instance"})
        for k in ("aet", "ip", "bytes", "check", "sop"):
            if e.get(k) is not None: it[k] = e[k]
        ev = e.get("event")
        if ev == "received": it["received"] = e.get("t"); it["status"] = e.get("status", "held")
        elif ev in ("released", "blocked"): it["status"] = ev; it[ev] = e.get("t")
        elif ev == "kept": it["why"] = "hold"
    for it in st.get("quarantine_items", []) or []:   # current view of the agent wins
        cur = items.setdefault(it["instance"], dict(instance=it["instance"], events=[]))
        cur.update({k: v for k, v in it.items() if k != "instance"})
    for it in items.values(): it.pop("sop", None)    # SOP instance UIDs are image identifiers: not shown
    for ev in [x for it in items.values() for x in it["events"]]: ev.pop("sop", None)
    return dict(summary=st.get("quarantine"), agent_time=st.get("t"), items=sorted(items.values(), key=lambda i: -(i.get("received") or 0)))


def gateway():
    st = load(PEP / "state.json", {}); st.pop("quarantine_items", None)
    des = load(PEP / "desired.json", {})
    return dict(state=st, desired=dict(seq=des.get("seq"), written=des.get("written"), hosts=des.get("hosts", {})),
                applied=jsonl(PEP / "applied.jsonl", 300)[::-1])


def run_info():
    r = load(DATA / "run.json", None)
    return r if isinstance(r, dict) else None


# ------------------------------------------------------------------ web
CSP = ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
       "connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
PUBLIC_PAGES = {"/login": "login.html", "/signup": "signup.html", "/forgot": "forgot.html"}


class H(BaseHTTPRequestHandler):
    server_version = "VitalGate"
    sys_version = ""

    def log_message(self, *args): pass

    def _send(self, code, body, ctype="application/json", headers=(), cache="no-store"):
        b = body if isinstance(body, bytes) else json.dumps(body, default=float).encode()
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", cache); self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff"); self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Content-Security-Policy", CSP)
        for k, v in headers: self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD": self.wfile.write(b)

    def _redirect(self, to):
        self.send_response(302); self.send_header("Location", to); self.send_header("Content-Length", "0"); self.end_headers()

    def _sid(self):
        c = SimpleCookie(self.headers.get("Cookie", "")).get("vg_session")
        return c.value if c else None

    def _user(self):
        sid = self._sid()
        if not sid: return None
        s = SESSIONS.get(_sid_hash(sid))
        if s and s["expires"] > time.time() and s["user"] in all_users(): return s["user"]
        if s:
            with LOCK: SESSIONS.pop(_sid_hash(sid), None); sessions_save()
        return None

    def _body(self):
        try: n = int(self.headers.get("Content-Length", 0))
        except ValueError: return None
        if n > MAX_BODY: return None
        try: body = json.loads(self.rfile.read(n) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError): return None
        return body if isinstance(body, dict) else None

    def _static(self, rel):
        f = (WEB / rel).resolve()
        if WEB.resolve() not in f.parents or not f.is_file(): return self._send(404, {"error": "not found"})
        ctype = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
                 ".html": "text/html", ".png": "image/png", ".json": "application/json"}.get(f.suffix) or mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith(("json", "xml")): ctype += "; charset=utf-8"
        self._send(200, f.read_bytes(), ctype, cache="no-cache")

    def do_HEAD(self): self.do_GET()

    def do_GET(self):
        u = urlsplit(self.path); path = unquote(u.path); q = parse_qs(u.query)
        if path in PUBLIC_PAGES: return self._static(PUBLIC_PAGES[path])
        if path.startswith("/static/"): return self._static(path[len("/static/"):])
        if path == "/sw.js": return self._static("sw.js")
        if path == "/manifest.webmanifest": return self._static("manifest.webmanifest")
        if path == "/api/ping": return self._send(200, {"ok": True, "t": time.time()})
        user = self._user()
        if path in ("/", "/index.html", "/app"):
            if not user: return self._redirect("/login")
            return self._static("app.html")
        if not user: return self._send(401, {"error": "sign in required"})
        if path == "/api/me":
            rec = all_users().get(user, {})
            return self._send(200, dict(user=user, profile=load(PROFILES, {}).get(user, {}), account=rec.get("source"),
                                        created=rec.get("created"), product=str(PROD.name), product_found=INC.parent.exists()))
        if path == "/api/state":
            try: st = os.stat(INC); fst = os.stat(FB) if FB.exists() else None
            except OSError: st = None
            tag = f'"{st.st_mtime_ns}-{st.st_size}-{fst.st_mtime_ns if fst else 0}"' if st else '"none"'
            if self.headers.get("If-None-Match") == tag:
                self.send_response(304); self.send_header("ETag", tag); self.send_header("Content-Length", "0"); self.end_headers(); return
            s = load(INC, None)
            if not isinstance(s, dict):
                s = dict(incidents=[], hosts=[], events=[], system={}, meta={}, data_time=None, generated=None, missing=True)
            s["feedback"] = load(FB, {}); s["server_time"] = time.time(); s["run"] = run_info()
            pep = (s.get("system") or {}).get("pep") or {}
            if s.get("meta", {}).get("source") == "live" and pep.get("mode") == "enforcing":
                d = load(PEP / "desired.json", {})
                s["holds"] = sorted(ip for ip, h in (d.get("hosts") or {}).items() if h.get("hold"))
            return self._send(200, s, headers=[("ETag", tag)])
        if path == "/api/model": return self._send(200, cached("model", [PROD / "bundle" / "BUNDLE.json", PROD / "bundle" / "fed_xgb" / "manifest.json"], model_info))
        if path == "/api/research": return self._send(200, research())
        if path == "/api/logs": return self._send(200, dict(entries=logs(), server_time=time.time()))
        if path == "/api/quarantine": return self._send(200, quarantine())
        if path == "/api/gateway": return self._send(200, gateway())
        self._send(404, {"error": "not found"})

    def do_POST(self):
        path = urlsplit(self.path).path
        if "application/json" not in (self.headers.get("Content-Type") or ""):   # a plain cross-site form cannot post here
            return self._send(415, {"error": "json only"})
        if path == "/api/login": return self._login()
        if path == "/api/signup": return self._signup()
        if path == "/api/logout":
            sid = self._sid()
            if sid:
                with LOCK: SESSIONS.pop(_sid_hash(sid), None); sessions_save()
            return self._send(200, {"ok": True}, headers=[("Set-Cookie", "vg_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict")])
        user = self._user()
        if not user: return self._send(401, {"error": "sign in required"})
        body = self._body()
        if body is None: return self._send(400, {"error": "bad json"})
        if path.startswith("/api/feedback/"): return self._feedback(user, path.rsplit("/", 1)[1], body)
        if path == "/api/profile":
            fn, em = str(body.get("fullname", "")).strip()[:80], str(body.get("email", "")).strip()[:200]
            if em and not EMAIL.match(em): return self._send(400, {"error": "email address looks wrong"})
            with LOCK:
                prof = load(PROFILES, {}); prof[user] = dict(prof.get(user, {}), fullname=fn, email=em); save(PROFILES, prof)
            return self._send(200, {"ok": True, "profile": prof[user]})
        if path == "/api/password":
            cur, new = str(body.get("current", ""))[:200], str(body.get("new", ""))[:300]
            if not check_pw(user, cur): time.sleep(0.5); return self._send(400, {"error": "current password is wrong"})
            prob = pw_problem(new, user)
            if prob: return self._send(400, {"error": "new password: " + prob})
            with LOCK:
                users = load(USERS, {}); rec = all_users().get(user, {})
                users[user] = dict(hash_pw(new), created=rec.get("created", time.time()), changed=time.time()); save(USERS, users)
                mine = _sid_hash(self._sid() or "")
                for k in [k for k, s in SESSIONS.items() if s["user"] == user and k != mine]: SESSIONS.pop(k)   # sign out other sessions
                sessions_save()
            return self._send(200, {"ok": True})
        if path.startswith("/api/model/verify/"):
            name = path.rsplit("/", 1)[1]
            if not re.match(r"^bundle[A-Za-z0-9_.-]{0,60}$", name): return self._send(400, {"error": "bad bundle name"})
            return self._send(200, verify_bundle(name))
        self._send(404, {"error": "not found"})

    def _feedback(self, user, iid, body):
        if not IID.match(iid): return self._send(400, {"error": "bad incident id"})
        body = {k: body[k] for k in ("ack", "verdict", "note") if k in body}
        if any(not isinstance(body.get(k), (str, type(None))) for k in ("verdict", "note")) or \
           ("ack" in body and not isinstance(body["ack"], bool)):
            return self._send(400, {"error": "bad field type"})
        if body.get("verdict") not in VERDICTS or len(body.get("note") or "") > 4000:
            return self._send(400, {"error": "bad value"})
        if not any(i.get("id") == iid for i in (load(INC, {}).get("incidents") or [])):
            return self._send(404, {"error": "no such incident"})
        body["analyst"] = user                              # who did it comes from the sign-in, not from the request
        with LOCK:
            fb = load(FB, {}); cur = fb.get(iid, {})
            for k in ("ack", "verdict", "note", "analyst"):
                if k in body: cur[k] = body[k]
            cur.setdefault("history", []).append(dict(t=time.time(), **body))
            fb[iid] = cur; save(FB, fb)
        self._send(200, cur)

    def _limited(self):
        ip, now = self.client_address[0], time.time()
        n, until = FAILS.get(ip, (0, 0))
        if until > now: return int(until - now) + 1
        return 0

    def _fail(self):
        ip, now = self.client_address[0], time.time()
        n, _ = FAILS.get(ip, (0, 0)); n += 1
        FAILS[ip] = (0, now + 60) if n >= 5 else (n, 0)
        time.sleep(0.5)

    def _login(self):
        wait = self._limited()
        if wait: return self._send(429, {"error": f"too many attempts, try again in {wait} s", "retry": wait})
        body = self._body() or {}
        user, pw = str(body.get("username", ""))[:40].strip(), str(body.get("password", ""))[:200]
        remember = body.get("remember") is True
        if UNAME.match(user) and pw and check_pw(user, pw):
            FAILS.pop(self.client_address[0], None)
            now = time.time(); life = REMEMBER_S if remember else SESSION_S
            sid = secrets.token_urlsafe(32)
            with LOCK:
                SESSIONS[_sid_hash(sid)] = dict(user=user, expires=now + life, created=now)
                for k in [k for k, s in SESSIONS.items() if s["expires"] < now]: SESSIONS.pop(k, None)
                sessions_save()
            cookie = f"vg_session={sid}; Path=/; HttpOnly; SameSite=Strict" + (f"; Max-Age={life}" if remember else "")
            return self._send(200, {"ok": True, "user": user}, headers=[("Set-Cookie", cookie)])
        if UNAME.match(user) and user in load(REQS, {}):
            self._fail(); return self._send(403, {"error": "this account is waiting for administrator approval"})
        self._fail()
        self._send(401, {"error": "wrong username or password"})

    def _signup(self):
        wait = self._limited()
        if wait: return self._send(429, {"error": f"too many attempts, try again in {wait} s", "retry": wait})
        b = self._body() or {}
        fn, em = str(b.get("fullname", "")).strip()[:80], str(b.get("email", "")).strip()[:200]
        user, pw = str(b.get("username", "")).strip()[:41], str(b.get("password", ""))[:300]
        if len(fn) < 2: return self._send(400, {"error": "enter your full name", "field": "fullname"})
        if not EMAIL.match(em): return self._send(400, {"error": "enter a valid email address", "field": "email"})
        if not UNAME.match(user): return self._send(400, {"error": "username: 2-40 letters, digits or . _ @ -", "field": "username"})
        prob = pw_problem(pw, user)
        if prob: return self._send(400, {"error": "password: " + prob, "field": "password"})
        if b.get("terms") is not True: return self._send(400, {"error": "accept the terms of use", "field": "terms"})
        with LOCK:
            reqs = load(REQS, {})
            if user in all_users() or user in reqs:
                self._fail(); return self._send(409, {"error": "that username is taken", "field": "username"})
            if len(reqs) >= 50: return self._send(503, {"error": "too many pending requests; ask an administrator"})
            reqs[user] = dict(hash_pw(pw), fullname=fn, email=em, requested=time.time(), ip=self.client_address[0])
            save(REQS, reqs)
        self._send(202, {"ok": True, "pending": True,
                         "message": "Request sent. An administrator must approve it on the VitalGate host before you can sign in."})


class Server(ThreadingHTTPServer):
    allow_reuse_address = os.name != "nt"
    daemon_threads = True

    def server_bind(self):
        if os.name == "nt": self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


if __name__ == "__main__":
    if not INC.parent.exists():
        print(f"warning: VitalGate product not found at {PROD}\n  start with --product <path to 'VitalGate Project Code/product'>")
    if a.host not in ("127.0.0.1", "localhost"):
        print("warning: listening beyond this machine over plain HTTP; use it only on a trusted network")
    try:
        srv = Server((a.host, a.port), H)
    except OSError:
        sys.exit(f"port {a.port} is already in use: another dashboard (or program) is running. Stop it, or use --port 8091")
    host = "localhost" if a.host in ("127.0.0.1", "0.0.0.0") else a.host
    print(f"VitalGate console: open http://{host}:{a.port}  (product: {PROD}, accounts: {len(all_users())})")
    srv.serve_forever()
