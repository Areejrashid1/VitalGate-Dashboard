// "How VitalGate protects medical imaging networks": animated walk-through of the whole architecture.
import { icon } from "../ui/icons.js";
import { card, pageHead } from "../ui/components.js";
import { esc } from "../core/fmt.js";

const STEPS = [
  { ic: "devices", t: "Medical device communication", s: "Scanners send DICOM to the PACS.", node: "dev",
    plain: "CT, MRI, X-ray and ultrasound machines send the images they take to the hospital's image archive (PACS) using the DICOM protocol. Reading workstations fetch them back.",
    tech: "DICOM upper layer over TCP (port 104): A-ASSOCIATE request/accept, P-DATA transfer, release/abort. VitalGate sits on the path between the devices and the PACS." },
  { ic: "radio", t: "Network sensor", s: "Packets and DICOM headers captured.", node: "sensor",
    plain: "A sensor watches the traffic going to the PACS. It only keeps the beginning of each packet (who talks to whom and the DICOM 'envelope'), never the medical images.",
    tech: "Capture with a 512-byte snap length; software GRO reassembles TCP segments into application-sized messages; DICOM PDU headers and the 128-byte file preamble are parsed." },
  { ic: "hash", t: "Feature extraction", s: "2-second windows, 83 features.", node: "sensor",
    plain: "Every two seconds the sensor summarises each device's behaviour into 83 numbers: how much it sends, how fast, how many connections, rejected logins, unusual messages.",
    tech: "27 features per window (volume, sizes, timing, TCP flags, ports, association counts, rejects, aborts, P-DATA, AE-title counts, malformed PDUs, ratios) × current + 2 lags, + 2 gap features." },
  { ic: "scan", t: "DICOM rule inspection", s: "Executable hidden in a DICOM file?", node: "rule",
    plain: "A simple, reliable check looks inside the header of each DICOM file: if a program has been hidden there (a known malware trick), it raises an alarm immediately.",
    tech: "Deep packet inspection of the DICOM preamble for MZ (Windows PE) or ELF signatures: the 'preamble polyglot' rule. Such files are never released from quarantine." },
  { ic: "cpu", t: "AI threat detection", s: "Calibrated federated XGBoost.", node: "model",
    plain: "A machine-learning model trained together by several hospitals scores how likely the window is to be an attack, and which kind.",
    tech: "FedXgbBagging model (frozen bundle, 7 classes) with temperature-scaled probabilities; score = 1 − P(benign)." },
  { ic: "bulb", t: "Explainable AI", s: "TreeSHAP shows the evidence.", node: "xai",
    plain: "For every alert, VitalGate shows which behaviour made the model suspicious, compared with what is normal, in words an analyst can check.",
    tech: "Exact TreeSHAP on the XGBoost trees; 83 contributions summed into 8 readable evidence groups; top features compared with the benign median." },
  { ic: "activity", t: "CUSUM detection", s: "Persistent evidence, not one noisy window.", node: "cusum",
    plain: "One odd moment is not enough. VitalGate adds up evidence over time per device, so short glitches are ignored but a real attack is caught within seconds.",
    tech: "Per-host CUSUM S = max(0, S + score − k) with alarm at S > h (k 0.6, h 0.5); S decays during silence; optional per-host k from onboarding traffic." },
  { ic: "layers", t: "Zero-trust response", s: "Graded L0–L4, capped by criticality.", node: "ladder",
    plain: "Instead of simply blocking, VitalGate chooses a proportionate response (watch, restrict, quarantine, isolate) and never cuts off critical systems like the PACS.",
    tech: "Level from class severity × confidence, escalation if the alarm persists, criticality caps (PACS ≤ L2, modalities ≤ L3), 60-second TTL renewed by alarms." },
  { ic: "shield", t: "Gateway enforcement", s: "Temporary nftables rules.", node: "pep",
    plain: "A gateway applies the decision to the network. Every rule switches itself off after a short time unless the attack continues, so a fault in VitalGate can never leave imaging blocked.",
    tech: "PEP agent writes elements with kernel timeouts into nftables sets (watch / rate / quar / iso); quarantine redirects DICOM uploads to a separate store; fail-open by expiry." },
  { ic: "dashboard", t: "SOC monitoring", s: "Analysts investigate and decide.", node: "soc",
    plain: "Security staff see everything on this console: devices, alerts, explanations, actions. Their verdicts improve the next version of the model.",
    tech: "This console reads the pipeline state; analyst verdicts go to feedback.json (hold quarantined uploads, labelled data for federated retraining)." },
];

