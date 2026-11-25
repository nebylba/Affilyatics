// Shared by the background worker (importScripts) and the popup (<script>).

const LOCALES = {
  US: { mid: 'ATVPDKIKX0DER', cur: 'USD', label: 'United States', short: 'US', tld: 'com' },
  CA: { mid: 'A2EUQ1WTGCTBG2', cur: 'CAD', label: 'Canada', short: 'CA', tld: 'ca' },
  GB: { mid: 'A1F83G8C2ARO7P', cur: 'GBP', label: 'United Kingdom', short: 'UK', tld: 'co.uk' },
  FR: { mid: 'A13V1IB3VIYZZH', cur: 'EUR', label: 'France', short: 'FR', tld: 'fr' },
  DE: { mid: 'A1PA6795UKMFR9', cur: 'EUR', label: 'Germany', short: 'DE', tld: 'de' },
  IT: { mid: 'APJ6JRA9NG5V4', cur: 'EUR', label: 'Italy', short: 'IT', tld: 'it' },
  ES: { mid: 'A1RKKUPIHCS9HS', cur: 'EUR', label: 'Spain', short: 'ES', tld: 'es' },
  NL: { mid: 'A1805IZSGTT6HS', cur: 'EUR', label: 'Netherlands', short: 'NL', tld: 'nl' },
  SE: { mid: 'A2NODRKZP88ZB9', cur: 'SEK', label: 'Sweden', short: 'SE', tld: 'se' },
  PL: { mid: 'A1C3SOZRARQ6R3', cur: 'PLN', label: 'Poland', short: 'PL', tld: 'pl' },
  // Countries below only exist as their own Associates site (not reachable through the US account). `mid` is a fallback: for a
  // separate site the worker uses the marketplaceId that the site's own page reports (pageState), so a wrong value here is harmless.
  JP: { mid: 'A1VC38T7YXB528', cur: 'JPY', label: 'Japan', short: 'JP', tld: 'co.jp' },
  IN: { mid: 'A21TJRUUN4KGV', cur: 'INR', label: 'India', short: 'IN', tld: 'in' },
  BR: { mid: 'A2Q3Y263D00KWC', cur: 'BRL', label: 'Brazil', short: 'BR', tld: 'com.br' },
  MX: { mid: 'A1AM78C64UM0Y8', cur: 'MXN', label: 'Mexico', short: 'MX', tld: 'com.mx' },
  AU: { mid: 'A39IBJ37TRP1C6', cur: 'AUD', label: 'Australia', short: 'AU', tld: 'com.au' },
  AE: { mid: 'A2VIGQ35RCS4UG', cur: 'AED', label: 'United Arab Emirates', short: 'AE', tld: 'ae' },
  SG: { mid: 'A19VAU5U5O7RUS', cur: 'SGD', label: 'Singapore', short: 'SG', tld: 'sg' },
  SA: { mid: 'A17E79C6D8DWNP', cur: 'SAR', label: 'Saudi Arabia', short: 'SA', tld: 'sa' },
  BE: { mid: 'AMEN7PMS3EDWL', cur: 'EUR', label: 'Belgium', short: 'BE', tld: 'com.be' },
  IE: { mid: 'A28R8C7NBKEWEA', cur: 'EUR', label: 'Ireland', short: 'IE', tld: 'ie' },
  TR: { mid: 'A33AVAJ2PDY3EV', cur: 'TRY', label: 'Turkey', short: 'TR', tld: 'com.tr' },
  EG: { mid: 'ARBP9OOSHTCHU', cur: 'EGP', label: 'Egypt', short: 'EG', tld: 'eg' }
};

// The main Associates site (the US one). Every account on another site is a "separate account".
const MAIN_SITE = 'https://affiliate-program.amazon.com';

