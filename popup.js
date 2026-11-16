// Affilyatics popup. All data comes from chrome.storage (filled by background.js).

const SERIES = [
  { id: 'total', label: 'Total income', money: true },
  { id: 'earnings', label: 'Earnings', money: true, bar: true },
  { id: 'bounty', label: 'Bounties', money: true },
  { id: 'bonus', label: 'Bonus', money: true },
  { id: 'connections', label: 'Creator Connections', money: true },
  { id: 'rewards', label: 'Creator Rewards', money: true },
  { id: 'orderedRevenue', label: 'Ordered revenue', money: true },
  { id: 'clicks', label: 'Clicks' },
  { id: 'ordered', label: 'Ordered items' },
  { id: 'shipped', label: 'Shipped items' },
  { id: 'returned', label: 'Returned items' }
];

let settings = { ...DEFAULTS };
let cache = {}, status = {}, accounts = [], rawAccounts = [], license = {};
let notif = { items: [], readAt: 0 };
const view = { gmode: 'in', draft: { email: '', password: '' }, verify: null, gateInfo: '',  sel: null, stores: null, tags: null, storeOpen: false, tagOpen: false, locOpen: false, period: 'month', from: null, to: null, sub: null, metrics: new Set(['earnings', 'clicks', 'ordered']), group: null, cumulative: false, showSettings: false, ddOpen: false, perOpen: false, calOpen: false, notifOpen: false, notifFrom: 0, notifMsg: '', cal: { month: null, start: null, end: null, picking: false } };

// ---- plan (Free / Pro): what the stored license answer allows (see plan.js) ----------------------------
const isProNow = () => planOf(license) === 'pro';
const signedIn = () => accountOk(license);
const isSepAccount = (a) => Object.values(SEPARATE_SITES).includes(a.base);
const setAccounts = (raw) => { rawAccounts = raw || []; accounts = isProNow() ? rawAccounts : rawAccounts.filter((a) => !isSepAccount(a)); };
const periodOk = (id) => isProNow() || FREE_PERIODS.includes(id);
const tabOk = (id) => isProNow() || FEATURES.free.tabs.includes(id);
const trialAvailable = () => !(license.ent && (license.ent.trialEndsAt || license.ent.reason === 'trial_ended'));
const LOCK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const PRO_PILL = '<span class="propill">PRO</span>';
// Free users see what Pro adds, and a click explains it (view.upsell = which feature asked).
function openUpsell(key) { closePops(); view.upsell = UPSELL[key] ? key : 'plan'; render(); }
// A view that Free does not include (restored from an earlier Pro/trial session, or after a trial ended) falls back to a Free one.
function clampView() {
  if (isProNow()) return;
  if (!periodOk(view.period)) { view.period = 'month'; view.from = view.to = null; view.group = null; }
  if (!periodOk(settings.period)) settings.period = 'month';
  view.tags = null;
  if (view.sub && !tabOk(view.sub)) view.sub = null;
  if (view.stores) { const l = [...view.stores].filter((id) => accounts.some((a) => a.id === id)); view.stores = l.length && l.length < accounts.length ? new Set(l) : null; }
}

const ICON_MOON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
// light / dark: follows the system until you pick one; the choice is kept (localStorage is read early by theme.js)
const rootEl = () => document.documentElement || { dataset: {} };
const isDark = () => { const t = rootEl().dataset.theme; return t ? t === 'dark' : !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); };
function applyTheme(t) { if (t === 'light' || t === 'dark') rootEl().dataset.theme = t; }
const ICON_GEAR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
const todayStr = () => ymd(new Date());
// Range of the selected period (custom = the two date pickers).
const curRange = () => (view.period === 'custom' && view.from && view.to ? [view.from, view.to] : rangeFor(view.period === 'custom' ? 'month' : view.period));
const isLoading = () => !!status.loading && Date.now() - (status.startedAt || 0) < 180000;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => Math.round(n).toLocaleString();
const fmtMoney = (n, cur, compact) => {
  try { return n.toLocaleString(undefined, { style: 'currency', currency: cur, ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}) }); }
  catch { return n.toFixed(2) + ' ' + cur; }
};
const pct = (a, b) => (b ? (a / b * 100).toFixed(2) + '%' : '—');
const FIELDS = ['clicks', 'ordered', 'shipped', 'returned', 'orderedRevenue', 'revenue', 'earnings'];
const zero = () => Object.fromEntries(FIELDS.map((f) => [f, 0]));

// ---- state helpers ------------------------------------------------------------------------
const enabledCountries = () => { const l = settings.countries.filter((c) => LOCALES[c] && (isProNow() || !SEPARATE_SITES[c])); return l.length ? l : ['US']; };
// Stores: the ones included in Settings, narrowed by the Store filter under the logo (view.stores = a Set of store ids, or null for all).
const activeAccounts = () => accounts.filter((a) => (!settings.accounts || settings.accounts.includes(a.id)) && (!view.stores || view.stores.has(a.id)));
// Countries shown: view.sel = a Set of countries, or null for all enabled ones.
const selLocales = () => { const all = enabledCountries(); const l = view.sel ? all.filter((c) => view.sel.has(c)) : all; return l.length ? l : all; };
const multi = () => selLocales().length > 1;
// Cascade Store -> Countries -> Tags: each filter only offers what the one before it leaves.
// Countries the chosen store(s) sell in (all enabled countries when no store is chosen):
const allowedLocales = () => { const sold = new Set(activeAccounts().flatMap((a) => a.locales || [])); return enabledCountries().filter((c) => sold.has(c)); };
const allowedSel = () => { const a = allowedLocales(); return a.length && a.length < enabledCountries().length ? new Set(a) : null; };   // value for setSel: "all allowed"
// Tags: when the data of the whole scope (chosen stores x chosen countries) has arrived, drop chosen tags that no longer exist in it
// (for example the Canada tag after switching to the UK). If none is left, go back to all tags.
function pruneTags() {
  if (!view.tags || !view.tags.size) return;
  for (const loc of selLocales()) for (const a of activeAccounts()) if ((a.locales || []).includes(loc) && !entry(a.id, loc, 'tag')) return;   // not loaded yet: decide later
  const avail = new Set(); for (const loc of selLocales()) for (const a of activeAccounts()) { if (!(a.locales || []).includes(loc)) continue; const e = entry(a.id, loc, 'tag'); if (e) for (const r of e.rows) avail.add(r.name); }
  if (!avail.size) return;
  const keep = [...view.tags].filter((t) => avail.has(t));
  if (keep.length === view.tags.size) return;
  view.tags = keep.length && keep.length < avail.size ? new Set(keep) : null;
}
const subOptions = () => (multi()
  ? [['countries', 'Countries'], ['tag', 'Tracking IDs'], ['cat', 'Categories'], ['product', 'Products'], ['dates', 'Dates']]
  : [['tag', 'Tracking IDs'], ['cat', 'Categories'], ['product', 'Products'], ['dates', 'Dates']]);
const currentSub = () => (subOptions().some(([id]) => id === view.sub) && tabOk(view.sub) ? view.sub : subOptions().find(([id]) => tabOk(id))[0]);
const wantedDims = () => {
  const s = currentSub();
  const d = s === 'countries' || s === 'dates' ? ['day', 'connections', 'rewards'] : ['day', 'connections', 'rewards', s];
  if ((view.tagOpen || view.tags) && !d.includes('tag')) d.push('tag');   // the Tags filter needs the tracking-ID table
  if (view.tags && !d.includes('tagday')) d.push('tagday');             // ... and the daily clicks per tag for the chart
  return d;
};

function entry(acct, loc, dim) {
  const e = cache[`${acct}|${loc}|${view.period}|${dim}`];
  if (!e) return null;
  const r = curRange();
  return e.range[0] === r[0] && e.range[1] === r[1] ? e : null;
}
function collect(dim, raw) {
  if (dim === 'income') return collectIncome();
  let out = [];
  for (const loc of selLocales()) for (const a of activeAccounts()) {
    if (!(a.locales || []).includes(loc)) continue;
    const e = entry(a.id, loc, dim);
    if (e) for (const row of e.rows) out.push({ loc, acct: a.id, cur: LOCALES[loc].cur, ...row });
  }
  if (dim === 'tag' && view.tags && !raw) out = out.filter((r) => view.tags.has(r.name));   // Tags filter (Tracking IDs table only)
  return out;
}
// "Income" is derived: bounties + bonus ride along with the daily rows (one request), Creator Connections come separately.
function collectIncome() {
  const m = new Map();
  const get = (r) => {
    const k = `${r.loc}|${r.acct}|${r.name}`;
    let t = m.get(k);
    if (!t) { t = { loc: r.loc, acct: r.acct, cur: r.cur, name: r.name, bounty: 0, bonus: 0, connections: 0 }; m.set(k, t); }
    return t;
  };
  for (const r of collect('day')) { const t = get(r); t.bounty += r.bounty || 0; t.bonus += r.bonus || 0; }
  for (const r of collect('connections')) get(r).connections += r.connections || 0;
  return [...m.values()].filter((t) => t.bounty || t.bonus || t.connections);
}

// Amazon's own "last updated" stamps (per country) for the data on screen.
function amazonStamps() {
  const out = [];
  for (const loc of selLocales()) for (const a of activeAccounts()) {
    if (!(a.locales || []).includes(loc)) continue;
    const e = entry(a.id, loc, 'day');
    if (e && e.lu) { out.push(`${LOCALES[loc].short} ${e.lu}`); break; }
  }
  return out;
}

const haveData = (dim) => selLocales().some((loc) => activeAccounts().some((a) => (a.locales || []).includes(loc) && entry(a.id, loc, dim)));

function sumByCurrency(rows, incomeRows = [], rewardRows = []) {
  const byCur = {};
  const all = zero();
  const slot = (c) => (byCur[c] ||= { orderedRevenue: 0, earnings: 0, revenue: 0, bounty: 0, bonus: 0, connections: 0, rewards: 0, total: 0 });
  for (const r of rows) {
    const t = slot(r.cur);
    t.orderedRevenue += r.orderedRevenue; t.earnings += r.earnings; t.revenue += r.revenue;
    for (const f of ['clicks', 'ordered', 'shipped', 'returned']) all[f] += r[f];
  }
  for (const r of incomeRows) { const t = slot(r.cur); t.bounty += r.bounty; t.bonus += r.bonus; t.connections += r.connections; }
  for (const r of rewardRows) slot(r.cur).rewards += r.rewards;
  for (const t of Object.values(byCur)) t.total = t.earnings + t.bounty + t.bonus + t.connections + t.rewards;
  return { byCur, all };
}
function moneyLines(byCur, k) {
  const cs = Object.keys(byCur).filter((c) => byCur[c][k] !== 0);
  return cs.length ? cs.map((c) => `<span class="l2">${fmtMoney(byCur[c][k], c)}</span>`).join('') : '<span class="l2">—</span>';
}
const cell = (n, f) => `<td class="n ${n ? '' : 'zero'}">${f}</td>`;

// ---- chart ---------------------------------------------------------------------------------
function primaryCurrency(dayRows) {
  const t = {};
  for (const r of dayRows) t[r.cur] = (t[r.cur] || 0) + r.earnings;
  const best = Object.entries(t).sort((a, b) => usdish(b[1], b[0]) - usdish(a[1], a[0]))[0];
  return best ? best[0] : LOCALES[selLocales()[0]]?.cur || 'USD';
}

function weekStart(ds) { const d = parseYmd(ds); const k = (d.getDay() + 6) % 7; return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - k)); }

const emptyPt = (date) => Object.fromEntries([['date', date], ['held', false], ...SERIES.map((s) => [s.id, 0])]);

function buildPoints(dayRows, cur) {
  const days = listDays(curRange());
  const auto = days.length <= 95 ? 'day' : 'week';
  const group = view.group || auto;
  const idx = new Map(days.map((d, i) => [d, i]));
  const base = days.map((d) => emptyPt(d));
  for (const r of dayRows) {
    const i = idx.get(r.name); if (i == null) continue;
    const b = base[i];
    if (r.held) b.held = true;
    b.clicks += r.clicks; b.ordered += r.ordered; b.shipped += r.shipped; b.returned += r.returned;
    if (r.cur === cur) { b.earnings += r.earnings; b.orderedRevenue += r.orderedRevenue; }
  }
  for (const r of collect('income')) {
    const i = idx.get(r.name); if (i == null || r.cur !== cur) continue;
    base[i].bounty += r.bounty; base[i].bonus += r.bonus; base[i].connections += r.connections;
  }
  for (const r of collect('rewards')) {
    const i = idx.get(r.name); if (i == null || r.cur !== cur) continue;
    base[i].rewards += r.rewards;
  }
  for (const b of base) b.total = b.earnings + b.bounty + b.bonus + b.connections + b.rewards;
  let pts = base;
  if (group !== 'day') {
    const m = new Map();
    for (const b of base) {
      const k = group === 'week' ? weekStart(b.date) : b.date.slice(0, 7) + '-01';
      const t = m.get(k) || emptyPt(k);
      for (const s of SERIES) t[s.id] += b[s.id];
      if (b.held) t.held = true;
      m.set(k, t);
    }
    pts = [...m.values()];
  }
  const totals = Object.fromEntries(SERIES.map((s) => [s.id, pts.reduce((a, p) => a + p[s.id], 0)]));
  if (view.cumulative) {
    const run = {};
    pts = pts.map((p) => { const q = { date: p.date, held: p.held }; for (const s of SERIES) { run[s.id] = (run[s.id] || 0) + p[s.id]; q[s.id] = run[s.id]; } return q; });
  }
  return { pts, group, totals, auto };
}

