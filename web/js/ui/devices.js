// Medical-equipment illustrations (SVG, theme aware). Only device types present in the test-bed inventory are used.
const B = "var(--dev-body)", S = "var(--dev-shade)", A = "var(--dev-accent)", D = "var(--dev-dark)", SC = "var(--dev-screen)";
const shadow = (cx = 80, w = 62) => `<ellipse cx="${cx}" cy="104" rx="${w}" ry="5" fill="var(--dev-floor)"/>`;
const ART = {
  ct: `${shadow(78, 66)}
    <rect x="96" y="70" width="58" height="9" rx="4.5" fill="${S}"/><rect x="100" y="62" width="54" height="9" rx="4.5" fill="${B}" stroke="${S}"/>
    <rect x="112" y="79" width="12" height="22" rx="2" fill="${S}"/>
    <rect x="18" y="14" width="86" height="88" rx="20" fill="${B}" stroke="${S}" stroke-width="1.5"/>
    <circle cx="61" cy="56" r="27" fill="${S}"/><circle cx="61" cy="56" r="19" fill="var(--dev-bore)"/>
    <path d="M38 34a32 32 0 0 1 46 0" stroke="${A}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="30" y="90" width="20" height="4" rx="2" fill="${A}" opacity=".8"/><circle cx="90" cy="92" r="2.2" fill="var(--ok)"/>
    <rect x="22" y="100" width="78" height="4" rx="2" fill="${S}"/>`,
  mri: `${shadow(80, 70)}
    <rect x="100" y="70" width="56" height="9" rx="4.5" fill="${S}"/><rect x="104" y="62" width="52" height="9" rx="4.5" fill="${B}" stroke="${S}"/>
    <rect x="116" y="79" width="12" height="22" rx="2" fill="${S}"/>
    <rect x="10" y="10" width="100" height="92" rx="14" fill="${B}" stroke="${S}" stroke-width="1.5"/>
    <rect x="10" y="10" width="100" height="16" rx="8" fill="${S}" opacity=".7"/>
    <circle cx="60" cy="60" r="30" fill="${S}"/><circle cx="60" cy="60" r="22" fill="var(--dev-bore)"/><circle cx="60" cy="60" r="22" fill="none" stroke="${A}" stroke-width="1.5" opacity=".6"/>
    <rect x="20" y="16" width="30" height="4" rx="2" fill="${A}"/><circle cx="98" cy="18" r="2.2" fill="var(--ok)"/>`,
  cr: `${shadow(80, 64)}
    <rect x="22" y="70" width="112" height="10" rx="4" fill="${B}" stroke="${S}"/><rect x="40" y="80" width="10" height="22" fill="${S}"/><rect x="106" y="80" width="10" height="22" fill="${S}"/>
    <rect x="30" y="76" width="96" height="6" rx="2" fill="${A}" opacity=".25"/>
    <rect x="128" y="12" width="12" height="90" rx="4" fill="${B}" stroke="${S}"/>
    <rect x="66" y="18" width="70" height="9" rx="4" fill="${S}"/>
    <rect x="62" y="24" width="30" height="22" rx="6" fill="${B}" stroke="${S}"/><path d="M68 46h18l-4 9h-10z" fill="${D}"/>
    <path d="M77 56v10" stroke="${A}" stroke-width="2" stroke-dasharray="2 3"/><circle cx="85" cy="31" r="2" fill="${A}"/>`,
  dx: `${shadow(80, 64)}
    <rect x="112" y="10" width="34" height="92" rx="6" fill="${B}" stroke="${S}"/><rect x="118" y="24" width="22" height="40" rx="3" fill="${SC}"/>
    <rect x="120" y="26" width="18" height="36" rx="2" fill="url(#dxg)" opacity=".9"/>
    <rect x="14" y="10" width="64" height="7" rx="3.5" fill="${S}"/><rect x="40" y="16" width="6" height="22" fill="${S}"/>
    <rect x="26" y="36" width="34" height="22" rx="6" fill="${B}" stroke="${S}"/><path d="M60 47h12l-2 7h-10z" fill="${D}"/>
    <path d="M72 50h34" stroke="${A}" stroke-width="2" stroke-dasharray="2 3"/><circle cx="34" cy="43" r="2" fill="${A}"/>
    <defs><linearGradient id="dxg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FB2FF" stop-opacity=".5"/><stop offset="1" stop-color="#1769E0" stop-opacity=".15"/></linearGradient></defs>`,
  us: `${shadow(80, 46)}
    <rect x="52" y="10" width="58" height="40" rx="5" fill="${D}"/><rect x="56" y="14" width="50" height="32" rx="2" fill="${SC}"/>
    <path d="M62 40c6-14 12-18 19-18s13 4 19 18" fill="none" stroke="${A}" stroke-width="1.6" opacity=".9"/><path d="M70 40c4-8 7-10 11-10s7 2 11 10" fill="none" stroke="${A}" stroke-width="1" opacity=".6"/>
    <rect x="76" y="50" width="10" height="10" fill="${S}"/>
    <path d="M44 60h74l-6 14H50z" fill="${B}" stroke="${S}"/><rect x="58" y="63" width="46" height="3" rx="1.5" fill="${A}" opacity=".5"/>
    <rect x="58" y="74" width="46" height="22" rx="4" fill="${B}" stroke="${S}"/><circle cx="62" cy="100" r="3.5" fill="${D}"/><circle cx="100" cy="100" r="3.5" fill="${D}"/>
    <path d="M118 66c14 2 16 12 10 22" fill="none" stroke="${D}" stroke-width="1.6"/><rect x="124" y="86" width="9" height="14" rx="3" fill="${B}" stroke="${S}" transform="rotate(-18 128 93)"/>`,
  ws: `${shadow(80, 64)}
    <rect x="16" y="88" width="128" height="6" rx="3" fill="${S}"/>
    <rect x="18" y="20" width="58" height="44" rx="4" fill="${D}"/><rect x="21" y="23" width="52" height="38" rx="2" fill="${SC}"/>
    <rect x="84" y="20" width="58" height="44" rx="4" fill="${D}"/><rect x="87" y="23" width="52" height="38" rx="2" fill="${SC}"/>
    <g opacity=".85"><rect x="25" y="27" width="21" height="14" rx="1" fill="#2F5A93"/><rect x="48" y="27" width="21" height="14" rx="1" fill="#244A7C"/><rect x="25" y="43" width="21" height="14" rx="1" fill="#244A7C"/><rect x="48" y="43" width="21" height="14" rx="1" fill="#2F5A93"/>
    <circle cx="113" cy="42" r="12" fill="#2F5A93"/><circle cx="113" cy="42" r="6" fill="#4C80C4"/></g>
    <rect x="43" y="64" width="8" height="18" fill="${S}"/><rect x="109" y="64" width="8" height="18" fill="${S}"/>
    <rect x="52" y="80" width="56" height="8" rx="2" fill="${B}" stroke="${S}"/>`,
  pacs: `${shadow(80, 40)}
    <rect x="50" y="6" width="60" height="96" rx="6" fill="${D}"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="55" y="${12 + i * 14.5}" width="50" height="11" rx="2" fill="${B}" opacity=".95"/><circle cx="61" cy="${17.5 + i * 14.5}" r="1.8" fill="${i % 2 ? "var(--ok)" : "var(--dev-accent)"}" class="blink" style="animation-delay:${i * .3}s"/><rect x="68" y="${16 + i * 14.5}" width="30" height="3" rx="1.5" fill="${S}"/>`).join("")}`,
  nms: `${shadow(80, 46)}
    <rect x="34" y="52" width="92" height="40" rx="7" fill="${B}" stroke="${S}"/><rect x="42" y="60" width="50" height="24" rx="3" fill="${SC}"/>
    <path d="M45 78l7-6 6 3 7-10 7 6 6-4 9 3" fill="none" stroke="${A}" stroke-width="1.6"/>
    <circle cx="104" cy="66" r="3" fill="var(--ok)"/><circle cx="114" cy="66" r="3" fill="${A}"/><rect x="100" y="76" width="18" height="3" rx="1.5" fill="${S}"/>
    <path d="M110 52V28" stroke="${D}" stroke-width="2.4" stroke-linecap="round"/><path d="M101 24a13 13 0 0 1 18 0M96 18a21 21 0 0 1 28 0" fill="none" stroke="${A}" stroke-width="1.8" stroke-linecap="round"/>`,
  quar: `${shadow(80, 46)}
    <rect x="36" y="20" width="88" height="80" rx="8" fill="${B}" stroke="${S}" stroke-width="1.5"/><rect x="44" y="28" width="72" height="64" rx="5" fill="${S}" opacity=".5"/>
    <circle cx="80" cy="60" r="18" fill="${B}" stroke="var(--l3)" stroke-width="3"/><path d="M80 48v24M68 60h24" stroke="var(--l3)" stroke-width="3" stroke-linecap="round" transform="rotate(45 80 60)"/>
    <rect x="114" y="44" width="6" height="32" rx="3" fill="${D}"/>`,
  unknown: `${shadow(80, 40)}
    <rect x="46" y="22" width="68" height="78" rx="9" fill="${B}" stroke="${S}" stroke-width="1.5" stroke-dasharray="5 4"/>
    <text x="80" y="76" text-anchor="middle" style="font-size:44px;font-weight:700;fill:var(--text-3)">?</text>`,
};
export function deviceArt(kind, cls = "") {
  return `<svg class="dev-art ${cls}" viewBox="0 0 160 110" role="img" aria-label="${kind} illustration">${ART[kind] || ART.unknown}</svg>`;
}