// Amazon runs one Associates site per country and lists all of them in the country switcher of every page (the radio buttons
// `ac-country` with `data-url`). The worker reads that list (at least every 24 h) and checks which sites the user has an account on
// (docs/ASSOCIATES_SITES.md). The two maps below are only the built-in fallback until the first discovery has run.
//   SEPARATE_SITES: countries whose data is ONLY on their own site (Pro). Canada is the verified one; the others cannot be reached
//                   through the US account at all.
//   OWN_SITES:      countries that the US account also reaches as a marketplace (GB, DE, FR, IT, ES, NL, SE, PL), but where the user
//                   may ALSO have an account of their own, with other stores (those stores are added as extra accounts, Pro).
const SEPARATE_SITES = {
  CA: 'https://associates.amazon.ca', JP: 'https://affiliate.amazon.co.jp', IN: 'https://affiliate-program.amazon.in',
  BR: 'https://associados.amazon.com.br', MX: 'https://afiliados.amazon.com.mx', AU: 'https://affiliate-program.amazon.com.au',
  AE: 'https://affiliate-program.amazon.ae', SG: 'https://affiliate-program.amazon.sg', SA: 'https://affiliate-program.amazon.sa',
  BE: 'https://affiliate-program.amazon.com.be', IE: 'https://affiliate-program.amazon.ie', TR: 'https://gelirortakligi.amazon.com.tr',
  EG: 'https://affiliate-program.amazon.eg'
};
const OWN_SITES = {
  GB: 'https://affiliate-program.amazon.co.uk', DE: 'https://partnernet.amazon.de', FR: 'https://partenaires.amazon.fr',
  IT: 'https://programma-affiliazione.amazon.it', ES: 'https://afiliados.amazon.es', NL: 'https://partnernet.amazon.nl',
  SE: 'https://affiliate-program.amazon.se', PL: 'https://affiliate-program.amazon.pl'
};
const VIA_US = new Set(Object.keys(OWN_SITES));    // reachable through the US account too
const allSites = () => ({ ...OWN_SITES, ...SEPARATE_SITES });   // country -> site, everything except the US

// Apply what the worker discovered (stored under `countrySites`): { sites: {CODE: url}, locales: {CODE: {label,cur,mid,tld}} }.
// A country that Amazon adds later is registered here too, so it shows up without a new extension version.
function applyDiscovered(d) {
  if (!d) return;
  for (const [code, meta] of Object.entries(d.locales || {})) if (!LOCALES[code]) LOCALES[code] = { short: code, tld: '', ...meta };
  for (const [code, url] of Object.entries(d.sites || {})) {
    if (code === 'US' || !LOCALES[code] || !/^https:\/\/[a-z0-9.-]+\.amazon\.[a-z.]+\/?$/i.test(url)) continue;
    (VIA_US.has(code) ? OWN_SITES : SEPARATE_SITES)[code] = url.replace(/\/$/, '');
  }
}

const PERIODS = [
  { id: 'today', label: 'Today', current: true },
  { id: 'yesterday', label: 'Yesterday', current: false },
  { id: 'last7', label: 'Last 7 days', current: true },
  { id: 'last30', label: 'Last 30 days', current: true },
  { id: 'month', label: 'This month', current: true },
  { id: 'lastMonth', label: 'Last month', current: false },
  { id: 'quarter', label: 'This quarter', current: true },
  { id: 'lastQuarter', label: 'Last quarter', current: false },
  { id: 'year', label: 'This year', current: true },
  { id: 'lastYear', label: 'Last year', current: false }
];

const DEFAULTS = {
  countries: ['US', 'CA', 'GB', 'FR', 'DE'], accounts: null, period: 'month', tab: 'ALL',
  // which events create a notification; `desktop` = also show Chrome desktop alerts (needs the optional "notifications" permission)
  notify: { orders: true, commissions: true, bonuses: true, rewards: true, enroll: true, connections: true, signedout: true, dataissue: true, desktop: false }
};

// Fallback US-dollar value of one unit of each currency (used until today's real rates have arrived). Used ONLY to decide which currency is the "main" (biggest) one when a view
// mixes several: amounts are never converted or added up across currencies.
const APPROX_USD = { USD: 1, CAD: 0.73, GBP: 1.27, EUR: 1.09, SEK: 0.095, PLN: 0.25, AUD: 0.65, JPY: 0.0067, INR: 0.012, BRL: 0.18, MXN: 0.05, TRY: 0.03, AED: 0.27, SAR: 0.27, SGD: 0.74, EGP: 0.02 };
// Today's real exchange rates: the worker fetches them from our server (which gets them daily from ExchangeRate-API) and keeps them in
// `rates` in chrome.storage.local. Until the first answer, and for a currency the table does not know, APPROX_USD above is used.
const RATES = { date: null, real: false, usd: { ...APPROX_USD } };            // usd[CUR] = US dollars for one unit of CUR
function applyRates(r) {
  if (!r || !r.perUsd) return;
  const u = { ...APPROX_USD };
  for (const [c, v] of Object.entries(r.perUsd)) if (typeof v === 'number' && v > 0) u[c] = 1 / v;
  RATES.usd = u; RATES.date = r.date || null; RATES.real = true;
}
const usdish = (n, cur) => n * (RATES.usd[cur] || 1);

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