const fmtDate = (ds, group) => {
  const d = parseYmd(ds);
  if (group === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmtSeries = (s, v, cur) => (s.money ? fmtMoney(v, cur) : fmtNum(v));

// Monotone cubic curve through the points: smooth like Amazon's chart, never dips below zero or overshoots.
function smoothPath(xs, ys) {
  const n = xs.length;
  if (n === 1) return `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / dx[i]; }
  const t = new Array(n);
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  }
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = xs[i] + dx[i] / 3, c1y = ys[i] + t[i] * dx[i] / 3;
    const c2x = xs[i + 1] - dx[i] / 3, c2y = ys[i + 1] - t[i + 1] * dx[i] / 3;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  return d;
}

function chartGeom(pts, vis) {
  const W = 740, H = 168, ml = 46, mr = 20, mt = 12, mb = 26; // H = 70% of the previous 240
  const pw = W - ml - mr, ph = H - mt - mb, n = pts.length, step = pw / n;
  const max = {};
  for (const s of vis) max[s.id] = Math.max(...pts.map((p) => p[s.id]), 0) || 1;
  return { W, H, ml, mr, mt, mb, pw, ph, n, step, max, X: (i) => ml + (i + 0.5) * step, Y: (s, v) => mt + ph - (v / max[s.id]) * ph };
}

function chartSVG(pts, vis, cur, group) {
  const { W, H, ml, mr, mt, ph, n, step, max, X, Y } = chartGeom(pts, vis);
  const prim = vis[0];
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const y = mt + ph - (k / 4) * ph;
    const v = max[prim.id] * k / 4;
    g += `<line class="grid" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/>` +
      `<text class="axis" x="${ml - 8}" y="${y + 4}" text-anchor="end">${prim.money ? fmtMoney(v, cur, true) : fmtNum(v)}</text>`;
  }
  let body = '';
  // days Amazon's report is missing (we show the last known values): orange band
  const heldBw = Math.max(6, Math.min(40, step * 0.9));
  body += pts.map((p, i) => (p.held ? `<rect class="heldband" x="${(X(i) - heldBw / 2).toFixed(1)}" y="${mt}" width="${heldBw.toFixed(1)}" height="${ph}" rx="2"/>` : '')).join('');
  for (const s of vis.filter((x) => x.bar)) {
    const bw = Math.max(1, Math.min(28, step * 0.7));
    body += pts.map((p, i) => `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Y(s, p[s.id]).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, mt + ph - Y(s, p[s.id])).toFixed(1)}" rx="2" fill="var(--s-${s.id})" opacity=".85"/>`).join('');
  }
  for (const s of vis.filter((x) => !x.bar)) {
    const xs = pts.map((_, i) => X(i)), ys = pts.map((p) => Y(s, p[s.id]));
    body += `<path d="${smoothPath(xs, ys)}" fill="none" stroke="var(--s-${s.id})" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const ticks = Math.min(7, n);
  let xl = '';
  for (let k = 0; k < ticks; k++) {
    const i = ticks === 1 ? 0 : Math.round(k * (n - 1) / (ticks - 1));
    xl += `<text class="axis" x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(fmtDate(pts[i].date, group))}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart of ${esc(vis.map((s) => s.label).join(', '))}">${g}${body}${xl}` +
    `<line class="cross" id="cross" y1="${mt}" y2="${mt + ph}" x1="0" x2="0" visibility="hidden"/><g id="hov"></g></svg>`;
}

// The last day's values sit under the date axis (not inside the graph), right-aligned under the last point.
function lastStrip(pts, vis, cur, group) {
  if (view.hideLast || !pts.length) return '';
  const lp = pts[pts.length - 1];
  const label = (group === 'week' ? 'Week of ' + fmtDate(lp.date) : fmtDate(lp.date, group)) + (lp.held ? ' (held)' : '');
  return `<div class="laststrip"><b class="ld">Current day performance:</b><b class="ldate">${esc(label)}</b>` +
    vis.map((s) => `<span><i style="background:var(--s-${s.id})"></i>${esc(s.label)} <b>${esc(fmtSeries(s, lp[s.id], cur))}</b></span>`).join('') +
    `<button class="lx" data-close="1" aria-label="Hide last day" title="Hide">✕</button></div>`;
}

function wireChart(pts, vis, cur, group) {
  const box = $('#chartbox'); if (!box || !pts.length) return;
  const capline = box.parentNode && box.parentNode.querySelector('.capline');
  if (capline) capline.addEventListener('click', (e) => { if (e.target.dataset && e.target.dataset.close) { view.hideLast = true; const g = capline.querySelector('.laststrip'); if (g) g.remove(); } });
  const svg = box.querySelector('svg'), cross = $('#cross'), tip = $('#tip'), hov = $('#hov');
  const { W, ml, step, X, Y } = chartGeom(pts, vis);
  box.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(pts.length - 1, Math.floor((x - ml) / step)));
    const cx = X(i);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    const p = pts[i];
    // markers only on the hovered point (the curve itself stays clean)
    if (hov) hov.innerHTML = vis.map((s) => `<circle cx="${cx.toFixed(1)}" cy="${Y(s, p[s.id]).toFixed(1)}" r="3.5" fill="var(--s-${s.id})" stroke="var(--panel)" stroke-width="1.5"/>`).join('');
    const label = group === 'week' ? `Week of ${fmtDate(p.date)}` : fmtDate(p.date, group);
    tip.innerHTML = `<div class="d">${esc(label)}${view.cumulative ? ' · cumulative' : ''}</div>` +
      vis.map((s) => `<div><span><i style="background:var(--s-${s.id})"></i> ${esc(s.label)}</span><b>${fmtSeries(s, p[s.id], cur)}</b></div>`).join('') +
      (p.held ? `<div class="hnote"><b>Held values</b>Amazon's report is currently missing ${group === 'day' ? 'this day' : 'a day in this period'}. These numbers are the last ones we saw, not confirmed by Amazon yet. They are replaced as soon as Amazon restores the data (usually within a day).</div>` : '');
    tip.hidden = false;
    const px = (cx / W) * r.width;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(r.width - tw, px + 12 > r.width - tw ? px - tw - 12 : px + 12)) + 'px';
    tip.style.top = '8px';
  });
  box.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); if (hov) hov.innerHTML = ''; tip.hidden = true; });
}

// ---- sections ------------------------------------------------------------------------------
const SOURCES = [
  ['earnings', 'Earnings'], ['bounty', 'Bounties'], ['bonus', 'Bonus'], ['connections', 'Creator Connections'], ['rewards', 'Creator Rewards']
];

function moneyInline(byCur, k) {
  const cs = Object.keys(byCur).filter((c) => byCur[c][k] !== 0);
  return cs.length ? cs.map((c) => fmtMoney(byCur[c][k], c)).join(' · ') : '—';
}

// Header card: fixed layout so nothing moves when the period, store or currency set changes.
// Left: the total in the main currency, other currencies on a single line below it.
// Right: one fixed column per income source (always all of them, empty ones dimmed), same structure in each.
// Amounts and shares are in the main currency; other currencies go on the small line (full list on hover).
// Creator Rewards tier of the most recent month on screen (needs the tier table that background.js now keeps in each rewards row).
function rewardsTier() {
  const rows = collect('rewards').filter((r) => r.tiers && r.tiers.length).sort((a, b) => (a.month < b.month ? 1 : -1));
  const r = rows[0]; if (!r) return null;
  const tiers = r.tiers, n = tiers.length;
  let idx = tiers.findIndex((t) => t.bonus === r.rewards);
  if (idx < 0) idx = tiers.reduce((best, t, i) => (t.revenue <= r.shipped ? i : best), -1);
  const next = tiers[idx + 1] || null, left = next ? Math.max(0, next.revenue - r.shipped) : 0;
  const [y, mo] = r.month.split('-').map(Number);
  const month = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mo - 1]} ${y}`;
  const text = `Tier ${idx + 1}/${n} · ${next ? `${fmtMoney(left, 'USD', true)} to next` : 'top tier'}`;
  const table = tiers.map((t, i) => `${i === idx ? '▶ ' : ''}${fmtMoney(t.revenue, 'USD')} shipped → ${fmtMoney(t.bonus, 'USD')}`).join('  ·  ');
  const title = `${month}: ${idx >= 0 ? `tier ${idx + 1} of ${n} reached (${fmtMoney(r.rewards, 'USD')} bonus)` : `first tier not reached yet`}. Shipped so far ${fmtMoney(r.shipped, 'USD')}.` +
    (next ? ` Next tier: ${fmtMoney(next.revenue, 'USD')} shipped for ${fmtMoney(next.bonus, 'USD')} (${fmtMoney(left, 'USD')} to go).` : ' You reached the top tier.') + `
Tiers: ${table}`;
  return { text, title };
}
function totalCardHTML(dayRows) {
  const byTag = tagMode();
  const { byCur } = sumByCurrency(dayRows, byTag ? [] : collect('income'), byTag ? [] : collect('rewards'));
  const curs = Object.keys(byCur).sort((a, b) => usdish(byCur[b].total, b) - usdish(byCur[a].total, a));
  const main = curs[0];
  const t = main ? byCur[main] : null;
  const amt = (id) => (t ? fmtMoney(t[id], main) : '—');
  const others = (id) => curs.slice(1).filter((c) => byCur[c][id]).map((c) => fmtMoney(byCur[c][id], c));
  const sub = (id) => { const o = others(id); return `<div class="sub" title="${esc(o.join(' · '))}">${o.length ? '+ ' + esc(o.join(' · ')) : ''}</div>`; };
  const bar = t && t.total > 0
    ? `<div class="stack">${SOURCES.map(([id]) => (t[id] > 0 ? `<span style="flex:${t[id]};background:var(--s-${id})"></span>` : '')).join('')}</div>`
    : '<div class="stack"></div>';
  const loc = byLocation(dayRows, byTag ? [] : collect('income'), byTag ? [] : collect('rewards'));
  const rt = isProNow() ? rewardsTier() : null;
  const tiles = SOURCES.map(([id, label]) => {
    const has = t && t[id] > 0;
    const share = has && t.total > 0 ? `<span class="pc">${Math.round(t[id] / t.total * 100)}%</span>` : '';
    return `<div class="tile${has ? '' : ' zero'}"${bdAttr(label, loc, bdMoney(id))}><div class="tl"><i style="background:var(--s-${id})"></i><span class="tn">${label}</span>${share}</div><b>${has ? amt(id) : '—'}</b>${id === 'rewards' && !byTag && rt ? `<div class="sub" title="${esc(rt.title)}">${esc(rt.text)}</div>` : sub(id)}</div>`;
  }).join('');
  const note = curs.length > 1 ? `Amounts and shares are in ${main}; other currencies are listed below each amount.` : '';
  return `<div class="totalcard">
    <div class="trow2">
      <div class="thead"${bdAttr('Total income', loc, bdMoney('total'))}><span class="l">Total income</span><b class="big">${amt('total')}</b>${sub('total')}</div>
      <div class="tiles">${tiles}</div>
    </div>
    ${bar}
  </div>`;
}

// ---- hover breakdown by country ---------------------------------------------------------------------
// Per-country totals (native currency) for the cards; shown in a floating tooltip on hover.
function byLocation(dayRows, incomeRows = [], rewardRows = []) {
  const out = {};
  for (const loc of selLocales()) {
    const r = sumByCurrency(dayRows.filter((x) => x.loc === loc), incomeRows.filter((x) => x.loc === loc), rewardRows.filter((x) => x.loc === loc));
    const t = Object.values(r.byCur)[0] || {};
    out[loc] = { ...r.all, ...t, cur: LOCALES[loc].cur };
  }
  return out;
}
// data-bd attribute: [{loc, text}] rows for one card (only when more than one country is shown)
function bdAttr(title, perLoc, fmt, note) {
  if (selLocales().length < 2) return '';
  const rows = Object.entries(perLoc).map(([loc, v]) => ({ loc, text: fmt(v), z: !fmt.raw(v) }));
  return ` data-bd="${esc(JSON.stringify({ t: title, rows, n: note || '' }))}"`;
}
const bdMoney = (id) => Object.assign((v) => (v[id] ? fmtMoney(v[id], v.cur) : '—'), { raw: (v) => v[id] });
const bdNum = (id) => Object.assign((v) => (v[id] ? fmtNum(v[id]) : '—'), { raw: (v) => v[id] });
const bdConv = Object.assign((v) => (v.clicks ? pct(v.ordered, v.clicks) : '—'), { raw: (v) => v.clicks });

// Pending shipments: an ESTIMATE of the commission still to come (not an Amazon figure).
// Amazon pays commission when an item ships, so ordered-but-not-shipped orders are income that has not landed yet.
// It is a "right now" number, so it ignores the period on screen (the background keeps the last 90 days of daily rows
// under the pseudo period "pending"); it still follows the store and country filters. Everything below covers those 90 days.
//   pending revenue = ordered revenue - shipped revenue       (real prices; used when it is positive and not above the ordered revenue)
//                     else pending items x average ordered price
//   pending items   = ordered items - shipped items
//   estimate        = pending revenue x your commission rate (earnings / shipped revenue)
// The rate is your blended rate over the categories you actually sell (the categories of the pending items are unknown).
// Without a usable rate it falls back to earnings per shipped item. Computed per currency.
const PENDING_DAYS = 90;
function pendingRows() {
  const out = []; let loaded = false;
  for (const loc of selLocales()) for (const a of activeAccounts()) {
    if (!(a.locales || []).includes(loc)) continue;
    const e = cache[`${a.id}|${loc}|pending|day`];
    if (!e) continue;
    loaded = true;
    for (const row of e.rows) out.push({ loc, acct: a.id, cur: LOCALES[loc].cur, ...row });
  }
  return { rows: out, loaded };
}
function pendingShipments(rows) {
  const acc = {};
  for (const r of rows) {
    const t = (acc[r.cur] ||= { ord: 0, shp: 0, ordRev: 0, rev: 0, earn: 0 });
    t.ord += r.ordered; t.shp += r.shipped; t.ordRev += r.orderedRevenue; t.rev += r.revenue; t.earn += r.earnings;
  }
  const out = {};
  for (const [c, t] of Object.entries(acc)) {
    const items = Math.max(0, Math.round(t.ord - t.shp));
    const gap = t.ordRev - t.rev;
    const rate = t.rev > 0 ? t.earn / t.rev : 0;
    const avgPrice = t.ord > 0 && t.ordRev > 0 ? t.ordRev / t.ord : 0;
    let est = 0, pendingRev = 0, method = 'gap';
    if (rate > 0) {
      if (gap > 0 && gap <= t.ordRev) pendingRev = gap;
      else if (items && avgPrice) { pendingRev = items * avgPrice; method = 'avg'; }
      est = pendingRev * rate;
    }
    if (!est && items && t.shp > 0 && t.earn > 0) { est = items * t.earn / t.shp; method = 'item'; }
    if (est > 0) out[c] = { items, pendingRev, rate, est, method };
  }
  return out;
}

function pendingStat() {
  const { rows, loaded } = pendingRows();
  const p = pendingShipments(rows);
  const curs = Object.keys(p).sort((a, b) => usdish(p[b].est, b) - usdish(p[a].est, a));
  const items = curs.reduce((s, c) => s + p[c].items, 0);
  const value = curs.length
    ? ('~' + fmtMoney(p[curs[0]].est, curs[0]) + (curs.length > 1 ? `<span class="muted xtra" title="${esc(curs.slice(1).map((c) => '~' + fmtMoney(p[c].est, c)).join(' · '))}">+${curs.length - 1}</span>` : '')) 
    : `<span class="muted">${loaded ? 'None pending' : '…'}</span>`;
  const help = 'This is only an estimate, not a figure fetched from Amazon. It is calculated from your recent activity: ordered revenue minus shipped revenue over the last ' + PENDING_DAYS + ' days, multiplied by your commission rate (earnings divided by shipped revenue). When that difference is not usable it values the pending items at your average ordered price instead. It does not depend on the selected period. Commission is only paid when an item ships, so cancelled or returned orders will lower the real amount.';
  const cnt = curs.length ? `<span class="cnt">${fmtNum(items)} item${items === 1 ? '' : 's'}</span>` : '';
  const perLoc = {};
  for (const l of selLocales()) { const q = pendingShipments(rows.filter((r) => r.loc === l)); const c = Object.keys(q)[0]; perLoc[l] = c ? { est: q[c].est, items: q[c].items, cur: c } : { est: 0, items: 0, cur: LOCALES[l].cur }; }
  const bdFmt = Object.assign((v) => (v.est ? `~${fmtMoney(v.est, v.cur)} · ${fmtNum(v.items)} item${v.items === 1 ? '' : 's'}` : '—'), { raw: (v) => v.est });
  return `<div class="stat" style="--c:var(--s-pending)"${bdAttr('Pending shipments', perLoc, bdFmt)}><i></i><span class="l">Pending shipments <span class="help" tabindex="0" data-tip="${esc(help)}">?</span></span><b>${value}</b>${cnt}</div>`;
}

// Returned items: how many came back and what they cost you.
// Amazon books a return as negative revenue/earnings on the day it happens (e.g. 1 returned, revenue -340.98, earnings -8.53).
// A day with returns whose earnings are negative is taken as Amazon reports it (exact). A day where shipments outweigh the
// returns hides the loss inside a positive total, so that part is estimated from your average shipped item (shown with "~").
function returnedStat(dayRows, loc) {
  const acc = {};
  for (const r of dayRows) {
    const t = (acc[r.cur] ||= { ret: 0, rev: 0, earn: 0, mixed: 0, pRev: 0, pEarn: 0, pShp: 0 });
    if (!r.returned) { t.pRev += r.revenue; t.pEarn += r.earnings; t.pShp += r.shipped; continue; }
    t.ret += r.returned;
    if (r.earnings < 0) { t.rev += r.revenue; t.earn += r.earnings; }
    else t.mixed += r.returned;
  }
  const out = {};
  for (const [c, t] of Object.entries(acc)) {
    if (!t.ret) continue;
    let rev = t.rev, earn = t.earn, approx = false;
    if (t.mixed) { approx = true; if (t.pShp > 0) { rev -= t.mixed * t.pRev / t.pShp; earn -= t.mixed * t.pEarn / t.pShp; } }
    out[c] = { ret: t.ret, rev, earn, approx };
  }
  const curs = Object.keys(out).sort((a, b) => usdish(out[a].earn, a) - usdish(out[b].earn, b));
  const items = curs.reduce((s, c) => s + out[c].ret, 0);
  const val = (c) => (out[c].approx ? '~' : '') + fmtMoney(out[c].earn, c);
  const value = curs.length ? val(curs[0]) + (curs.length > 1 ? `<span class="muted xtra" title="${esc(curs.slice(1).map(val).join(' · '))}">+${curs.length - 1}</span>` : '') : '<span class="muted">None</span>';
  const sales = curs.map((c) => fmtMoney(out[c].rev, c)).join(' · ');
  const help = curs.length
    ? `Commission lost on returned items, taken from Amazon's report, where a return appears as negative earnings on the day it happens. Sales value of those returns: ${sales}.` + (curs.some((c) => out[c].approx) ? ' A "~" means some returns happened on days with more shipments than returns, so Amazon hides them in a positive total and that part is estimated from your average shipped item.' : '')
    : 'No returned items in the selected period.';
  const cnt = items ? `<span class="cnt">${fmtNum(items)} item${items === 1 ? '' : 's'}</span>` : '';
  return `<div class="stat" style="--c:var(--s-returned)"${bdAttr('Returned items', loc, bdNum('returned'))}><i></i><span class="l">Returned items <span class="help" tabindex="0" data-tip="${esc(help)}">?</span></span><b>${value}</b>${cnt}</div>`;
}

