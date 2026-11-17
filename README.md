# VitalGate SOC Console

**Intelligent Security for Medical Imaging Infrastructure.**

A multi-page, installable web application for the VitalGate research project: federated, explainable, real-time
intrusion detection with graded zero-trust isolation for DICOM / PACS networks.

The console does **not** contain its own detector. It runs on top of the existing VitalGate product
(`VitalGate Project Code/product`) and shows exactly what that pipeline produces: the frozen federated XGBoost
model, TreeSHAP explanations, CUSUM alarms, the L0–L4 response ladder, the gateway (PEP) and the quarantine store.
No metric, event or prediction is simulated by the console.

## Run it

Requirements: Windows, Python 3.10+ on PATH. Docker Desktop for live mode. Nothing to install with pip or npm:
the server is pure Python standard library and the frontend is plain HTML, CSS and JavaScript modules.

| What | How |
|---|---|
| Start (replay of recorded traffic) | double-click `start.cmd` |
| Start (live: Docker test bed + gateway) | `start.cmd live` |
| Stop everything | double-click `stop.cmd` |
| Status / logs | `.\vitalgate.ps1 status` · `.\vitalgate.ps1 logs` |
| Open | <http://localhost:8090> |

The launcher stops the old dashboard (`soc/server.py`) if it is still running on port 8090, starts this console,
then starts the product's own pipeline (`soc/replay.py` or `soc/live.py`) unchanged.

Manual start (two terminals):

```powershell
cd "C:\Users\rashi\Desktop\VitalGate PWA"
python server.py                     # console on http://localhost:8090
cd "..\VitalGate Project Code\product"
python soc\replay.py --speed 30      # or: python soc\live.py  (test bed running)
```

The product folder is set in `config.json` (default `../VitalGate Project Code/product`), or with
`python server.py --product <path>`.

## Accounts

* Accounts that already exist in the product (`product/soc/data/users.json`) can sign in.
* New accounts are stored in `data/users.json` here (PBKDF2-SHA256, 200,000 rounds; no plain passwords).
* **Sign-up page = account request.** The existing policy (administrator-created accounts) is kept:
  a request cannot sign in until an administrator approves it on the VitalGate host:

```powershell
.\vitalgate.ps1 requests             # list pending requests
.\vitalgate.ps1 approve              # approve one
python server.py --reject NAME       # reject one
python server.py --add-user NAME     # create an account or reset a password ("forgot password")
```

* Sessions: HttpOnly, SameSite=Strict cookie, 12 h (or 7 days with "Remember me"). They survive a server restart
  (only SHA-256 hashes of the session tokens are stored in `data/sessions.json`).
* 5 wrong passwords from one address lock sign-in for 60 s. POSTs must be JSON (blocks cross-site forms).
  Strict Content-Security-Policy, X-Frame-Options DENY, nosniff.

## Pages

| Page | Shows (all from real pipeline data) |
|---|---|
| Login / Request account / Forgot password | sign-in, account request with password strength, admin reset instructions |
| Dashboard | 8 KPIs, threat timeline (1 h / 6 h / 24 h / 7 d), device status donut, recent alerts, attack classes, DICOM traffic, system health, activity feed |
| Medical Devices | card grid or table of every inventory device with illustrations (CT, MRI, CR, DX, ultrasound, workstations, probe, PACS, quarantine store); device profile with traffic, score and level charts, 2-second windows, alerts and predictions, zero-trust actions, quarantine history |
| Network Monitoring | live traffic map, incoming and outgoing DICOM bytes, top talkers, sensor pipeline (512-byte capture, GRO, 2 s windows, 83 features), per-device connections |
| Threat Detection | interactive 9-stage detection pipeline with live status, detection timeline with CUSUM k, classes, severities, attack events |
| AI Explainability | per-alert TreeSHAP over the 8 evidence groups, top features compared with normal, the 4 plain-language questions, raw explainer sentence |
| Security Incidents | search, filters, date range, sort, pagination, CSV; investigation page with score/level chart, timeline, gateway commands, analyst triage (acknowledge, confirm attack, false alarm, notes) |
| Zero-Trust Response | L0–L4 ladder, criticality caps (PACS ≤ L2, modalities ≤ L3), policy, current enforcement with fail-open expiry, full action history |
| Quarantine Management | held, released and blocked uploads, preamble check, release history per record |
| Federated Learning | 3 hospitals, 48 accepted updates over 16 rounds, equal 1/n scaling, k-of-n gate, bundles, SHA-256 verification; research results kept separate |
| Analytics & Reports | trends, per-device history, verdicts (false-positive view), response and confidence distributions, timing, quarantine activity, CSV / JSON / print-to-PDF; research performance section (macro-F1 computed from `eval/results/*/windows.csv`) |
| System Logs | event feed, PEP log, quarantine log and process logs merged; search, filter, levels, auto-refresh, expandable details, export |
| Settings | profile, password change, theme, notifications, refresh rate, system and model status |
| How VitalGate Works | animated 10-step architecture walkthrough |

