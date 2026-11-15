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
  PL: { mid: 'A1C3SOZRARQ6R3', cur: 'PLN', label: 'Poland', short: 'PL', tld: 'pl' }
};

// Countries whose data lives on their OWN Associates site/account (Amazon lists every country's site in the page header).
// Canada: associates.amazon.ca, store bestgpuca-20 (verified: matches the numbers its dashboard shows).
// Everything else is read through the US site.
const SEPARATE_SITES = { CA: 'https://associates.amazon.ca' };

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
  notify: { orders: true, commissions: true, bonuses: true, rewards: true, connections: true, signedout: true, dataissue: true, desktop: false }
};

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
  PL: '<rect width="24" height="8" fill="#fff"/><rect y="8" width="24" height="8" fill="#DC143C"/>'
};
function flagSVG(loc) {
  const b = FLAG_BODY[loc];
  return b ? `<svg class="flag" viewBox="0 0 24 16" width="21" height="14" aria-hidden="true">${b}</svg>` : '';
}