function kpiHTML(dayRows) {
  const { all } = sumByCurrency(dayRows);
  const loc = byLocation(dayRows);
  const stat = (label, value, id, cnt, fmt) => `<div class="stat"${id ? ` style="--c:var(--s-${id})"` : ''}${bdAttr(label, loc, fmt || (id === 'conversion' ? bdConv : bdNum(id === 'returned' ? 'returned' : id)))}>${id ? '<i></i>' : ''}<span class="l">${label}</span><b>${value}</b>${cnt ? `<span class="cnt">${cnt}</span>` : ''}</div>`;
  return `<section class="stats">
      ${stat('Clicks', fmtNum(all.clicks), 'clicks')}${stat('Ordered', fmtNum(all.ordered), 'ordered')}${stat('Shipped', fmtNum(all.shipped), 'shipped')}
      ${stat('Conversion', pct(all.ordered, all.clicks), 'conversion')}${tagMode() ? statOff('Pending shipments', 'pending') + statOff('Returned items', 'returned') : pendingStat() + returnedStat(dayRows, loc)}
    </section>`;
}

function chartHTML(dayRows) {
  const cur = primaryCurrency(dayRows);
  const { pts, group, totals, auto } = buildPoints(dayRows, cur);
  const vis = chartSeries();
  const multiCur = new Set(dayRows.map((r) => r.cur)).size > 1;
  const legend = vis.map((s) => `<span class="leg"><i style="background:var(--s-${s.id})"></i>${s.label} <b>${fmtSeries(s, totals[s.id], cur)}</b></span>`).join('');
  const caption = chartIsTag()
    ? `Daily clicks of the selected tags (exact, from Amazon). Amazon does not report earnings or orders per day for a tag: those are only period totals, shown in the cards.`
    : vis.length
      ? `${esc(vis[0].label)}${vis[0].money ? ` (${cur})` : ''}. Other series are scaled to their own peak so shapes stay readable; hover for exact values.`
      : '';
  return `<section class="panel">
    <div class="panelhead">
      <div class="legend">${legend || '<span class="muted small">No metric selected: use the Metrics menu.</span>'}</div>
      <div class="opts">
        <label><input type="checkbox" id="cum" ${view.cumulative ? 'checked' : ''}> Cumulative</label>
        <select id="grp" aria-label="Group by">${['day', 'week', 'month'].map((g) => `<option value="${g}" ${g === group ? 'selected' : ''}>${g[0].toUpperCase() + g.slice(1)}${g === auto && !view.group ? ' (auto)' : ''}</option>`).join('')}</select>
      </div>
    </div>
    ${vis.length ? `<div id="chartbox" class="chartbox">${chartSVG(pts, vis, cur, group)}<div id="tip" class="tip" hidden></div></div><div class="capline">${lastStrip(pts, vis, cur, group)}<p class="caption muted small">${caption}</p></div>`
      : '<p class="muted" style="padding:32px;text-align:center">Select at least one metric in the Metrics menu.</p>'}
  </section>`;
}

// Multi-select dropdown (checkboxes): which countries are shown (same look as the Metrics menu).
function locsDropdownHTML() {
  const all = enabledCountries(), sel = selLocales(), ok = new Set(allowedLocales());
  const items = all.map((c) => `<div class="mi${ok.has(c) ? '' : ' scoff'}"${ok.has(c) ? '' : ' title="The store you chose does not sell here"'}><input type="checkbox" data-loc="${c}" aria-label="Add or remove ${esc(LOCALES[c].label)}" ${sel.includes(c) ? 'checked' : ''} ${ok.has(c) ? '' : 'disabled'}><button type="button" class="lonly" data-only="${c}" ${ok.has(c) ? '' : 'disabled'} title="Show only ${esc(LOCALES[c].label)}">${flagSVG(c)}<span>${esc(LOCALES[c].label)}</span></button><b class="muted">${LOCALES[c].cur}</b></div>`).join('');
  const menu = view.locOpen
    ? `<div class="menu menuright" role="group" aria-label="Countries"><div class="mi allrow"><input type="checkbox" data-lallbox="1" aria-label="Select or clear all countries" ${sel.length === all.length ? 'checked' : ''}><button type="button" class="lonly" data-all="1" title="Show all countries"><span><b>All countries</b></span></button><b class="muted">${sel.length}/${all.length}</b></div><div class="msep"></div>${items}</div>`
    : '';
  const flags = sel.length === all.length ? 'All countries' : sel.length === 1 ? LOCALES[sel[0]].label : `${sel.length} countries`;
  const shown = sel.length <= 5 ? sel.map((c) => flagSVG(c)).join('') : '';
  return `<div class="dd"><button type="button" class="ddsum" data-dd="locs" aria-haspopup="true" aria-expanded="${view.locOpen}"><span class="dots flags">${shown}</span>${esc(flags)} ${CHEVRON}</button>${menu}</div>`;
}


// ---- Tag filter: numbers for the chosen tags ----------------------------------------------------------
// Amazon reports sales per tag only as period totals (its daily numbers are not split by tag), so with a tag filter the cards,
// the total income and the countries table use the tracking-ID table; the chart and the Dates tab keep showing every tag.
function tagAgg() {
  if (!view.tags) return null;
  const out = []; let seen = false;
  const end = curRange()[1];
  for (const loc of selLocales()) for (const a of activeAccounts()) {
    if (!(a.locales || []).includes(loc)) continue;
    const e = entry(a.id, loc, 'tag'); if (!e) continue;
    seen = true;
    const t = { name: end, clicks: 0, ordered: 0, shipped: 0, returned: 0, orderedRevenue: 0, revenue: 0, earnings: 0, bounty: 0, bonus: 0, loc, acct: a.id, cur: LOCALES[loc].cur };
    for (const r of e.rows) if (view.tags.has(r.name)) for (const f of FIELDS) t[f] += r[f] || 0;
    out.push(t);
  }
  return seen ? out : null;          // null = tracking IDs not loaded yet: show everything meanwhile
}
const tagMode = () => !!view.tags && tagAgg() !== null;
// Daily clicks of the selected tags (exact, from Amazon). "Other" = the day's total clicks minus the clicks of every named tag.
function tagDayRows() {
  if (!view.tags) return null;
  const out = new Map(); let seen = false;
  const add = (a, loc, day, clicks) => {
    if (!clicks) return;
    const k = `${a.id}|${loc}|${day}`;
    const o = out.get(k) || { name: day, clicks: 0, ordered: 0, shipped: 0, returned: 0, orderedRevenue: 0, revenue: 0, earnings: 0, bounty: 0, bonus: 0, loc, acct: a.id, cur: LOCALES[loc].cur };
    o.clicks += clicks; out.set(k, o);
  };
  for (const loc of selLocales()) for (const a of activeAccounts()) {
    if (!(a.locales || []).includes(loc)) continue;
    const e = entry(a.id, loc, 'tagday'); if (!e) continue;
    seen = true;
    const named = new Map();
    for (const r of e.rows) { named.set(r.name, (named.get(r.name) || 0) + r.clicks); if (view.tags.has(r.tag)) add(a, loc, r.name, r.clicks); }
    if (view.tags.has('Other')) { const d = entry(a.id, loc, 'day'); if (d) for (const r of d.rows) add(a, loc, r.name, Math.max(0, (r.clicks || 0) - (named.get(r.name) || 0))); }
  }
  return seen ? [...out.values()].sort((x, y) => (x.name < y.name ? -1 : 1)) : null;
}
const chartRows = () => (view.tags ? (tagDayRows() || collect('day')) : collect('day'));
const chartIsTag = () => !!view.tags && tagDayRows() !== null;
const chartSeries = () => (chartIsTag() ? SERIES.filter((x) => x.id === 'clicks') : SERIES.filter((x) => view.metrics.has(x.id)));
const statOff = (label, id) => `<div class="stat" style="--c:var(--s-${id})"><i></i><span class="l">${label}</span><b><span class="muted">—</span></b></div>`;

// ---- Store filter (under the logo) and Tags filter (after Countries) ---------------------------------
const accountLabel = (a) => { const hit = Object.entries(SEPARATE_SITES).find(([, u]) => u === a.base); return hit ? `${LOCALES[hit[0]].label} account` : 'US account'; };
// the stores that actually have something in the countries on screen (the first one is the "main store")
const shownStores = () => { const cur = new Set(selLocales()); const l = activeAccounts().filter((a) => (a.locales || []).some((x) => cur.has(x))); return l.length ? l : activeAccounts(); };
function storeTotals() {
  const out = {};
  for (const a of accounts) for (const loc of a.locales || []) {
    if (!enabledCountries().includes(loc)) continue;
    const e = entry(a.id, loc, 'day'); if (!e) continue;
    const o = (out[a.id] ||= { clicks: 0, earn: {} });
    for (const r of e.rows) { o.clicks += r.clicks || 0; o.earn[LOCALES[loc].cur] = (o.earn[LOCALES[loc].cur] || 0) + (r.earnings || 0); }
  }
  return out;
}
const amountText = (o) => { if (!o) return '—'; const c = Object.keys(o.earn).find((k) => o.earn[k]); return c ? fmtMoney(o.earn[c], c) : fmtMoney(0, Object.keys(o.earn)[0] || 'USD'); };
function storeFilterHTML() {
  if (!accounts.length) return '';
  const shown = shownStores(), main = shown[0] || accounts[0], others = shown.length - 1;
  const tot = storeTotals();
  const sel = new Set(view.stores ? [...view.stores] : accounts.map((a) => a.id));
  const rows = accounts.map((a) => `<div class="mi"><input type="checkbox" data-storebox="${esc(a.id)}" aria-label="Add or remove ${esc(a.id)}" ${sel.has(a.id) ? 'checked' : ''}><button type="button" class="lonly" data-store-pick="${esc(a.id)}" title="Show only ${esc(a.id)}"><span class="scrow"><b>${esc(a.id)}</b><small>${esc(accountLabel(a))} · ${(a.locales || []).map((l) => LOCALES[l].short).join(' ')}</small></span></button><b class="muted small">${esc(amountText(tot[a.id]))}</b></div>`).join('');
  const menu = view.storeOpen
    ? `<div class="menu storemenu" role="group" aria-label="Stores"><div class="mi allrow"><input type="checkbox" data-storeall="1" aria-label="Select or clear all stores" ${sel.size === accounts.length ? 'checked' : ''}><button type="button" class="lonly" data-store-pick="" title="Show all stores"><span class="scrow"><b>All stores</b><small>${accounts.length} stores</small></span></button><b class="muted">${sel.size}/${accounts.length}</b></div><div class="msep"></div>${rows}<p class="muted small" style="margin:8px 8px 4px">Click a name to see only that store · tick boxes to combine.</p></div>`
    : '';
  return `<div class="dd"><button type="button" class="ddsum storebtn" data-dd="store" aria-haspopup="listbox" aria-expanded="${view.storeOpen}" title="The store you are looking at (click to change)"><span class="sline"><span class="sl">STORE</span><b>${esc(main.id)}</b>${others > 0 ? `<span class="more" title="${others} other store${others > 1 ? 's' : ''}">+${others}</span>` : ''}</span>${CHEVRON}</button>${menu}</div>`;
}
function tagList() {
  const m = new Map();
  for (const r of collect('tag', true)) { const o = m.get(r.name) || { name: r.name, clicks: 0, earn: {} }; o.clicks += r.clicks || 0; o.earn[r.cur] = (o.earn[r.cur] || 0) + (r.earnings || 0); m.set(r.name, o); }
  const e = (o) => Object.values(o.earn).reduce((a, b) => a + b, 0);
  return [...m.values()].sort((a, b) => e(b) - e(a) || b.clicks - a.clicks);
}
function tagsDropdownHTML() {
  if (!isProNow()) return `<div class="dd"><button type="button" class="ddsum locked" data-lock="tags" title="Tag filters are included in Pro"><span class="muted small">TAGS</span> All tags ${LOCK}</button></div>`;
  const list = tagList();
  const label = !view.tags ? 'All tags' : view.tags.size === 0 ? 'No tags' : view.tags.size === 1 ? [...view.tags][0] : `${view.tags.size} tags`;
  const total = list.length;
  const items = list.map((t) => `<div class="mi"><input type="checkbox" data-tagbox="${esc(t.name)}" aria-label="Add or remove ${esc(t.name)}" ${!view.tags || view.tags.has(t.name) ? 'checked' : ''}><button type="button" class="lonly" data-tagonly="${esc(t.name)}" title="Show only ${esc(t.name)}"><span>${esc(t.name)}</span></button><b class="muted small">${fmtNum(t.clicks)} clicks</b></div>`).join('');
  const body = list.length ? items : `<p class="muted small" style="padding:8px">${isLoading() ? 'Loading tracking IDs…' : 'No tracking IDs for this period.'}</p>`;
  const menu = view.tagOpen
    ? `<div class="menu menuright tagmenu" role="group" aria-label="Tags"><div class="mi allrow"><input type="checkbox" data-tagall="1" aria-label="All tags" ${!view.tags ? 'checked' : ''}><button type="button" class="lonly" data-tagallbtn="1"><span>All tags</span></button></div>${body}<p class="muted small" style="margin:8px 8px 4px">Filters the <b>cards, total income, countries table and Tracking IDs</b>.</p></div>`
    : '';
  const help = (view.tags ? `Tag filter on: ${view.tags.size} of ${total} tags. ` : 'Tags filter. ') + 'The cards, total income and countries table show only the selected tags. The chart shows their daily clicks. Amazon does not report earnings or orders per day for a tag, so the Dates tab shows all tags.';
  return `<div class="dd"><button type="button" class="ddsum ${view.tags ? 'active' : ''}" data-dd="tags" aria-haspopup="true" aria-expanded="${view.tagOpen}" title="Filters the cards, total income, countries table and Tracking IDs"><span class="muted small">TAGS</span> ${esc(label)} ${CHEVRON}</button>${menu}</div><span class="help taghelp ${view.tags ? 'pulse' : ''}" tabindex="0" data-tip="${esc(help)}">?</span>`;
}