Light and dark themes (remembered per browser), collapsible sidebar, mobile layout, global search (`/`),
notifications, and installable as an app (PWA). Only the app shell is cached offline; security data is never cached.

## Structure

```
server.py                 backend: auth, sessions, APIs over the product's files
vitalgate.ps1, start.cmd, stop.cmd, config.json
web/
  app.html, login.html, signup.html, forgot.html, sw.js, manifest.webmanifest
  css/   tokens.css (design tokens, light/dark) · base · layout · components · pages · auth
  js/core/   api.js (all server calls) · store.js (polling, ETag, connection state) · prefs.js · derive.js (domain logic) · fmt.js
  js/ui/     icons · charts (SVG time series, donut, bars, SHAP bars) · table (sort/paginate) · feedback (toasts, modals) · components · devices (illustrations)
  js/pages/  dashboard · devices · network · threats · explain · zerotrust · quarantine · federated · incidents · analytics · logs · settings · how
  js/app.js  shell, sidebar, top bar, search, notifications, router
data/                     console accounts, profiles, sessions, launcher state and logs (not in git)
```

## How it connects to the product

| Product file / module | Used for |
|---|---|
| `soc/replay.py`, `soc/live.py` (unchanged) | produce `soc/data/incidents.json`: devices, windows, scores, incidents, explanations, actions, events, system status |
| `vitalgate/explain` (via the pipeline) | SHAP explanations shown on the Explainability and Incident pages |
| `vitalgate/response` (via the pipeline) | levels, criticality caps, gateway commands, PEP confirmations |
| `soc/data/feedback.json` | analyst triage. **Written** by the console (same format as before), so `live.py` keeps quarantined uploads on hold for confirmed attacks |
| `testbed/out/pep/state.json, desired.json, applied.jsonl, quarantine.jsonl` | gateway sets, holds, enforcement log, quarantine store records |
| `bundle*/BUNDLE.json, fed_xgb/manifest.json, fed_config.json, response_policy.json, xai_config.json` | model, federation, policy and explanation-group metadata; SHA-256 verification |
| `eval/results/*/summary.json, windows.csv` | research section (clearly labelled "previously measured") |
| `soc/data/logs/*.log` | process logs |

New server APIs: `/api/me`, `/api/state` (ETag), `/api/model`, `/api/model/verify/<bundle>`, `/api/research`,
`/api/logs`, `/api/quarantine`, `/api/gateway`, `/api/feedback/<id>`, `/api/profile`, `/api/password`,
`/api/signup`, `/api/login`, `/api/logout`, `/api/ping`.

## Not available (by design or not in the backend)

* **Manual escalation or release of a zero-trust level** is not offered: the product has no manual override, so
  no click can push a scanner past its criticality cap or block the PACS. Levels come only from the response
  engine and expire on their own (fail-open).
* **Manual release of a quarantined upload** is not offered: the quarantine store releases verified uploads
  automatically when the device is below L3 and no analyst confirmed an attack. The button is shown disabled with
  that explanation. Analysts control holds through the incident verdict.
* **Roles**: all accounts have the same analyst rights; approving accounts is done on the host command line.
* **Password reset by email**: no outgoing email on the hospital network; an administrator resets passwords.
* **History length**: the pipeline keeps the last 150 windows per device for normal traffic and every incident
  window for the whole run; charts say so where it matters. A new replay or live run starts a new incident list.
* **Detection latency in replay**: replay plays recorded time, so scoring latency is shown in live mode only.
  Time-to-detect from the true attack start is in the research section.
* Plain HTTP on localhost; use HTTPS (reverse proxy) before exposing it on a network.

## Testing replay and live mode

* **Replay**: `start.cmd`. The header pill shows **REPLAY**, the gateway shows "simulated", and incidents appear as
  the recorded campaigns play (30× speed). Quarantine pages show records from earlier live runs only.
* **Live**: start Docker Desktop, then `start.cmd live`. The pill shows **LIVE**, System health shows the gateway
  "enforcing", the Zero-Trust page shows kernel set entries with their remaining time, and quarantined uploads
  appear on the Quarantine page. Run an attack from the test bed's orchestrator to watch an incident open,
  escalate, get explained and expire.
* **Backend offline**: stop the console; open pages keep the last data, show "Server offline" and reconnect
  automatically.
#   V i t a l G a t e - D a s h b o a r d  
 