export default {
  mount(el, params, ctx) {
    let cur = 0, play = null;
    el.innerHTML = `${pageHead("How VitalGate protects medical imaging networks", "From a scanner sending an image to an analyst making a decision, in ten steps. Click any step, or press play.",
      `<button class="btn primary" data-play>${icon("play")}<span>Play walkthrough</span></button>`)}
      ${card({ title: "Architecture", icon: "network", sub: "The highlighted part is the current step", body: `<div data-arch></div>` })}
      <div class="card mt16" style="padding:18px 20px" data-detail aria-live="polite"></div>
      <div class="how-steps mt16" data-steps>${STEPS.map((st, i) => `<button class="card how-step" data-i="${i}" style="animation-delay:${i * 60}ms"><span class="num">${String(i + 1).padStart(2, "0")}</span><div class="hic">${icon(st.ic)}</div><h3>${esc(st.t)}</h3><p>${esc(st.s)}</p></button>`).join("")}</div>`;
    const $ = (s) => el.querySelector(s);
    function show(i) {
      cur = i; const st = STEPS[i];
      el.querySelectorAll(".how-step").forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === i));
      $("[data-arch]").innerHTML = arch(st.node);
      $("[data-detail]").innerHTML = `<div class="row between wrap"><div class="row"><div class="hic" style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--blue),var(--blue-deep));color:#fff;display:grid;place-items:center">${icon(st.ic)}</div>
        <div><div class="tiny muted" style="font-weight:700;letter-spacing:.06em">STEP ${i + 1} OF ${STEPS.length}</div><h2 style="font-size:18px">${esc(st.t)}</h2></div></div>
        <div class="row"><button class="btn sm" data-prev ${i ? "" : "disabled"}>${icon("chevLeft")}<span>Previous</span></button><button class="btn sm" data-next ${i < STEPS.length - 1 ? "" : "disabled"}><span>Next</span>${icon("chevRight")}</button></div></div>
        <div class="grid g2 mt12"><div><div class="tiny muted mb8" style="font-weight:700">IN PLAIN WORDS</div><p>${esc(st.plain)}</p></div><div><div class="tiny muted mb8" style="font-weight:700">TECHNICALLY</div><p class="muted">${esc(st.tech)}</p></div></div>`;
      $("[data-prev]").onclick = () => { stop(); show(Math.max(0, cur - 1)); };
      $("[data-next]").onclick = () => { stop(); show(Math.min(STEPS.length - 1, cur + 1)); };
    }
    const stop = () => { clearInterval(play); play = null; $("[data-play]").innerHTML = `${icon("play")}<span>Play walkthrough</span>`; };
    $("[data-play]").onclick = () => {
      if (play) return stop();
      $("[data-play]").innerHTML = `${icon("pause")}<span>Pause</span>`;
      if (cur === STEPS.length - 1) show(0);
      play = setInterval(() => { if (cur >= STEPS.length - 1) return stop(); show(cur + 1); }, 4500);
    };
    $("[data-steps]").onclick = (e) => { const b = e.target.closest("[data-i]"); if (b) { stop(); show(Number(b.dataset.i)); } };
    show(0);
    return { destroy: () => clearInterval(play) };
  },
};

function arch(hl) {
  const N = (id, x, y, w, h, title, sub) => `<g><rect class="node ${hl === id ? "hl" : ""}" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/><text class="t1" x="${x + w / 2}" y="${y + h / 2 - 2}" text-anchor="middle">${title}</text><text x="${x + w / 2}" y="${y + h / 2 + 14}" text-anchor="middle">${sub}</text></g>`;
  const devs = ["CT", "MRI", "X-ray", "Ultrasound", "Workstation"];
  let s = `<svg class="arch" viewBox="0 0 1000 300" role="img" aria-label="VitalGate architecture">`;
  devs.forEach((d, i) => { const y = 22 + i * 52; s += `<rect class="node ${hl === "dev" ? "hl" : ""}" x="10" y="${y}" width="120" height="38" rx="10"/><text class="t1" x="70" y="${y + 24}" text-anchor="middle">${d}</text><path class="wire" d="M130 ${y + 19} C 170 ${y + 19}, 170 150, 200 150"/>`; });
  s += N("sensor", 200, 112, 130, 76, "Sensor", "512 B · GRO · 83 feat.");
  s += `<path class="wire" d="M330 150 H 360"/>` + N("rule", 360, 40, 120, 60, "DICOM rule", "preamble DPI") + N("model", 360, 200, 120, 60, "Federated model", "XGBoost score");
  s += `<path class="wire" d="M345 150 V 70 H 360"/><path class="wire" d="M345 150 V 230 H 360"/>`;
  s += N("xai", 510, 200, 110, 60, "TreeSHAP", "8 evidence groups") + `<path class="wire" d="M480 230 H 510"/>`;
  s += N("cusum", 510, 40, 110, 60, "CUSUM", "evidence over time") + `<path class="wire" d="M480 70 H 510"/><path class="wire" d="M420 200 C 420 150, 560 150, 565 100"/>`;
  s += N("ladder", 650, 40, 120, 60, "Response ladder", "L0–L4 + caps") + `<path class="wire" d="M620 70 H 650"/>`;
  s += N("pep", 800, 40, 90, 60, "Gateway", "nftables TTL") + `<path class="wire" d="M770 70 H 800"/>`;
  s += `<rect class="node" x="910" y="30" width="80" height="80" rx="12"/><text class="t1" x="950" y="74" text-anchor="middle">PACS</text><path class="wire" d="M890 70 H 910"/>`;
  s += N("soc", 650, 200, 240, 60, "SOC console", "alerts · explanations · triage") + `<path class="wire" d="M620 230 H 650"/><path class="wire" d="M710 100 V 200"/>`;
  return s + "</svg>";
}