// Multi-select dropdown (checkboxes) next to the period select: which series the chart shows.
function metricsDropdownHTML(totals, cur) {
  const sel = SERIES.filter((s) => view.metrics.has(s.id));
  const dots = sel.slice(0, 6).map((s) => `<i style="background:var(--s-${s.id})"></i>`).join('');
  const items = SERIES.map((s) => `<label class="mi"><input type="checkbox" data-metric="${s.id}" ${view.metrics.has(s.id) ? 'checked' : ''}><i class="sw" style="background:var(--s-${s.id})"></i><span>${s.label}</span><b>${fmtSeries(s, totals[s.id], cur)}</b></label>`).join('');
  const menu = view.ddOpen
    ? `<div class="menu" role="group" aria-label="Chart metrics"><div class="mhead"><span class="muted small">Show on chart</span><span><button type="button" class="linkbtn" data-mall="all">All</button><button type="button" class="linkbtn" data-mall="none">None</button></span></div>${items}</div>`
    : '';
  return `<div class="dd"><button type="button" class="ddsum" data-dd="metrics" aria-haspopup="true" aria-expanded="${view.ddOpen}"><span class="dots">${dots}</span>Metrics <span class="muted">${sel.length}</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>${menu}</div>`;
}

function mergeRows(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const t = m.get(k) || { ...zero(), name: r.name, asin: r.asin, loc: r.loc, cur: r.cur };
    for (const f of FIELDS) t[f] += r[f];
    m.set(k, t);
  }
  return [...m.values()].sort((a, b) => b.earnings - a.earnings || b.orderedRevenue - a.orderedRevenue || b.clicks - a.clicks);
}