// -> ['YYYY-MM-DD', 'YYYY-MM-DD'] in local time
function rangeFor(id, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const D = (yy, mm, dd) => new Date(yy, mm, dd);
  const T = D(y, m, d), q = Math.floor(m / 3);
  let r;
  switch (id) {
    case 'today': r = [T, T]; break;
    case 'yesterday': r = [D(y, m, d - 1), D(y, m, d - 1)]; break;
    case 'last7': r = [D(y, m, d - 6), T]; break;
    case 'last30': r = [D(y, m, d - 29), T]; break;
    case 'last90': r = [D(y, m, d - 89), T]; break; // internal (pending shipments), not in PERIODS
    case 'lastMonth': r = [D(y, m - 1, 1), D(y, m, 0)]; break;
    case 'quarter': r = [D(y, q * 3, 1), T]; break;
    case 'lastQuarter': r = [D(y, (q - 1) * 3, 1), D(y, q * 3, 0)]; break;
    case 'year': r = [D(y, 0, 1), T]; break;
    case 'lastYear': r = [D(y - 1, 0, 1), D(y - 1, 11, 31)]; break;
    default: r = [D(y, m, 1), T]; // month
  }
  return [ymd(r[0]), ymd(r[1])];
}

// Amazon rejects ranges longer than ~90 days, so split.
function splitRange([s, e], maxDays = 90) {
  const out = [];
  let cur = parseYmd(s);
  const end = parseYmd(e);
  while (cur <= end) {
    const stop = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + maxDays - 1);
    const to = stop < end ? stop : end;
    out.push([ymd(cur), ymd(to)]);
    cur = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  }
  return out;
}