function tableHTML(dayRows, cardRows) {
  const sub = currentSub();
  const byTag = tagMode();
  const incomeAll = byTag ? [] : collect('income');
  const rewardsAll = byTag ? [] : collect('rewards');
  const tabs = `<div class="subtabs">${subOptions().map(([id, l]) => (tabOk(id) ? `<button type="button" data-sub="${id}" class="${id === sub ? 'on' : ''}">${l}</button>` : `<button type="button" data-lock="tabs" class="locked" title="Included in Pro">${l} ${LOCK}</button>`)).join('')}</div>`;
  const empty = (msg) => `<p class="muted" style="padding:16px 0">${msg}</p>`;
  const wait = isLoading() ? 'Loading…' : 'No data for this period.';
  let body = '';

  if (sub === 'countries') {
    const rows = selLocales().map((loc) => {
      const r = sumByCurrency((cardRows || dayRows).filter((x) => x.loc === loc), incomeAll.filter((x) => x.loc === loc), rewardsAll.filter((x) => x.loc === loc));
      const t = Object.values(r.byCur)[0] || { orderedRevenue: 0, earnings: 0, bounty: 0, bonus: 0, connections: 0, rewards: 0, total: 0 };
      return { loc, cur: LOCALES[loc].cur, ...r.all, ...t };
    });
    body = `<div class="tablewrap"><table><thead><tr><th>Country</th><th class="n">Clicks</th><th class="n">Ordered</th><th class="n">Shipped</th><th class="n">Conv.</th><th class="n">Ordered revenue</th><th class="n">Earnings</th><th class="n">Bounties</th><th class="n">Bonus</th><th class="n">Creator Conn.</th><th class="n">Creator Rewards</th><th class="n">Total income</th></tr></thead><tbody>` +
      rows.map((r) => `<tr class="click" data-goto="${r.loc}"><td><span class="cn">${flagSVG(r.loc)}${esc(LOCALES[r.loc].label)}</span></td>${cell(r.clicks, fmtNum(r.clicks))}${cell(r.ordered, fmtNum(r.ordered))}${cell(r.shipped, fmtNum(r.shipped))}<td class="n">${pct(r.ordered, r.clicks)}</td>${cell(r.orderedRevenue, fmtMoney(r.orderedRevenue, r.cur))}${cell(r.earnings, fmtMoney(r.earnings, r.cur))}${cell(r.bounty, fmtMoney(r.bounty, r.cur))}${cell(r.bonus, fmtMoney(r.bonus, r.cur))}${cell(r.connections, fmtMoney(r.connections, r.cur))}${cell(r.rewards, fmtMoney(r.rewards, r.cur))}${cell(r.total, `<b>${fmtMoney(r.total, r.cur)}</b>`)}</tr>`).join('') +
      '</tbody></table></div>';
    if (!dayRows.length) body = empty(wait);
  } else if (sub === 'dates') {
    // Like Amazon's own report: one row per day (per country when several are shown), newest first, quiet days left out.
    const m = new Map();
    for (const r of dayRows) {
      const k = r.name + '|' + (multi() ? r.loc : r.cur);
      const t = m.get(k) || { date: r.name, loc: r.loc, cur: r.cur, clicks: 0, ordered: 0, shipped: 0, returned: 0, orderedRevenue: 0, revenue: 0, earnings: 0, bounty: 0, bonus: 0, held: false };
      if (r.held) t.held = true;
      for (const f of ['clicks', 'ordered', 'shipped', 'returned', 'orderedRevenue', 'revenue', 'earnings', 'bounty', 'bonus']) t[f] += r[f] || 0;
      m.set(k, t);
    }
    const rows = [...m.values()].filter((t) => t.clicks || t.ordered || t.shipped || t.returned || t.orderedRevenue || t.revenue || t.earnings || t.bounty || t.bonus)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.loc < b.loc ? -1 : 1));
    body = `<div class="tablewrap"><table><thead><tr><th>Date</th>${multi() ? '<th>Country</th>' : ''}<th class="n">Clicks</th><th class="n">Ordered</th><th class="n">Conv.</th><th class="n">Ordered revenue</th><th class="n">Shipped</th><th class="n">Returned</th><th class="n">Revenue</th><th class="n">Earnings</th><th class="n">Bounties</th></tr></thead><tbody>` +
      rows.slice(0, 500).map((r) => `<tr${r.held ? ' class="held"' : ''}><td>${esc(r.date)}${r.held ? ' <span class="hbadge" title="Amazon&#39;s report is currently missing this day. These are the last values we saw, not confirmed by Amazon yet.">held</span>' : ''}</td>${multi() ? `<td><span class="cn">${flagSVG(r.loc)}${esc(LOCALES[r.loc].short)}</span></td>` : ''}${cell(r.clicks, fmtNum(r.clicks))}${cell(r.ordered, fmtNum(r.ordered))}<td class="n">${pct(r.ordered, r.clicks)}</td>${cell(r.orderedRevenue, fmtMoney(r.orderedRevenue, r.cur))}${cell(r.shipped, fmtNum(r.shipped))}${cell(r.returned, fmtNum(r.returned))}${cell(r.revenue, fmtMoney(r.revenue, r.cur))}${cell(r.earnings, fmtMoney(r.earnings, r.cur))}${cell(r.bounty, fmtMoney(r.bounty, r.cur))}</tr>`).join('') + '</tbody></table></div>';
    body = rows.length ? body : empty(wait);
    if (tagMode()) body = '<p class="muted small" style="margin:0 0 8px">Amazon does not report daily sales per tag, so this table shows all tags.</p>' + body;
  } else {
    if (!haveData(sub)) return tabs + empty(wait);
    const raw = collect(sub);
    if (sub === 'tag') {
      const rows = mergeRows(raw, (r) => r.name + '|' + (multi() ? r.loc : ''));
      body = `<div class="tablewrap"><table><thead><tr><th>Tracking ID</th>${multi() ? '<th>Country</th>' : ''}<th class="n">Clicks</th><th class="n">Ordered</th><th class="n">Shipped</th><th class="n">Conv.</th><th class="n">Ordered revenue</th><th class="n">Earnings</th></tr></thead><tbody>` +
        rows.slice(0, 100).map((r) => `<tr><td>${esc(r.name)}</td>${multi() ? `<td><span class="cn">${flagSVG(r.loc)}${esc(LOCALES[r.loc].short)}</span></td>` : ''}${cell(r.clicks, fmtNum(r.clicks))}${cell(r.ordered, fmtNum(r.ordered))}${cell(r.shipped, fmtNum(r.shipped))}<td class="n">${pct(r.ordered, r.clicks)}</td>${cell(r.orderedRevenue, fmtMoney(r.orderedRevenue, r.cur))}${cell(r.earnings, fmtMoney(r.earnings, r.cur))}</tr>`).join('') + '</tbody></table></div>';
      if (!rows.length) body = empty(view.tags ? 'No activity for the tags you selected.' : 'No tracking-ID activity for this period.');
      if (view.tags) body = `<p class="muted small" style="margin:0 0 8px">Tag filter: ${view.tags.size} of ${new Set(collect('tag', true).map((r) => r.name)).size} tags · <button type="button" class="linkbtn" data-tagallbtn="1">show all</button></p>` + body;
    } else if (sub === 'cat') {
      const rows = mergeRows(raw, (r) => r.name + '|' + r.cur);
      body = `<div class="tablewrap"><table><thead><tr><th>Category</th><th class="n">Ordered</th><th class="n">Shipped</th><th class="n">Returned</th><th class="n">Ordered revenue</th><th class="n">Earnings</th></tr></thead><tbody>` +
        rows.map((r) => `<tr><td>${esc(r.name)}</td>${cell(r.ordered, fmtNum(r.ordered))}${cell(r.shipped, fmtNum(r.shipped))}${cell(r.returned, fmtNum(r.returned))}${cell(r.orderedRevenue, fmtMoney(r.orderedRevenue, r.cur))}${cell(r.earnings, fmtMoney(r.earnings, r.cur))}</tr>`).join('') + '</tbody></table></div>';
      if (!rows.length) body = empty('No category data for this period.');
    } else {
      const rows = mergeRows(raw, (r) => (r.asin || r.name) + '|' + r.cur).slice(0, 50);
      body = `<div class="tablewrap"><table><thead><tr><th>Product</th><th class="n">Clicks</th><th class="n">Ordered</th><th class="n">Shipped</th><th class="n">Ordered revenue</th><th class="n">Earnings</th></tr></thead><tbody>` +
        rows.map((r) => {
          const link = r.asin ? `<a href="https://www.amazon.${LOCALES[r.loc].tld}/dp/${esc(r.asin)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name);
          return `<tr><td class="wrap">${link}</td>${cell(r.clicks, fmtNum(r.clicks))}${cell(r.ordered, fmtNum(r.ordered))}${cell(r.shipped, fmtNum(r.shipped))}${cell(r.orderedRevenue, fmtMoney(r.orderedRevenue, r.cur))}${cell(r.earnings, fmtMoney(r.earnings, r.cur))}</tr>`;
        }).join('') + '</tbody></table></div>';
      if (!rows.length) body = empty('No product data for this period.');
    }
  }
  return `<section class="panel">${tabs}${body}</section>`;
}

// ---- screens -------------------------------------------------------------------------------
function signedOutHTML() {
  return `<section class="panel state">
    <h2>You're not signed in to Amazon Associates</h2>
    <p class="muted">Affilyatics reads your reports through your normal Chrome session. Sign in to Associates, then retry.</p>
    <div class="row"><button type="button" id="open" class="primary">Open Amazon Associates</button><button type="button" id="retry">Retry</button></div>
  </section>`;
}

// ---- Settings: countries and stores as cards with live figures ----------------------------------------
const periodLabel = () => (view.period === 'custom' ? 'custom range' : ((PERIODS.find((p) => p.id === view.period) || {}).label || 'this month').toLowerCase());
function countryTotals() {
  const out = {};
  for (const a of accounts) for (const loc of a.locales || []) {
    const e = entry(a.id, loc, 'day'); if (!e) continue;
    const o = (out[loc] ||= { clicks: 0, earn: {} });
    for (const r of e.rows) { o.clicks += r.clicks || 0; o.earn[LOCALES[loc].cur] = (o.earn[LOCALES[loc].cur] || 0) + (r.earnings || 0); }
  }
  return out;
}
function countriesSettingsHTML() {
  const on = (c) => settings.countries.includes(c);
  const tot = countryTotals();
  const sold = new Set(accounts.flatMap((a) => a.locales || []));
  const mine = Object.keys(LOCALES).filter((c) => sold.has(c)), other = Object.keys(LOCALES).filter((c) => !sold.has(c));
  const card = (c) => {
    const m = LOCALES[c], stores = accounts.filter((a) => (a.locales || []).includes(c)).length, t = tot[c];
    const stat = t ? `<b>${esc(amountText(t))}</b><small>${fmtNum(t.clicks)} clicks</small>` : '<small>no data yet</small>';
    if (!isProNow() && SEPARATE_SITES[c]) return `<label class="ccard locked" data-lock="sites" title="Countries on a separate Associates site are included in Pro"><span class="cflag">${flagSVG(c)}</span><span class="cbody"><b>${esc(m.label)}</b><small>${m.cur} · separate Associates site</small></span><span class="cstat">${PRO_PILL}</span></label>`;
    return `<label class="ccard ${on(c) ? 'on' : ''}"><input type="checkbox" data-country="${c}" ${on(c) ? 'checked' : ''} aria-label="Show ${esc(m.label)}"><span class="cflag">${flagSVG(c)}</span><span class="cbody"><b>${esc(m.label)}</b><small>${m.cur}${stores ? ` · ${stores} store${stores > 1 ? 's' : ''}` : ''}</small></span><span class="cstat">${stat}</span><span class="switch" aria-hidden="true"></span></label>`;
  };
  return `<p class="muted small" style="margin:0 0 10px">Choose the countries the dashboard shows. Figures are for <b>${esc(periodLabel())}</b>.</p>
    <div class="cquick"><button type="button" class="linkbtn" data-cq="mine">Where my stores sell</button><button type="button" class="linkbtn" data-cq="active">Only with activity</button><button type="button" class="linkbtn" data-cq="all">All</button></div>
    ${mine.length ? `<div class="cgroup">WHERE YOUR STORES SELL</div><div class="cgrid">${mine.map(card).join('')}</div>` : ''}
    <div class="cgroup">OTHER AMAZON COUNTRIES <span class="muted small">(none of your stores sells here yet)</span></div><div class="cgrid">${other.map(card).join('')}</div>`;
}
function storesSettingsHTML() {
  if (!accounts.length) return '<p class="muted">Stores appear here after the first successful load (you must be signed in).</p>';
  const accOn = (id) => !settings.accounts || settings.accounts.includes(id);
  const tot = storeTotals(), per = periodLabel();
  const cards = accounts.map((a, i) => {
    const on = accOn(a.id);
    let host = ''; try { host = new URL(a.base).host; } catch (_) {}
    const err = Object.values(status.siteErrors || {}).find((e) => a.base && e.url === a.base);
    let lu = ''; for (const l of a.locales || []) { const e = entry(a.id, l, 'day'); if (e && e.lu) { lu = `${LOCALES[l].short} ${e.lu}`; break; } }
    const t = tot[a.id];
    return `<label class="scard ${on ? 'on' : 'off'}"><input type="checkbox" data-account="${esc(a.id)}" ${on ? 'checked' : ''} aria-label="Include ${esc(a.id)}">
      <span class="sbody"><span class="srow1"><b>${esc(a.id)}</b>${i === 0 ? '<span class="badge amz">main</span>' : ''}${err ? '<span class="badge warn">not signed in</span>' : ''}${on ? '' : '<span class="badge">left out</span>'}</span>
        <span class="small muted">${esc(accountLabel(a))}${host ? ` · ${esc(host)}` : ''}</span>
        <span class="sflags">${(a.locales || []).map((l) => `<span class="cchip">${flagSVG(l)}${esc(LOCALES[l].short)}</span>`).join('')}</span>
        <span class="sstats">${t ? `<b>${esc(amountText(t))}</b> earned · ${fmtNum(t.clicks)} clicks <em>${esc(per)}</em>` : '<span class="muted">no figures loaded yet</span>'}</span>
        ${lu ? `<span class="small muted">Amazon data updated ${esc(lu)}</span>` : ''}</span></label>`;
  }).join('');
  return `<p class="muted small" style="margin:0 0 10px">Untick a store to leave it out of every number, chart and alert. The <b>main</b> store is the first one Amazon lists.</p><div class="sgrid">${cards}</div>`;
}
// ---- sign-in gate: an account (e-mail or Google) is required, Free included ---------------------------------------------
// The "Sign in" button makes the worker open our sign-in web page; this screen then polls (every 2 s) until the page confirms.
function gateHTML() {
  const p = license.pending && Date.now() - license.pending.at < 10 * 60000 ? license.pending : null;
  const err = license.lastError && !p ? planMessage(license.lastError) : '';
  const busy = view.planBusy ? 'disabled' : '';
  const msg = view.gateMsg ? `<p class="small" style="color:var(--bad)">${esc(view.gateMsg)}</p>` : err ? `<p class="small" style="color:var(--bad)">${esc(err)}</p>` : view.gateInfo ? `<p class="small" style="color:var(--good)">${esc(view.gateInfo)}</p>` : '';
  const legal = `<p class="muted small">By signing in you accept the <a href="${esc(PLAN_CFG.privacyUrl.replace('privacy/', 'terms/'))}" target="_blank" rel="noopener">Terms</a> and the <a href="${esc(PLAN_CFG.privacyUrl)}" target="_blank" rel="noopener">Privacy policy</a>.</p>`;
  const head = `<h2>Sign in to use Affilyatics</h2><p class="muted">Create a free account with your e-mail or Google. It lets you start the 14-day Pro trial, keeps your plan on every computer and protects against abuse. <b>Your Amazon data never leaves your browser.</b></p>`;
  if (p) {     // fallback: sign-in on the website, waiting for it
    return `<section class="panel state gate">${head}${msg}<p>Finish in the tab that just opened. It shows the code <b class="gcode">${esc(p.code || '')}</b>: it must match.</p><div class="row"><button type="button" id="signinagain">Open the page again</button><button type="button" id="signincancel">Cancel</button></div><p class="muted small">Waiting for you to finish…</p></section>`;
  }
  if (view.verify) {
    return `<section class="panel state gate"><h2>Confirm your e-mail</h2>${msg}<p>We sent a link to <b>${esc(view.verify.email)}</b>. Open it to confirm your address (check the spam folder too), then press the button below.</p><div class="row"><button type="button" id="gverified" class="primary" ${busy}>I have verified my e-mail</button><button type="button" id="gresend" ${busy}>Send the e-mail again</button><button type="button" id="gother" class="linkbtn">Use another account</button></div></section>`;
  }
  const up = view.gmode === 'up', d = view.draft || {};
  return `<section class="panel state gate">${head}${msg}
    <button type="button" id="ggoogle" class="gbtn" ${busy}><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> Continue with Google</button>
    <div class="or"><span>or with your e-mail</span></div>
    <div class="gtabs" role="tablist"><button type="button" id="gtab-in" class="${up ? '' : 'on'}">Sign in</button><button type="button" id="gtab-up" class="${up ? 'on' : ''}">Create account</button></div>
    <div class="gform"><label>E-mail<input id="gmail" type="email" autocomplete="email" value="${esc(d.email || '')}" ${busy}></label>
    <label>Password<input id="gpass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? 'At least 8 characters' : ''}" value="${esc(d.password || '')}" ${busy}></label>
    <button type="button" id="gsubmit" class="primary" ${busy}>${up ? 'Create my free account' : 'Sign in'}</button>
    ${up ? '' : '<button type="button" id="gforgot" class="linkbtn">Forgot your password?</button>'}</div>
    ${legal}
    <p class="muted small"><button type="button" id="signin" class="linkbtn">Trouble signing in? Use the website instead</button></p></section>`;
}
// Footer of the sign-in screen (the dashboard itself has none).
const listenerClick = (el) => { if (el && el.click) el.click(); };
function footerHTML() {
  const home = PLAN_CFG.privacyUrl.replace('privacy/', ''), terms = home + 'terms/';
  let ver = ''; try { ver = chrome.runtime.getManifest().version; } catch (_) { /* not available in tests */ }
  const a = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`;
  return `<div class="fwrap">
    <nav class="flinks" aria-label="Footer">${a(home, 'Website')}${a(terms, 'Terms')}${a(PLAN_CFG.privacyUrl, 'Privacy policy')}<a href="mailto:${esc(PLAN_CFG.contactEmail)}">Contact</a></nav>
    <p class="fsmall">Your Amazon data stays in your browser. Affilyatics is an independent product, not affiliated with, endorsed by or sponsored by Amazon. Amazon and Amazon Associates are trademarks of Amazon.com, Inc. or its affiliates.</p>
    <p class="fsmall">© ${new Date().getFullYear()} EBLYN${ver ? ` · Version ${esc(ver)}` : ''}</p>
  </div>`;
}
document.addEventListener('input', (e) => { const t = e.target; if (t && t.id === 'gmail') view.draft.email = t.value; else if (t && t.id === 'gpass') view.draft.password = t.value; });
let pollTimer = null;
function ensureAuthPolling() {
  const want = !signedIn() && license.pending && Date.now() - license.pending.at < 10 * 60000;
  if (want && !pollTimer) pollTimer = setInterval(async () => { try { await chrome.runtime.sendMessage({ type: 'license', action: 'authpoll' }); } catch (_) { /* worker asleep: next tick */ } }, 2000);
  else if (!want && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ---- first-run tour: a short guided walk over the real controls (Settings -> "Take the tour" runs it again) --------------
// view.tour = index of the step on screen, or null. Steps whose target is not on screen are skipped.
const TOUR = [
  { sel: '#storefilter', title: 'Your stores', text: () => 'Every store of your Associates account. Click the menu to see one store, or tick several to combine them. The countries follow your choice.' },
  { sel: '.toolbar .when', title: 'Dates', text: () => (isProNow() ? 'Today, the last 7 or 30 days, quarters, years, or any dates you choose with the calendar.' : 'Today, yesterday, this month or last month. Pro adds the last 7 and 30 days, quarters, years and any custom range.') },
  { sel: '.locwrap', title: 'Countries and tags', text: () => (isProNow() ? 'Choose the countries to show. The Tags filter narrows everything to the tracking IDs you pick. Each filter only offers what the one before it leaves.' : 'Choose the countries to show. The Tags filter (Pro) narrows everything to one tracking ID, with the real daily clicks per tag.') },
  { sel: '.brow.r2', title: 'Alerts and settings', text: () => (isProNow() ? 'The bell lists new orders, commissions, bonuses and Creator Rewards tiers (and sends desktop pop-ups if you turn them on). Settings: countries, stores, alerts, your plan, and this tour again.' : 'The bell lists new orders, sign-outs and Amazon report problems (Pro adds every alert type and desktop pop-ups). Settings: countries, stores, alerts, your plan, and this tour again. Locked items show a lock: try them all with a 14-day Pro trial.') }
];
const tourVisible = (st) => { if (!st.sel) return true; const el = document.querySelector(st.sel); return !!(el && el.getBoundingClientRect && (el.getBoundingClientRect().width > 0)); };
function endTour(done = true) { view.tour = null; if (done && !settings.tourDone) saveSettings({ tourDone: true }, false); const t = $('#tour'); if (t) t.innerHTML = ''; }
function startTour() { closePops(); view.upsell = null; view.showSettings = false; view.tour = 0; render(); }
function drawTour() {
  const host = $('#tour'); if (!host) return;
  if (view.tour == null) { host.innerHTML = ''; return; }
  const steps = TOUR.filter(tourVisible);
  if (!steps.length || view.tour >= steps.length) { endTour(); return; }
  const i = view.tour, st = steps[i], last = i === steps.length - 1;
  host.innerHTML = `<div class="tcatch"></div><div id="tourspot" class="tspot"></div><div id="tourcard" class="tcard" role="dialog" aria-label="Tour: ${esc(st.title)}">
    <div class="tstep">${i + 1} / ${steps.length}</div><h3>${esc(st.title)}</h3><p>${esc(st.text())}</p>
    <div class="tbtns"><button type="button" class="linkbtn" data-tour="skip">${last ? 'Close' : 'Skip tour'}</button><span>${i ? '<button type="button" data-tour="back">Back</button>' : ''}${last ? `${!isProNow() && trialAvailable() ? '<button type="button" data-tour="trial">Start my free trial</button>' : ''}<button type="button" class="primary" data-tour="skip">Done</button>` : `<button type="button" class="primary" data-tour="next">Next</button>`}</span></div></div>`;
  const spot = $('#tourspot'), card = $('#tourcard'), el = st.sel ? document.querySelector(st.sel) : null;
  if (el && el.scrollIntoView && !el.closest('.top')) el.scrollIntoView({ block: 'center' });
  const r = el ? el.getBoundingClientRect() : null, pad = 6;
  if (r) { Object.assign(spot.style, { outline: '', display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' }); }
  else Object.assign(spot.style, { display: 'block', left: window.innerWidth / 2 + 'px', top: window.innerHeight / 2 + 'px', width: '0px', height: '0px', outline: 'none' });   // welcome step: no target, just dim the page
  const cw = card.offsetWidth || 320, ch = card.offsetHeight || 160, W = window.innerWidth, H = window.innerHeight;
  let left, top;
  if (!r) { left = (W - cw) / 2; top = Math.max(16, (H - ch) / 2); }
  else { left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), W - cw - 12); top = r.bottom + pad + 12 + ch <= H ? r.bottom + pad + 12 : Math.max(12, r.top - pad - 12 - ch); }
  card.style.left = left + 'px'; card.style.top = top + 'px';
}
// the very first time (and only when the dashboard is really on screen): offer the tour
function maybeStartTour() {
  if (!signedIn() || settings.tourDone || view.tourShown || view.tour != null || view.showSettings || status.signedOut || !accounts.length || isLoading()) return;
  view.tourShown = true; view.tour = 0;
}

// ---- plan card (Settings), upgrade pop-up, trial banner, header chip --------------------------------------------
function planWords() {
  const i = planInfo(license), d = (n) => `${n} day${n === 1 ? '' : 's'}`;
  if (i.plan === 'pro' && i.source === 'trial') return { chip: `PRO TRIAL · ${i.daysLeft}d`, title: 'Pro trial', line: `Your free Pro trial has ${d(i.daysLeft)} left. No card was asked, nothing will be charged.` };
  if (i.plan === 'pro' && i.source === 'demo') return { chip: 'PRO DEMO', title: 'Pro (demo)', line: 'This demo shows every Pro feature.' };
  if (i.plan === 'pro') return { chip: 'PRO', title: i.source === 'comp' ? 'Pro (given)' : 'Pro', line: i.expiresAt || i.daysLeft != null ? `${i.cancelled ? 'Will not renew. Pro ends' : 'Pro is active until'} ${fmtDay(new Date(Date.now() + i.daysLeft * 86400000).toISOString().slice(0, 10), true)} (${d(i.daysLeft)}).` : 'Pro is active.' };
  return { chip: 'FREE · Upgrade', title: 'Free', line: i.trialEnded ? 'Your Pro trial has ended, so you are on Free. You keep all your data; Pro features are locked.' : i.reason === 'refunded' ? 'That license was refunded, so you are on Free.' : i.reason === 'license_ended' ? 'Your license has ended, so you are on Free.' : 'You are on the Free plan.' };
}
function planCardHTML() {
  const w = planWords(), i = planInfo(license), pro = i.plan === 'pro', paid = pro && (i.source === 'license' || i.source === 'comp');
  const busy = view.planBusy;
  const adds = ['Every period and custom date ranges', 'Tag filters with daily clicks per tag', 'Tracking IDs, categories and products', 'Creator Rewards tiers and enrollment alerts', 'Desktop alerts and all alert types', 'Other Associates sites', 'Report-gap protection', 'Updates every 5 minutes (Free: 30)'];
  const trialBtn = !pro && trialAvailable() ? `<button type="button" id="plantrial" class="primary" ${busy ? 'disabled' : ''}>Start my ${PLAN_CFG.trialDays}-day free trial</button>` : '';
  const keyRow = paid ? '' : `<div class="plankey"><input id="plankey" type="text" placeholder="Bought a license? Paste its key here (or sign in with the e-mail you bought with)" autocomplete="off" spellcheck="false" aria-label="License key"><button type="button" id="plankeybtn" ${busy ? 'disabled' : ''}>Redeem</button></div>`;
  const acct = `<div class="acctrow">Signed in as <b>${esc((license.account && license.account.email) || 'your account')}</b> <button type="button" class="linkbtn" id="signout">Sign out</button></div>`;
  return `<div class="plancard ${pro ? 'pro' : 'free'}">
    <div class="planhead"><span class="planname">${esc(w.title)}</span><span class="muted">${esc(w.line)}</span></div>
    ${acct}
    ${pro ? '' : `<ul class="planlist">${adds.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`}
    <div class="planbtns">${trialBtn}<button type="button" data-open="${esc(PLAN_CFG.pricingUrl)}" ${pro && paid ? '' : trialBtn ? '' : 'class="primary"'}>${pro ? 'Manage plan' : 'See plans'}</button><button type="button" id="planrefresh" ${busy ? 'disabled' : ''} title="Ask the license server again">Check again</button></div>
    ${view.planMsg ? `<p class="small" style="color:${view.planMsg.err ? 'var(--bad)' : 'var(--text)'};margin:8px 0 0">${esc(view.planMsg.text)}</p>` : ''}
    ${keyRow}
    <label class="nt plantele"><input type="checkbox" id="shareusage" ${settings.shareUsage ? 'checked' : ''}><span>Share anonymous usage <span class="muted small">(off by default: the app version, plan and a few counters such as how many stores you have. Never earnings, store names or tags. <a href="${esc(PLAN_CFG.privacyUrl)}" target="_blank" rel="noopener">Privacy policy</a>)</span></span></label>
    <p class="muted small" style="margin:8px 0 0">${license.checkedAt ? `Plan checked ${esc(timeAgo(license.checkedAt))}.` : 'Plan not checked yet.'} ${license.lastError ? `Last attempt failed (${esc(planMessage(license.lastError))})` : ''}</p>
  </div>`;
}
function upsellHTML() {
  const [title, text] = UPSELL[view.upsell] || UPSELL.plan;
  const busy = view.planBusy;
  return `<div class="modalbg"><div class="modal" role="dialog" aria-modal="true" aria-label="Upgrade to Pro">
    <button type="button" class="mclose" data-upclose="1" aria-label="Close">✕</button>
    <span class="propill big">PRO</span><h2>${esc(title)}</h2><p>${esc(text)}</p>
    ${view.planMsg ? `<p class="small" style="color:var(--bad)">${esc(view.planMsg.text)}</p>` : ''}
    <div class="planbtns">${trialAvailable() ? `<button type="button" id="plantrial" class="primary" ${busy ? 'disabled' : ''}>Start my ${PLAN_CFG.trialDays}-day free trial</button>` : ''}<button type="button" data-open="${esc(PLAN_CFG.pricingUrl)}" ${trialAvailable() ? '' : 'class="primary"'}>See plans</button><button type="button" data-upclose="1">Not now</button></div>
    <p class="muted small" style="margin:10px 0 0">${trialAvailable() ? `${PLAN_CFG.trialDays} days of Pro, no credit card required. You stay on Free afterwards unless you subscribe.` : 'Already have a key? Paste it in Settings → Plan.'}</p>
  </div></div>`;
}
function planBannerHTML() {
  const i = planInfo(license);
  if (i.plan === 'pro' && i.source === 'trial' && i.daysLeft <= 3) return `<div class="banner plan" role="status"><span>Your Pro trial ends in ${i.daysLeft} day${i.daysLeft === 1 ? '' : 's'}.</span><button type="button" data-open="${esc(PLAN_CFG.pricingUrl)}">Keep Pro</button></div>`;
  if (i.plan === 'free' && i.trialEnded && !settings.dismissTrialEnded) return `<div class="banner plan" role="status"><span>Your Pro trial has ended. You are on Free now and keep all your data.</span><span class="hbtns"><button type="button" data-open="${esc(PLAN_CFG.pricingUrl)}">See plans</button><button type="button" id="dismisstrial" aria-label="Dismiss">✕</button></span></div>`;
  return '';
}

function settingsHTML() {
  const on = (c) => settings.countries.includes(c);
  const accOn = (id) => !settings.accounts || settings.accounts.includes(id);
  const conf = notifyConf();
  const toggles = NOTIFY_TYPES.map(([id, label, col]) => (isProNow() || FREE_NOTIFY.includes(id)
    ? `<label class="nt"><input type="checkbox" data-notify="${id}" ${conf[id] ? 'checked' : ''}><i class="sw" style="background:var(--s-${col})"></i><span>${label}</span></label>`
    : `<label class="nt locked" data-lock="notify"><input type="checkbox" disabled><i class="sw" style="background:var(--s-${col})"></i><span>${label}</span>${PRO_PILL}</label>`)).join('');
  return `<section class="set">
    <h2>Plan</h2>
    ${planCardHTML()}
    <h2>Countries to show</h2>
    ${countriesSettingsHTML()}
    <h2>Associate stores</h2>
    ${storesSettingsHTML()}
    <h2>Notifications</h2>
    <div class="nset"><div class="muted small">Notify me about</div><div class="ntoggles">${toggles}</div>
      ${isProNow() ? `<label class="nt desk"><input type="checkbox" data-notify="desktop" ${conf.desktop ? 'checked' : ''}><span>Also show desktop alerts <span class="muted small">(Chrome will ask for permission)</span></span></label>` : `<label class="nt desk locked" data-lock="desktop"><input type="checkbox" disabled><span>Also show desktop alerts ${PRO_PILL}</span></label>`}
      ${view.notifMsg ? `<p class="small" style="color:var(--bad);margin:8px 0 0">${esc(view.notifMsg)}</p>` : ''}
      <p class="muted small" style="margin:8px 0 0">Checked every few minutes while Chrome is open. The first load never creates alerts.</p></div>
    <div class="foot"><button type="button" id="tourstart">Take the tour</button><button type="button" id="reset">Reset to defaults</button><button type="button" id="done" class="primary">Done</button></div>
  </section>`;
}

// ---- popovers: period list, date picker, notifications ----------------------------------------------
const CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const ICON_CAL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>';
const closePops = () => { view.ddOpen = view.perOpen = view.calOpen = view.notifOpen = view.locOpen = view.storeOpen = view.tagOpen = false; };
const anyPopOpen = () => view.ddOpen || view.perOpen || view.calOpen || view.notifOpen || view.locOpen || view.storeOpen || view.tagOpen;
const fmtDay = (s, withYear) => parseYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
const rangeText = (a, b, withYear = true) => (a === b ? fmtDay(a, withYear) : `${fmtDay(a, withYear)} – ${fmtDay(b, withYear)}`);

// Period list: same look as the Metrics menu.
function periodDropdownHTML() {
  const label = view.period === 'custom' ? 'Custom range' : (PERIODS.find((p) => p.id === view.period) || {}).label || 'This month';
  const row = (id, text, hint) => (id === 'custom' ? isProNow() : periodOk(id))
    ? `<button type="button" class="mi pi ${view.period === id ? 'sel' : ''}" role="option" aria-selected="${view.period === id}" data-pick="${id}"><span class="chk">${view.period === id ? '✓' : ''}</span><span>${text}</span><em class="muted small">${hint}</em></button>`
    : `<button type="button" class="mi pi locked" role="option" aria-disabled="true" data-lock="${id === 'custom' ? 'custom' : 'periods'}"><span class="chk"></span><span>${text}</span>${PRO_PILL}</button>`;
  const items = PERIODS.map((p) => { const [a, b] = rangeFor(p.id); return row(p.id, p.label, rangeText(a, b, false)); }).join('') + row('custom', 'Custom range…', '');
  const menu = view.perOpen ? `<div class="menu permenu" role="listbox" aria-label="Period">${items}</div>` : '';
  return `<div class="dd"><button type="button" class="ddsum" data-dd="period" aria-haspopup="listbox" aria-expanded="${view.perOpen}">${esc(label)} ${CHEVRON}</button>${menu}</div>`;
}

// The shown dates are a button: click to open a calendar and pick a range.
function shiftMonth(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function openCal() { const [a, b] = curRange(); view.cal = { month: b.slice(0, 7), start: a, end: b, picking: false }; }
function calHTML() {
  const c = view.cal, today = todayStr();
  const [y, m] = c.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1), lead = (first.getDay() + 6) % 7, n = new Date(y, m, 0).getDate();
  const both = c.start && c.end;
  const lo = both ? (c.start <= c.end ? c.start : c.end) : c.start, hi = both ? (c.start <= c.end ? c.end : c.start) : c.start;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let d = 1; d <= n; d++) {
    const day = `${y}-${pad2(m)}-${pad2(d)}`;
    const cls = ['day', day === lo ? 'start' : '', day === hi ? 'end' : '', lo && hi && day > lo && day < hi ? 'in' : '', day === today ? 'today' : ''].filter(Boolean).join(' ');
    cells.push(`<button type="button" class="${cls}" data-calday="${day}" ${day > today ? 'disabled' : ''} aria-label="${day}" aria-pressed="${day === lo || day === hi}">${d}</button>`);
  }
  const wd = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => `<span class="wd">${w}</span>`).join('');
  const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const statusText = both ? rangeText(lo, hi) : c.start ? `${fmtDay(c.start, true)} → pick the last day` : 'Pick the first day';
  const canNext = shiftMonth(c.month, 1) <= today.slice(0, 7);
  return `<div class="menu cal" role="dialog" aria-label="Choose dates">
    <div class="calhead"><button type="button" class="calnav" data-calnav="-1" aria-label="Previous month">‹</button><strong>${esc(title)}</strong><button type="button" class="calnav" data-calnav="1" ${canNext ? '' : 'disabled'} aria-label="Next month">›</button></div>
    <div class="calgrid">${wd}${cells.join('')}</div>
    <div class="calfoot"><span class="small ${both ? '' : 'muted'}">${esc(statusText)}</span><span class="calbtns"><button type="button" id="calcancel">Cancel</button><button type="button" id="calapply" class="primary" ${both ? '' : 'disabled'}>Apply</button></span></div>
  </div>`;
}
function rangeButtonHTML() {
  const [a, b] = curRange();
  if (!isProNow()) return `<div class="dd"><button type="button" class="rngbtn locked" data-lock="custom" title="Custom date ranges are included in Pro">${ICON_CAL}<span>${esc(rangeText(a, b))}</span>${LOCK}</button></div>`;
  return `<div class="dd"><button type="button" class="rngbtn" data-dd="cal" aria-haspopup="dialog" aria-expanded="${view.calOpen}" title="Click to choose dates">${ICON_CAL}<span>${esc(rangeText(a, b))}</span></button>${view.calOpen ? calHTML() : ''}</div>`;
}

// Notifications: list + which events to notify about.
const NOTIFY_TYPES = [
  ['orders', 'New orders', 'ordered'], ['commissions', 'Commissions', 'earnings'], ['bonuses', 'Bonuses & bounties', 'bonus'],
  ['rewards', 'Creator Rewards', 'rewards'], ['enroll', 'Creator Rewards: enrollment needed', 'bonus'], ['connections', 'Creator Connections', 'connections'], ['signedout', 'Signed-out warnings', 'returned'], ['dataissue', 'Amazon report issues', 'pending']
];
const typeColor = (t) => { const x = NOTIFY_TYPES.find((n) => n[0] === t); return x ? `var(--s-${x[2]})` : 'var(--muted)'; };
const notifyConf = () => ({ ...DEFAULTS.notify, ...(settings.notify || {}) });
const unreadCount = () => notif.items.filter((i) => i.ts > notif.readAt).length;
function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function notifPanelHTML() {
  const conf = notifyConf();
  const list = notif.items.length
    ? notif.items.slice(0, 50).map((i) => `<div class="nitem ${i.ts > view.notifFrom ? 'new' : ''}" ${i.url ? `data-open="${esc(i.url)}" style="cursor:pointer" title="Click to open"` : ''}><i class="sw" style="background:${typeColor(i.type)}"></i><div><div class="ntitle">${esc(i.title)}</div><div class="nbody muted small">${esc(i.body)}</div></div><span class="ntime muted small">${timeAgo(i.ts)}</span><button type="button" class="ndel" data-ndel="${esc(i.id)}" aria-label="Delete this notification" title="Delete">✕</button></div>`).join('')
    : '<p class="muted nempty">No notifications yet.<br>New orders, commissions, bonuses and Creator Rewards will show up here.</p>';
  return `<div class="npanel" role="dialog" aria-label="Notifications">
    <div class="nhead"><strong>Notifications</strong>${isProNow() ? `<label class="nt deskchk" title="Also show a Windows / Mac desktop pop-up for new alerts (Chrome will ask for permission)"><input type="checkbox" data-notify="desktop" ${conf.desktop ? 'checked' : ''}><span>Desktop alerts</span></label>` : `<label class="nt deskchk locked" data-lock="desktop" title="Desktop alerts are included in Pro"><input type="checkbox" disabled><span>Desktop alerts ${PRO_PILL}</span></label>`}<span><button type="button" class="linkbtn" id="nclear" ${notif.items.length ? '' : 'disabled'}>Clear all</button></span></div>
    ${view.notifMsg ? `<p class="small" style="color:var(--bad);margin:0;padding:6px 14px">${esc(view.notifMsg)}</p>` : ''}
    <div class="nlist">${list}</div>
    <div class="nfoot"><button type="button" class="linkbtn" id="nsettings">Notifications Settings</button></div>
  </div>`;
}

// Days Amazon's report dropped (see guardDays in background.js): the rows carry `held` and the last known values.
const siteUrl = (loc) => (SEPARATE_SITES[loc] || 'https://affiliate-program.amazon.com') + '/p/reporting/earnings';
const heldRows = (dayRows) => dayRows.filter((r) => r.held).sort((a, b) => (a.name < b.name ? 1 : -1));
function heldBannerHTML(dayRows) {
  const h = heldRows(dayRows);
  if (!h.length) return '';
  const lbl = (r) => fmtDate(r.name) + (multi() ? ` (${LOCALES[r.loc].short})` : '');
  const days = h.slice(0, 4).map(lbl).join(', ') + (h.length > 4 ? ` +${h.length - 4} more` : '');
  const s = h[0];
  const vals = `${fmtNum(s.clicks)} clicks${s.ordered ? ` · ${fmtNum(s.ordered)} ordered` : ''}${s.orderedRevenue > 0 ? ` · ${fmtMoney(s.orderedRevenue, s.cur)}` : ''}`;
  return `<div class="banner held" role="status"><span class="htxt"><b>Amazon's report is missing ${esc(days)}.</b> We're showing the last values we saw${h.length === 1 ? ` (${esc(vals)})` : ''}, marked in orange, until Amazon restores ${h.length === 1 ? 'that day' : 'those days'}. This is on Amazon's side and usually fixes itself within a day.</span><span class="hbtns"><button type="button" data-open="${esc(siteUrl(s.loc))}">Open Amazon report</button><button type="button" data-copydiag="1">Copy details</button></span></div>`;
}
function heldDiagnostics(dayRows) {
  const f = (o) => (o ? `clicks ${o.clicks}, ordered ${o.ordered}, ordered revenue ${o.orderedRevenue}, shipped ${o.shipped}, returned ${o.returned}, revenue ${o.revenue}, earnings ${o.earnings}` : 'no row at all');
  const lines = ['Affilyatics: Amazon report gap', `Checked: ${new Date().toISOString()} (browser time zone ${Intl.DateTimeFormat().resolvedOptions().timeZone}; Amazon's calendar days are Pacific time)`, ''];
  for (const r of heldRows(dayRows)) {
    const o = r.held;
    lines.push(`${r.loc} ${r.acct} ${r.name}`,
      `  last known (shown): ${f(r)}`,
      `  Amazon returned: ${f(o.got)}`,
      `  requested range: ${(o.range || []).join(' .. ')}`,
      `  Amazon "last updated": ${o.lu || 'n/a'}`,
      `  first noticed missing: ${new Date(o.since).toISOString()}`, '');
  }
  return lines.join('\n');
}

function mainHTML() {
  if (!signedIn()) return gateHTML();
  if (status.signedOut) return signedOutHTML();
  const dayRows = collect('day');
  const cRows = chartRows();
  const loadingOnly = !dayRows.length && isLoading();
  const cur = primaryCurrency(cRows);
  const metricsDD = metricsDropdownHTML(buildPoints(cRows, cur).totals, cur);
  const nav = `<div class="toolbar"><div class="when">${periodDropdownHTML()}${rangeButtonHTML()}${metricsDD}</div><div class="when locwrap">${locsDropdownHTML()}${tagsDropdownHTML()}</div></div>`;
  const siteErr = Object.entries(status.siteErrors || {}).filter(([loc]) => selLocales().includes(loc))
    .map(([loc, e]) => `<div class="banner">${esc(LOCALES[loc].label)}: ${esc(e.message)} <button type="button" data-open="${esc(e.url)}">Open site</button></div>`).join('');
  const err = planBannerHTML() + siteErr + (status.error ? `<div class="banner">Error: ${esc(status.error)}</div>` : (status.errors?.length ? `<div class="banner">${status.errors.length} request(s) failed: ${esc(status.errors[0])}</div>` : ''));
  if (loadingOnly) return nav + err + '<section class="panel state"><p class="muted">Loading your Amazon Associates data…</p></section>';
  const cardRows = tagAgg() || dayRows;
  return kpiHTML(cardRows) + nav + heldBannerHTML(dayRows) + err + chartHTML(cRows) + tableHTML(dayRows, cardRows);
}

// Filters are remembered: closing the popup and reopening it brings back the same view.
let savedView = '';
function persistView() {
  const v = { period: view.period, from: view.from, to: view.to, sub: view.sub, metrics: [...view.metrics], group: view.group, cumulative: view.cumulative, hideLast: !!view.hideLast, sel: view.sel ? [...view.sel] : null, stores: view.stores ? [...view.stores] : null, tags: view.tags ? [...view.tags] : null };
  const j = JSON.stringify(v);
  if (j === savedView) return;
  savedView = j;
  try { chrome.storage.local.set({ viewState: v }); } catch (_) {}
}
function restoreView(v) {
  if (!v || typeof v !== 'object') return;
  const okYmd = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (v.period === 'custom' ? okYmd(v.from) && okYmd(v.to) && v.from <= v.to : PERIODS.some((p) => p.id === v.period)) { view.period = v.period; view.from = v.from || null; view.to = v.to || null; }
  if (typeof v.sub === 'string') view.sub = v.sub;
  const ids = SERIES.map((x) => x.id);
  if (Array.isArray(v.metrics)) view.metrics = new Set(v.metrics.filter((m) => ids.includes(m)));
  if (['day', 'week', 'month'].includes(v.group)) view.group = v.group;
  view.cumulative = !!v.cumulative; view.hideLast = !!v.hideLast;
  if (Array.isArray(v.sel)) { const l = v.sel.filter((c) => enabledCountries().includes(c)); view.sel = l.length && l.length < enabledCountries().length ? new Set(l) : null; }
  else if ('sel' in v) view.sel = null;
  if (Array.isArray(v.stores)) { const l = v.stores.filter((id) => accounts.some((a) => a.id === id)); view.stores = l.length && l.length < accounts.length ? new Set(l) : null; }
  if (Array.isArray(v.tags) && v.tags.length) view.tags = new Set(v.tags.map(String));     // (an empty selection is not restored: you would reopen to a blank screen)
  savedView = JSON.stringify(v);
}

function render() {
  if (!signedIn()) { view.showSettings = false; view.tour = null; }
  { const b = document.body; if (b && b.classList && b.classList.toggle) b.classList.toggle('gate-mode', !signedIn()); const ft = $('#pagefooter'); if (ft) { ft.hidden = signedIn(); ft.innerHTML = signedIn() ? '' : footerHTML(); } }
  pruneTags();
  persistView();
  const loading = isLoading();
  const prog = $('#progress');
  prog.hidden = !loading;
  if (loading) prog.firstElementChild.style.transform = `scaleX(${status.total ? (status.done || 0) / status.total : 0.05})`;
  $('#status').textContent = loading ? `Loading ${status.done || 0}/${status.total || '…'}`
    : status.updatedAt ? `Updated ${new Date(status.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  const stamps = amazonStamps();
  $('#status').title = 'Checked automatically; only data that is due is re-downloaded.' + (stamps.length ? '\nAmazon data last updated: ' + stamps.join(' · ') : '');
  const chip = $('#planchip'); if (chip) { const w = planWords(); chip.textContent = w.chip; chip.className = 'planchip ' + (isProNow() ? 'pro' : 'free'); chip.title = w.line; chip.hidden = !signedIn(); }
  const up = $('#upsell'); if (up) up.innerHTML = view.upsell ? upsellHTML() : '';
  const th = $('#theme'); if (th) { th.innerHTML = isDark() ? ICON_SUN : ICON_MOON; th.title = isDark() ? 'Switch to light mode' : 'Switch to dark mode'; }
  const gear = $('#gear');
  gear.innerHTML = view.showSettings ? ICON_BACK : ICON_GEAR;
  gear.title = gear.ariaLabel = view.showSettings ? 'Back to dashboard' : 'Settings';
  const unread = unreadCount();
  const badge = $('#bellbadge');
  badge.hidden = unread === 0;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  $('#bell').title = unread ? `${unread} new notification${unread > 1 ? 's' : ''}` : 'Notifications';
  $('#bell').setAttribute('aria-expanded', String(view.notifOpen));
  $('#notifpanel').innerHTML = view.notifOpen ? notifPanelHTML() : '';
  const sf = $('#storefilter'); if (sf) sf.innerHTML = view.showSettings || status.signedOut || !signedIn() ? '' : storeFilterHTML();
  $('#headtotal').innerHTML = view.showSettings || status.signedOut || !signedIn() ? '' : totalCardHTML(tagAgg() || collect('day'));
  maybeStartTour();
  const main = $('#main');
  main.innerHTML = view.showSettings ? settingsHTML() : mainHTML();
  if (!view.showSettings && !status.signedOut && signedIn()) {
    const dayRows = chartRows();
    if (dayRows.length) {
      const cur = primaryCurrency(dayRows);
      const { pts, group } = buildPoints(dayRows, cur);
      wireChart(pts, chartSeries(), cur, group);
    }
  }
  ensureAuthPolling();
  drawTour();
}

if (typeof window !== 'undefined') window.startAffilyaticsTour = () => startTour();
let timer;
const renderSoon = () => { clearTimeout(timer); timer = setTimeout(render, 120); };

// ---- actions -------------------------------------------------------------------------------
// Apply a new country selection (null = all), remember it, reload what is missing.
function setSel(sel, keepOpen) {
  const all = enabledCountries();
  if (sel && view.stores) { const ok = new Set(allowedLocales()); const f = [...sel].filter((c) => ok.has(c)); sel = f.length ? new Set(f) : allowedSel(); }   // cascade: only countries of the chosen store
  if (view.stores) {                                   // chosen stores must sell in the chosen countries, otherwise show all stores again
    const l = new Set(sel ? [...sel] : all);
    if (![...view.stores].some((id) => { const a = accounts.find((x) => x.id === id); return a && (a.locales || []).some((x) => l.has(x)); })) view.stores = null;
  }
  view.sel = sel && all.every((c) => sel.has(c)) ? null : sel;
  view.sub = null;
  const l = selLocales();
  settings.sel = view.sel ? l : null; settings.tab = l.length === 1 ? l[0] : 'ALL';
  chrome.storage.local.set({ settings });
  if (!keepOpen) closePops();
  render(); requestLoad();
}
function requestLoad(force = false) {
  chrome.runtime.sendMessage({ type: 'load', period: view.period, range: curRange(), locales: selLocales(), dims: wantedDims(), force, ...(view.stores ? { accounts: [...view.stores] } : {}) }).catch(() => {});
}
async function saveSettings(patch, reload = true) {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ settings });
  if (view.sel && !enabledCountries().some((c) => view.sel.has(c))) view.sel = null;
  if (reload) requestLoad();
}

async function gateAction(kind) {
  view.gateMsg = ''; view.gateInfo = ''; view.planBusy = true; render();
  let r; try { r = await chrome.runtime.sendMessage({ type: 'license', action: kind }); } catch (_) { r = { ok: false, error: 'network' }; }
  view.planBusy = false;
  if (r && !r.ok) view.gateMsg = planMessage(r.error);
  const st = await chrome.storage.local.get('license'); license = st.license || license; render();
}
// sign in inside the popup: e-mail forms and Google (the worker talks to Firebase; Google opens Chrome's own sign-in window)
async function gateAuth(msg) {
  view.gateMsg = ''; view.gateInfo = ''; view.planBusy = true; render();
  let r; try { r = await chrome.runtime.sendMessage({ type: 'license', ...msg }); } catch (_) { r = { ok: false, error: 'network' }; }
  view.planBusy = false;
  if (r && r.ok) { view.draft = { email: '', password: '' }; view.verify = null; if (r.info === 'reset_sent') view.gateInfo = 'If an account exists for that e-mail, a reset link is on its way.'; else if (r.info === 'verify_resent') view.gateInfo = 'Sent again. Check your inbox and spam folder.'; }
  else if (r && r.error === 'verify_needed') { view.verify = { email: msg.email, password: msg.password }; if (msg.mode === 'in' && view.wasVerifying) view.gateMsg = 'Not verified yet. Open the link in the e-mail, then press the button again.'; }
  else if (r && r.error !== 'google_cancelled') view.gateMsg = planMessage(r && r.error);
  view.wasVerifying = !!view.verify;
  const st = await chrome.storage.local.get('license'); license = st.license || license; render();
}
// trial / redeem / check again: the background worker talks to the license server
async function planAction(kind) {
  if (view.planBusy) return;
  const msg = { type: 'license', action: kind };
  if (kind === 'redeem') { const k = $('#plankey'); msg.key = k ? k.value.trim() : ''; if (!msg.key) { view.planMsg = { err: true, text: 'Paste your license key first.' }; render(); return; } }
  view.planBusy = true; view.planMsg = { text: kind === 'refresh' ? 'Checking…' : 'Working…' }; render();
  let r; try { r = await chrome.runtime.sendMessage(msg); } catch (_) { r = { ok: false, error: 'network' }; }
  view.planBusy = false;
  if (r && r.ok) {
    view.planMsg = { text: kind === 'trial' ? `Your ${PLAN_CFG.trialDays}-day Pro trial has started. Enjoy!` : kind === 'redeem' ? 'License redeemed on your account. Thank you!' : 'Plan is up to date.' };
    if (kind === 'trial' || kind === 'redeem') view.upsell = null;
    const st = await chrome.storage.local.get('license'); license = st.license || license; setAccounts(rawAccounts); clampView(); requestLoad(true);
  } else view.planMsg = { err: true, text: planMessage(r && r.error) };
  render();
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  const q = (s) => t.closest(s);
  if (anyPopOpen() && !q('.dd, .npanel, #bell')) { closePops(); render(); }
  if (q('[data-tour]')) {
    const k = q('[data-tour]').dataset.tour;
    if (k === 'next') { view.tour += 1; render(); } else if (k === 'back') { view.tour = Math.max(0, view.tour - 1); render(); }
    else if (k === 'trial') { endTour(); planAction('trial'); } else endTour();
    return;
  }
  if (q('#tourstart')) { startTour(); return; }
  if (t.classList && t.classList.contains('modalbg') || q('[data-upclose]')) { view.upsell = null; view.planMsg = null; render(); return; }
  if (q('[data-lock]')) { e.preventDefault(); const k = q('[data-lock]').dataset.lock; openUpsell(k === 'periods' ? 'periods' : k); return; }
  if (q('#planchip')) { closePops(); view.upsell = null; view.showSettings = true; render(); return; }
  if (q('#plantrial') || q('#plankeybtn') || q('#planrefresh')) { planAction(q('#plantrial') ? 'trial' : q('#plankeybtn') ? 'redeem' : 'refresh'); return; }
  if (q('#ggoogle')) { gateAuth({ action: 'google' }); return; }
  if (q('#gtab-in') || q('#gtab-up')) { view.gmode = q('#gtab-up') ? 'up' : 'in'; view.gateMsg = ''; render(); return; }
  if (q('#gsubmit')) { const em = $('#gmail'), pw = $('#gpass'); gateAuth({ action: 'login', mode: view.gmode, email: ((em && em.value) || view.draft.email || '').trim(), password: (pw && pw.value) || view.draft.password || '' }); return; }
  if (q('#gforgot')) { const em = $('#gmail'); gateAuth({ action: 'login', mode: 'reset', email: ((em && em.value) || view.draft.email || '').trim() }); return; }
  if (q('#gverified')) { gateAuth({ action: 'login', mode: 'in', email: view.verify.email, password: view.verify.password }); return; }
  if (q('#gresend')) { gateAuth({ action: 'login', mode: 'resend', email: view.verify.email, password: view.verify.password }); return; }
  if (q('#gother')) { view.verify = null; view.gateMsg = ''; render(); return; }
  if (q('#signin') || q('#signinagain')) { gateAction('authstart'); return; }
  if (q('#signincancel')) { gateAction('authcancel'); return; }
  if (q('#signout')) { await chrome.runtime.sendMessage({ type: 'license', action: 'signout' }).catch(() => {}); view.planMsg = null; view.upsell = null; return; }
  if (q('#dismisstrial')) { saveSettings({ dismissTrialEnded: true }, false); render(); return; }
  if (q('#bell')) {
    const open = !view.notifOpen;
    closePops(); view.notifOpen = open;
    if (open) { view.notifFrom = notif.readAt; notif.readAt = Date.now(); view.notifMsg = ''; chrome.storage.local.set({ notif }); }
    render();
  } else if (q('[data-ndel]')) {
    const id = q('[data-ndel]').dataset.ndel;
    notif.items = notif.items.filter((i) => i.id !== id);
    chrome.storage.local.set({ notif });
    render();
  } else if (q('#nclear')) { notif.items = []; chrome.storage.local.set({ notif }); render(); }
  else if (q('#refresh')) { view.showSettings = false; render(); requestLoad(true); }
  else if (q('#theme')) {
    const next = isDark() ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('affilyatics-theme', next); } catch (_) {}
    saveSettings({ theme: next }, false);
    render();
  }
  else if (q('#close')) { persistView(); window.close(); }
  else if (q('#nsettings')) { closePops(); view.showSettings = true; render(); }
  else if (q('#gear')) { view.showSettings = !view.showSettings; render(); }
  else if (q('#open, #amazon')) chrome.tabs.create({ url: 'https://affiliate-program.amazon.com/home' });
  else if (q('[data-copydiag]')) {
    const text = heldDiagnostics(collect('day')), b = q('[data-copydiag]');
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; } catch (_) { b.textContent = 'Copy failed'; }
  }
  else if (q('[data-open]')) chrome.tabs.create({ url: q('[data-open]').dataset.open });
  else if (q('#retry')) { requestLoad(true); }
  else if (q('#done')) { view.showSettings = false; render(); requestLoad(); }
  else if (q('#reset')) { await saveSettings({ ...DEFAULTS }, false); view.sel = null; view.period = DEFAULTS.period; view.from = view.to = view.sub = view.group = null; view.cumulative = false; view.hideLast = false; view.metrics = new Set(['earnings', 'clicks', 'ordered']); render(); }
  else if (q('[data-sub]')) { view.sub = q('[data-sub]').dataset.sub; render(); requestLoad(); }
  else if (q('[data-all]')) { setSel(allowedSel()); }
  else if (q('[data-only]')) { setSel(new Set([q('[data-only]').dataset.only])); }
  else if (q('[data-cq]')) {
    const k = q('[data-cq]').dataset.cq, all = Object.keys(LOCALES);
    const sold = new Set(accounts.flatMap((a) => a.locales || [])), tot = countryTotals();
    let list = (k === 'all' ? all : k === 'active' ? all.filter((c) => tot[c] && tot[c].clicks > 0) : all.filter((c) => sold.has(c))).filter((c) => isProNow() || !SEPARATE_SITES[c]);
    if (!list.length) list = all.filter((c) => sold.has(c));
    if (!list.length) list = ['US'];
    await saveSettings({ countries: list }, false); render(); requestLoad();
  }
  else if (q('[data-store-pick]')) {
    const id = q('[data-store-pick]').dataset.storePick;
    view.stores = id ? new Set([id]) : null; view.storeOpen = false;
    const a = id ? accounts.find((x) => x.id === id) : null;
    const locs = a ? (a.locales || []).filter((l) => enabledCountries().includes(l)) : enabledCountries();
    setSel(locs.length && locs.length < enabledCountries().length ? new Set(locs) : null);          // the countries follow the store
  }
  else if (q('[data-tagonly]')) { view.tags = new Set([q('[data-tagonly]').dataset.tagonly]); render(); requestLoad(); }
  else if (q('[data-tagallbtn]')) { view.tags = null; render(); }
  else if (q('[data-goto]')) { setSel(new Set([q('[data-goto]').dataset.goto])); }
  else if (q('[data-dd]')) {
    const k = q('[data-dd]').dataset.dd;
    const was = k === 'metrics' ? view.ddOpen : k === 'period' ? view.perOpen : k === 'locs' ? view.locOpen : k === 'store' ? view.storeOpen : k === 'tags' ? view.tagOpen : view.calOpen;
    closePops();
    if (!was) { if (k === 'metrics') view.ddOpen = true; else if (k === 'period') view.perOpen = true; else if (k === 'locs') view.locOpen = true; else if (k === 'store') view.storeOpen = true; else if (k === 'tags') { view.tagOpen = true; requestLoad(); } else { view.calOpen = true; openCal(); } }
    render();
  } else if (q('[data-pick]')) {
    const id = q('[data-pick]').dataset.pick;
    closePops();
    if (id === 'custom') { view.calOpen = true; openCal(); render(); }
    else { view.period = id; view.group = null; render(); requestLoad(); }
  } else if (q('[data-calday]')) {
    const c = view.cal, day = q('[data-calday]').dataset.calday;
    if (!c.picking) { c.start = day; c.end = null; c.picking = true; }
    else { c.end = day; c.picking = false; if (c.end < c.start) [c.start, c.end] = [c.end, c.start]; }
    render();
  } else if (q('[data-calnav]')) { view.cal.month = shiftMonth(view.cal.month, Number(q('[data-calnav]').dataset.calnav)); render(); }
  else if (q('#calcancel')) { closePops(); render(); }
  else if (q('#calapply')) {
    const c = view.cal;
    if (c.start && c.end) { view.period = 'custom'; view.from = c.start; view.to = c.end; view.group = null; closePops(); render(); requestLoad(); }
  }
  else if (q('[data-mall]')) { view.metrics = q('[data-mall]').dataset.mall === 'all' ? new Set(SERIES.map((s) => s.id)) : new Set(); render(); }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'shareusage') { await saveSettings({ shareUsage: t.checked }, false); render(); return; }
  if (t.dataset.notify) {
    const k = t.dataset.notify, conf = notifyConf();
    if (k === 'desktop' && t.checked) {
      let granted = false;
      try { granted = await chrome.permissions.request({ permissions: ['notifications'] }); } catch { granted = false; }
      if (!granted) { t.checked = false; view.notifMsg = 'Chrome did not grant the notifications permission, so desktop alerts stay off.'; render(); return; }
    }
    conf[k] = t.checked;
    await saveSettings({ notify: conf }, false);
    view.notifMsg = '';
    render();
  } else if (t.id === 'cum') { view.cumulative = t.checked; render(); }
  else if (t.id === 'grp') { view.group = t.value; render(); }
  else if (t.dataset.lallbox) {
    setSel(t.checked ? allowedSel() : new Set(allowedLocales().slice(0, 1)), true);
  } else if (t.dataset.loc) {
    const cur = new Set(selLocales());
    if (t.checked) cur.add(t.dataset.loc); else if (cur.size > 1) cur.delete(t.dataset.loc);
    setSel(cur, true);
  } else if (t.dataset.storebox !== undefined || t.dataset.storeall) {
    const ids = accounts.map((a) => a.id);
    let cur = new Set(view.stores ? [...view.stores] : ids);
    if (t.dataset.storeall) cur = t.checked ? new Set(ids) : new Set(ids.slice(0, 1));              // unticking "All" keeps the main store only
    else if (t.checked) cur.add(t.dataset.storebox); else if (cur.size > 1) cur.delete(t.dataset.storebox);   // at least one store stays
    view.stores = cur.size === ids.length ? null : cur;
    const locs = new Set(accounts.filter((a) => cur.has(a.id)).flatMap((a) => a.locales || []).filter((l) => enabledCountries().includes(l)));
    setSel(view.stores && locs.size && locs.size < enabledCountries().length ? locs : null, true);   // the countries follow the stores (all stores = all countries)
  } else if (t.dataset.tagbox !== undefined) {
    const names = tagList().map((x) => x.name), cur = new Set(view.tags || names);
    if (t.checked) cur.add(t.dataset.tagbox); else cur.delete(t.dataset.tagbox);
    view.tags = names.every((n) => cur.has(n)) ? null : cur; render(); if (view.tags) requestLoad();
  } else if (t.dataset.tagall) { view.tags = t.checked ? null : new Set(); render(); if (view.tags) requestLoad();     // unticking "All tags" = none selected
  } else if (t.dataset.metric) {
    view.metrics.has(t.dataset.metric) ? view.metrics.delete(t.dataset.metric) : view.metrics.add(t.dataset.metric);
    render();
  } else if (t.dataset.country) {
    const set = new Set(settings.countries);
    t.checked ? set.add(t.dataset.country) : set.delete(t.dataset.country);
    if (!set.size) { t.checked = true; return; }                    // at least one country stays on
    await saveSettings({ countries: Object.keys(LOCALES).filter((c) => set.has(c)) }, false);
    render();
  } else if (t.dataset.account) {
    const cur = new Set(settings.accounts || accounts.map((a) => a.id));
    t.checked ? cur.add(t.dataset.account) : cur.delete(t.dataset.account);
    await saveSettings({ accounts: [...cur] }, false);
  }
});

// floating breakdown tooltip (delegated: cards are re-rendered often)
let bdTip = null;
function hideBd() { if (bdTip) bdTip.hidden = true; }
document.addEventListener('mouseover', (e) => {
  if (e.target && e.target.closest && e.target.closest('.help')) { hideBd(); return; } // the "?" explanation takes precedence over the by-country breakdown
  const el = e.target && e.target.closest ? e.target.closest('[data-bd]') : null;
  if (!el) { hideBd(); return; }
  let d; try { d = JSON.parse(el.dataset.bd); } catch (_) { return; }
  if (!bdTip) { bdTip = document.createElement('div'); bdTip.className = 'bdtip'; document.body.appendChild(bdTip); }
  bdTip.innerHTML = `<div class="bdt">${esc(d.t)} by country</div>` + d.rows.map((r) => `<div class="bdr${r.z ? ' z' : ''}"><span>${flagSVG(r.loc)}${esc(LOCALES[r.loc].label)}</span><b>${esc(r.text)}</b></div>`).join('');
  bdTip.hidden = false;
  const r = el.getBoundingClientRect(), tw = bdTip.offsetWidth, th = bdTip.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
  const top = r.bottom + 8 + th > window.innerHeight ? Math.max(8, r.top - th - 8) : r.bottom + 8;
  bdTip.style.left = left + 'px'; bdTip.style.top = top + 'px';
});
document.addEventListener('mouseleave', hideBd);

if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', () => { if (view.tour != null) drawTour(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && (e.target.id === 'gmail' || e.target.id === 'gpass') && !view.planBusy) { e.preventDefault && e.preventDefault(); const b = $('#gsubmit'); if (b) listenerClick(b); return; }
  if (view.tour != null) { if (e.key === 'Escape') { endTour(); return; } if (e.key === 'ArrowRight' || e.key === 'Enter') { view.tour += 1; render(); return; } if (e.key === 'ArrowLeft') { view.tour = Math.max(0, view.tour - 1); render(); return; } }
  if (e.key === 'Escape') { if (view.upsell) { view.upsell = null; render(); } else if (anyPopOpen()) { closePops(); render(); } } });

chrome.storage.onChanged.addListener((ch) => {
  let dirty = false;
  if (ch.cache) { cache = ch.cache.newValue || {}; dirty = true; }
  if (ch.status) { status = ch.status.newValue || {}; dirty = true; }
  if (ch.license) { const was = signedIn(); license = ch.license.newValue || {}; setAccounts(rawAccounts); clampView(); if (!was && signedIn()) { view.gateMsg = ''; requestLoad(true); } dirty = true; }
  if (ch.accounts) { setAccounts(ch.accounts.newValue); dirty = true; }
  if (ch.notif) {
    notif = ch.notif.newValue || { items: [], readAt: 0 };
    if (view.notifOpen && unreadCount()) { notif.readAt = Date.now(); chrome.storage.local.set({ notif }); } // already looking at the list
    dirty = true;
  }
  if (dirty && !(view.showSettings && !ch.accounts)) renderSoon();
});

(async () => {
  try {
    if (new URLSearchParams(location.search).has('full')) document.body.classList.add('full');
    const st = await chrome.storage.local.get(['settings', 'cache', 'status', 'accounts', 'notif', 'viewState', 'license']);
    license = st.license || {};
    settings = { ...DEFAULTS, ...(st.settings || {}) };
    cache = st.cache || {}; status = st.status || {}; setAccounts(st.accounts); notif = st.notif || { items: [], readAt: 0 };
    view.period = settings.period;
    view.sel = Array.isArray(settings.sel) && settings.sel.some((c) => enabledCountries().includes(c)) ? new Set(settings.sel) : (enabledCountries().includes(settings.tab) ? new Set([settings.tab]) : null);
    if (settings.theme) { applyTheme(settings.theme); try { localStorage.setItem('affilyatics-theme', settings.theme); } catch (_) {} }
    restoreView(st.viewState);
    clampView();
    render();
    if (signedIn()) requestLoad();
    chrome.runtime.sendMessage({ type: 'license', action: 'check' }).catch(() => {});   // the worker only asks the server when the answer is older than 12 hours
  } catch (e) {
    console.error('[affilyatics] startup failed', e);
    const m = document.querySelector('#main');
    if (m) m.innerHTML = `<div class="banner">Startup error: ${esc(e.message)}</div>`;
  }
})();