function listDays([s, e]) {
  const out = [];
  for (let d = parseYmd(s); d <= parseYmd(e); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(ymd(d));
  return out;
}

// Inline SVG flags (emoji flags don't render on Windows). 24x16 box.
const FLAG_BODY = {
  US: '<rect width="24" height="16" fill="#fff"/>' + [0, 2, 4, 6, 8, 10, 12].map((i) => `<rect y="${(i * 16 / 13).toFixed(2)}" width="24" height="${(16 / 13).toFixed(2)}" fill="#B22234"/>`).join('') + '<rect width="10" height="8.62" fill="#3C3B6E"/>',
  CA: '<rect width="24" height="16" fill="#fff"/><rect width="6" height="16" fill="#D80621"/><rect x="18" width="6" height="16" fill="#D80621"/><path d="M12 3l1 2.2 1.6-.6-.5 3 1.9-1-.5 1.7 1.1.5-2.8 2.3.5 1.3-3.3-.6V13h-1v-2.5l-3.3.6.5-1.3-2.8-2.3 1.1-.5-.5-1.7 1.9 1-.5-3 1.6.6z" fill="#D80621"/>',
  GB: '<svg width="24" height="16" viewBox="0 0 60 30" preserveAspectRatio="none"><rect width="60" height="30" fill="#012169"/><path d="M0 0L60 30M60 0L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0L60 30M60 0L0 30" stroke="#C8102E" stroke-width="2"/><path d="M30 0V30M0 15H60" stroke="#fff" stroke-width="10"/><path d="M30 0V30M0 15H60" stroke="#C8102E" stroke-width="6"/></svg>',
  FR: '<rect width="8" height="16" fill="#0055A4"/><rect x="8" width="8" height="16" fill="#fff"/><rect x="16" width="8" height="16" fill="#EF4135"/>',
  DE: '<rect width="24" height="5.34" fill="#000"/><rect y="5.33" width="24" height="5.34" fill="#DD0000"/><rect y="10.66" width="24" height="5.34" fill="#FFCE00"/>',
  IT: '<rect width="8" height="16" fill="#009246"/><rect x="8" width="8" height="16" fill="#fff"/><rect x="16" width="8" height="16" fill="#CE2B37"/>',
  ES: '<rect width="24" height="16" fill="#AA151B"/><rect y="4" width="24" height="8" fill="#F1BF00"/>',
  NL: '<rect width="24" height="5.34" fill="#AE1C28"/><rect y="5.33" width="24" height="5.34" fill="#fff"/><rect y="10.66" width="24" height="5.34" fill="#21468B"/>',
  SE: '<rect width="24" height="16" fill="#006AA7"/><rect x="7" width="3" height="16" fill="#FECC00"/><rect y="6.5" width="24" height="3" fill="#FECC00"/>',
  PL: '<rect width="24" height="8" fill="#fff"/><rect y="8" width="24" height="8" fill="#DC143C"/>',
  JP: '<rect width="24" height="16" fill="#fff"/><circle cx="12" cy="8" r="4.6" fill="#BC002D"/>',
  IN: '<rect width="24" height="5.34" fill="#FF9933"/><rect y="5.33" width="24" height="5.34" fill="#fff"/><rect y="10.66" width="24" height="5.34" fill="#138808"/><circle cx="12" cy="8" r="1.9" fill="none" stroke="#000080" stroke-width=".6"/>',
  BR: '<rect width="24" height="16" fill="#009C3B"/><path d="M12 2 22 8 12 14 2 8z" fill="#FFDF00"/><circle cx="12" cy="8" r="3.2" fill="#002776"/>',
  MX: '<rect width="8" height="16" fill="#006847"/><rect x="8" width="8" height="16" fill="#fff"/><rect x="16" width="8" height="16" fill="#CE1126"/><circle cx="12" cy="8" r="1.6" fill="#8C6B2F"/>',
  AU: '<rect width="24" height="16" fill="#012169"/><path d="M0 0 11 7M11 0 0 7" stroke="#fff" stroke-width="1.6"/><path d="M5.5 0v7M0 3.5h11" stroke="#fff" stroke-width="2.4"/><path d="M5.5 0v7M0 3.5h11" stroke="#C8102E" stroke-width="1.2"/><circle cx="5.5" cy="12" r="1.7" fill="#fff"/><circle cx="17" cy="4" r=".9" fill="#fff"/><circle cx="19.5" cy="8" r=".9" fill="#fff"/><circle cx="17" cy="12" r=".9" fill="#fff"/><circle cx="14.5" cy="7" r=".9" fill="#fff"/>',
  AE: '<rect width="24" height="5.34" fill="#00732F"/><rect y="5.33" width="24" height="5.34" fill="#fff"/><rect y="10.66" width="24" height="5.34" fill="#000"/><rect width="6.5" height="16" fill="#FF0000"/>',
  SG: '<rect width="24" height="8" fill="#EF3340"/><rect y="8" width="24" height="8" fill="#fff"/><circle cx="6" cy="4" r="2.6" fill="#fff"/><circle cx="7.1" cy="4" r="2.4" fill="#EF3340"/>',
  SA: '<rect width="24" height="16" fill="#006C35"/><rect x="5" y="10.5" width="14" height="1.2" rx=".6" fill="#fff"/><rect x="7" y="5" width="10" height="2" rx="1" fill="#fff"/>',
  BE: '<rect width="8" height="16" fill="#000"/><rect x="8" width="8" height="16" fill="#FDDA24"/><rect x="16" width="8" height="16" fill="#EF3340"/>',
  IE: '<rect width="8" height="16" fill="#169B62"/><rect x="8" width="8" height="16" fill="#fff"/><rect x="16" width="8" height="16" fill="#FF883E"/>',
  TR: '<rect width="24" height="16" fill="#E30A17"/><circle cx="9" cy="8" r="4" fill="#fff"/><circle cx="10.2" cy="8" r="3.2" fill="#E30A17"/><circle cx="14.2" cy="8" r="1.1" fill="#fff"/>',
  EG: '<rect width="24" height="5.34" fill="#CE1126"/><rect y="5.33" width="24" height="5.34" fill="#fff"/><rect y="10.66" width="24" height="5.34" fill="#000"/><circle cx="12" cy="8" r="1.4" fill="#C09300"/>'
};
function flagSVG(loc) {
  const b = FLAG_BODY[loc];
  if (b) return `<svg class="flag" viewBox="0 0 24 16" width="21" height="14" aria-hidden="true">${b}</svg>`;
  // a country Amazon added later (no drawn flag yet): its code on a grey flag
  return loc ? `<svg class="flag" viewBox="0 0 24 16" width="21" height="14" aria-hidden="true"><rect width="24" height="16" rx="2" fill="#8892a6"/><text x="12" y="11.4" text-anchor="middle" font-size="8.5" font-family="Arial,sans-serif" font-weight="700" fill="#fff">${String(loc).slice(0, 2)}</text></svg>` : '';
}
