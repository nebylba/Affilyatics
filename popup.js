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
let cache = {}, status = {}, accounts = [];
let notif = { items: [], readAt: 0 };
const view = { sel: null, locOpen: false, period: 'month', from: null, to: null, sub: null, metrics: new Set(['earnings', 'clicks', 'ordered']), group: null, cumulative: false, showSettings: false, ddOpen: false, perOpen: false, calOpen: false, notifOpen: false, notifFrom: 0, notifMsg: '', cal: { month: null, start: null, end: null, picking: false } };

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
const enabledCountries = () => settings.countries.filter((c) => LOCALES[c]);
const activeAccounts = () => accounts.filter((a) => !settings.accounts || settings.accounts.includes(a.id));
// Countries shown: view.sel = a Set of countries, or null for all enabled ones.
const selLocales = () => { const all = enabledCountries(); const l = view.sel ? all.filter((c) => view.sel.has(c)) : all; return l.length ? l : all; };
const multi = () => selLocales().length > 1;
const subOptions = () => (multi()
  ? [['countries', 'Countries'], ['tag', 'Tracking IDs'], ['cat', 'Categories'], ['product', 'Products'], ['dates', 'Dates']]
  : [['tag', 'Tracking IDs'], ['cat', 'Categories'], ['product', 'Products'], ['dates', 'Dates']]);
const currentSub = () => (subOptions().some(([id]) => id === view.sub) ? view.sub : subOptions()[0][0]);
const wantedDims = () => { const s = currentSub(); return s === 'countries' || s === 'dates' ? ['day', 'connections', 'rewards'] : ['day', 'connections', 'rewards', s]; };

function entry(acct, loc, dim) {
  const e = cache[`${acct}|${loc}|${view.period}|${dim}`];
  if (!e) return null;
  const r = curRange();
  return e.range[0] === r[0] && e.range[1] === r[1] ? e : null;
}
function collect(dim) {
  if (dim === 'income') return collectIncome();
  const out = [];
  for (const loc of selLocales()) for (const a of activeAccounts()) {
    if (!(a.locales || []).includes(loc)) continue;
    const e = entry(a.id, loc, dim);
    if (e) for (const row of e.rows) out.push({ loc, acct: a.id, cur: LOCALES[loc].cur, ...row });
  }
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
  const best = Object.entries(t).sort((a, b) => b[1] - a[1])[0];
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
  body += pts.map((p, i) => (p.held ? `<rect class="heldband" x="${(X(i) - heldBw / 2).toFixed(1)}" y="${mt}" width="${heldBw.toFixed(1)}" height="${ph}" rx="3"/>` : '')).join('');
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
function totalCardHTML(dayRows) {
  const { byCur } = sumByCurrency(dayRows, collect('income'), collect('rewards'));
  const curs = Object.keys(byCur).sort((a, b) => byCur[b].total - byCur[a].total);
  const main = curs[0];
  const t = main ? byCur[main] : null;
  const amt = (id) => (t ? fmtMoney(t[id], main) : '—');
  const others = (id) => curs.slice(1).filter((c) => byCur[c][id]).map((c) => fmtMoney(byCur[c][id], c));
  const sub = (id) => { const o = others(id); return `<div class="sub" title="${esc(o.join(' · '))}">${o.length ? '+ ' + esc(o.join(' · ')) : ''}</div>`; };
  const bar = t && t.total > 0
    ? `<div class="stack">${SOURCES.map(([id]) => (t[id] > 0 ? `<span style="flex:${t[id]};background:var(--s-${id})"></span>` : '')).join('')}</div>`
    : '<div class="stack"></div>';
  const loc = byLocation(dayRows, collect('income'), collect('rewards'));
  const tiles = SOURCES.map(([id, label]) => {
    const has = t && t[id] > 0;
    const share = has && t.total > 0 ? `<span class="pc">${Math.round(t[id] / t.total * 100)}%</span>` : '';
    return `<div class="tile${has ? '' : ' zero'}"${bdAttr(label, loc, bdMoney(id))}><div class="tl"><i style="background:var(--s-${id})"></i><span class="tn">${label}</span>${share}</div><b>${has ? amt(id) : '—'}</b>${sub(id)}</div>`;
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
  const curs = Object.keys(p).sort((a, b) => p[b].est - p[a].est);
  const items = curs.reduce((s, c) => s + p[c].items, 0);
  const value = curs.length
    ? curs.map((c, i) => (i ? `<span class="muted xtra">+${fmtMoney(p[c].est, c)}</span>` : '~' + fmtMoney(p[c].est, c))).join('') 
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
  const curs = Object.keys(out).sort((a, b) => out[a].earn - out[b].earn);
  const items = curs.reduce((s, c) => s + out[c].ret, 0);
  const val = (c) => (out[c].approx ? '~' : '') + fmtMoney(out[c].earn, c);
  const value = curs.length ? curs.map((c, i) => (i ? `<span class="muted xtra">${val(c)}</span>` : val(c))).join('') : '<span class="muted">None</span>';
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
      ${stat('Conversion', pct(all.ordered, all.clicks), 'conversion')}${pendingStat()}${returnedStat(dayRows, loc)}
    </section>`;
}

function chartHTML(dayRows) {
  const cur = primaryCurrency(dayRows);
  const { pts, group, totals, auto } = buildPoints(dayRows, cur);
  const vis = SERIES.filter((s) => view.metrics.has(s.id));
  const multiCur = new Set(dayRows.map((r) => r.cur)).size > 1;
  const legend = vis.map((s) => `<span class="leg"><i style="background:var(--s-${s.id})"></i>${s.label} <b>${fmtSeries(s, totals[s.id], cur)}</b></span>`).join('');
  const caption = vis.length
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
  const all = enabledCountries(), sel = selLocales();
  const items = all.map((c) => `<div class="mi"><input type="checkbox" data-loc="${c}" aria-label="Add or remove ${esc(LOCALES[c].label)}" ${sel.includes(c) ? 'checked' : ''}><button type="button" class="lonly" data-only="${c}" title="Show only ${esc(LOCALES[c].label)}">${flagSVG(c)}<span>${esc(LOCALES[c].label)}</span></button><b class="muted">${LOCALES[c].cur}</b></div>`).join('');
  const menu = view.locOpen
    ? `<div class="menu menuright" role="group" aria-label="Countries"><div class="mi allrow"><input type="checkbox" data-lallbox="1" aria-label="Select or clear all countries" ${sel.length === all.length ? 'checked' : ''}><button type="button" class="lonly" data-all="1" title="Show all countries"><span><b>All countries</b></span></button><b class="muted">${sel.length}/${all.length}</b></div><div class="msep"></div>${items}</div>`
    : '';
  const flags = sel.length === all.length ? 'All countries' : sel.length === 1 ? LOCALES[sel[0]].label : `${sel.length} countries`;
  const shown = sel.length <= 5 ? sel.map((c) => flagSVG(c)).join('') : '';
  return `<div class="dd"><button type="button" class="ddsum" data-dd="locs" aria-haspopup="true" aria-expanded="${view.locOpen}"><span class="dots flags">${shown}</span>${esc(flags)} ${CHEVRON}</button>${menu}</div>`;
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

function tableHTML(dayRows) {
  const sub = currentSub();
  const incomeAll = collect('income');
  const rewardsAll = collect('rewards');
  const tabs = `<div class="subtabs">${subOptions().map(([id, l]) => `<button type="button" data-sub="${id}" class="${id === sub ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const empty = (msg) => `<p class="muted" style="padding:16px 0">${msg}</p>`;
  const wait = isLoading() ? 'Loading…' : 'No data for this period.';
  let body = '';

  if (sub === 'countries') {
    const rows = selLocales().map((loc) => {
      const r = sumByCurrency(dayRows.filter((x) => x.loc === loc), incomeAll.filter((x) => x.loc === loc), rewardsAll.filter((x) => x.loc === loc));
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
  } else {
    if (!haveData(sub)) return tabs + empty(wait);
    const raw = collect(sub);
    if (sub === 'tag') {
      const rows = mergeRows(raw, (r) => r.name + '|' + (multi() ? r.loc : ''));
      body = `<div class="tablewrap"><table><thead><tr><th>Tracking ID</th>${multi() ? '<th>Country</th>' : ''}<th class="n">Clicks</th><th class="n">Ordered</th><th class="n">Shipped</th><th class="n">Conv.</th><th class="n">Ordered revenue</th><th class="n">Earnings</th></tr></thead><tbody>` +
        rows.slice(0, 100).map((r) => `<tr><td>${esc(r.name)}</td>${multi() ? `<td><span class="cn">${flagSVG(r.loc)}${esc(LOCALES[r.loc].short)}</span></td>` : ''}${cell(r.clicks, fmtNum(r.clicks))}${cell(r.ordered, fmtNum(r.ordered))}${cell(r.shipped, fmtNum(r.shipped))}<td class="n">${pct(r.ordered, r.clicks)}</td>${cell(r.orderedRevenue, fmtMoney(r.orderedRevenue, r.cur))}${cell(r.earnings, fmtMoney(r.earnings, r.cur))}</tr>`).join('') + '</tbody></table></div>';
      if (!rows.length) body = empty('No tracking-ID activity for this period.');
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

function settingsHTML() {
  const on = (c) => settings.countries.includes(c);
  const accOn = (id) => !settings.accounts || settings.accounts.includes(id);
  const conf = notifyConf();
  const toggles = NOTIFY_TYPES.map(([id, label, col]) => `<label class="nt"><input type="checkbox" data-notify="${id}" ${conf[id] ? 'checked' : ''}><i class="sw" style="background:var(--s-${col})"></i><span>${label}</span></label>`).join('');
  return `<section class="set">
    <h2>Countries to show</h2>
    <div class="checks">${Object.entries(LOCALES).map(([c, m]) => `<label><input type="checkbox" data-country="${c}" ${on(c) ? 'checked' : ''}> ${flagSVG(c)} ${esc(m.label)} <span class="muted small">${m.cur}</span></label>`).join('')}</div>
    <h2>Associate stores (accounts) to include</h2>
    ${accounts.length ? `<div class="checks">${accounts.map((a) => `<label><input type="checkbox" data-account="${esc(a.id)}" ${accOn(a.id) ? 'checked' : ''}> ${esc(a.id)} <span class="muted small">${esc((a.locales || []).filter((l) => SEPARATE_SITES[l]).join(', '))}</span></label>`).join('')}</div>`
      : '<p class="muted">Stores appear here after the first successful load (you must be signed in).</p>'}
    <h2>Notifications</h2>
    <div class="nset"><div class="muted small">Notify me about</div><div class="ntoggles">${toggles}</div>
      <label class="nt desk"><input type="checkbox" data-notify="desktop" ${conf.desktop ? 'checked' : ''}><span>Also show desktop alerts <span class="muted small">(Chrome will ask for permission)</span></span></label>
      ${view.notifMsg ? `<p class="small" style="color:var(--bad);margin:8px 0 0">${esc(view.notifMsg)}</p>` : ''}
      <p class="muted small" style="margin:8px 0 0">Checked every few minutes while Chrome is open. The first load never creates alerts.</p></div>
    <div class="foot"><button type="button" id="reset">Reset to defaults</button><button type="button" id="done" class="primary">Done</button></div>
  </section>`;
}

// ---- popovers: period list, date picker, notifications ----------------------------------------------
const CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const ICON_CAL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>';
const closePops = () => { view.ddOpen = view.perOpen = view.calOpen = view.notifOpen = view.locOpen = false; };
const anyPopOpen = () => view.ddOpen || view.perOpen || view.calOpen || view.notifOpen || view.locOpen;
const fmtDay = (s, withYear) => parseYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
const rangeText = (a, b, withYear = true) => (a === b ? fmtDay(a, withYear) : `${fmtDay(a, withYear)} – ${fmtDay(b, withYear)}`);

// Period list: same look as the Metrics menu.
function periodDropdownHTML() {
  const label = view.period === 'custom' ? 'Custom range' : (PERIODS.find((p) => p.id === view.period) || {}).label || 'This month';
  const row = (id, text, hint) => `<button type="button" class="mi pi ${view.period === id ? 'sel' : ''}" role="option" aria-selected="${view.period === id}" data-pick="${id}"><span class="chk">${view.period === id ? '✓' : ''}</span><span>${text}</span><em class="muted small">${hint}</em></button>`;
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
  return `<div class="dd"><button type="button" class="rngbtn" data-dd="cal" aria-haspopup="dialog" aria-expanded="${view.calOpen}" title="Click to choose dates">${ICON_CAL}<span>${esc(rangeText(a, b))}</span></button>${view.calOpen ? calHTML() : ''}</div>`;
}

// Notifications: list + which events to notify about.
const NOTIFY_TYPES = [
  ['orders', 'New orders', 'ordered'], ['commissions', 'Commissions', 'earnings'], ['bonuses', 'Bonuses & bounties', 'bonus'],
  ['rewards', 'Creator Rewards', 'rewards'], ['connections', 'Creator Connections', 'connections'], ['signedout', 'Signed-out warnings', 'returned'], ['dataissue', 'Amazon report issues', 'pending']
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
    <div class="nhead"><strong>Notifications</strong><span><button type="button" class="linkbtn" id="nclear" ${notif.items.length ? '' : 'disabled'}>Clear all</button></span></div>
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
  if (status.signedOut) return signedOutHTML();
  const dayRows = collect('day');
  const loadingOnly = !dayRows.length && isLoading();
  const cur = primaryCurrency(dayRows);
  const metricsDD = metricsDropdownHTML(buildPoints(dayRows, cur).totals, cur);
  const nav = `<div class="toolbar"><div class="when">${periodDropdownHTML()}${rangeButtonHTML()}${metricsDD}</div><div class="when locwrap">${locsDropdownHTML()}</div></div>`;
  const siteErr = Object.entries(status.siteErrors || {}).filter(([loc]) => selLocales().includes(loc))
    .map(([loc, e]) => `<div class="banner">${esc(LOCALES[loc].label)}: ${esc(e.message)} <button type="button" data-open="${esc(e.url)}">Open site</button></div>`).join('');
  const err = siteErr + (status.error ? `<div class="banner">Error: ${esc(status.error)}</div>` : (status.errors?.length ? `<div class="banner">${status.errors.length} request(s) failed: ${esc(status.errors[0])}</div>` : ''));
  if (loadingOnly) return nav + err + '<section class="panel state"><p class="muted">Loading your Amazon Associates data…</p></section>';
  return kpiHTML(dayRows) + nav + heldBannerHTML(dayRows) + err + chartHTML(dayRows) + tableHTML(dayRows);
}

// Filters are remembered: closing the popup and reopening it brings back the same view.
let savedView = '';
function persistView() {
  const v = { period: view.period, from: view.from, to: view.to, sub: view.sub, metrics: [...view.metrics], group: view.group, cumulative: view.cumulative, hideLast: !!view.hideLast, sel: view.sel ? [...view.sel] : null };
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
  savedView = JSON.stringify(v);
}

function render() {
  persistView();
  const loading = isLoading();
  const prog = $('#progress');
  prog.hidden = !loading;
  if (loading) prog.firstElementChild.style.transform = `scaleX(${status.total ? (status.done || 0) / status.total : 0.05})`;
  $('#status').textContent = loading ? `Loading ${status.done || 0}/${status.total || '…'}`
    : status.updatedAt ? `Updated ${new Date(status.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
  const stamps = amazonStamps();
  $('#status').title = 'Checked automatically; only data that is due is re-downloaded.' + (stamps.length ? '\nAmazon data last updated: ' + stamps.join(' · ') : '');
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
  $('#headtotal').innerHTML = view.showSettings || status.signedOut ? '' : totalCardHTML(collect('day'));
  const main = $('#main');
  main.innerHTML = view.showSettings ? settingsHTML() : mainHTML();
  if (!view.showSettings && !status.signedOut) {
    const dayRows = collect('day');
    if (dayRows.length) {
      const cur = primaryCurrency(dayRows);
      const { pts, group } = buildPoints(dayRows, cur);
      wireChart(pts, SERIES.filter((s) => view.metrics.has(s.id)), cur, group);
    }
  }
}

let timer;
const renderSoon = () => { clearTimeout(timer); timer = setTimeout(render, 120); };

// ---- actions -------------------------------------------------------------------------------
// Apply a new country selection (null = all), remember it, reload what is missing.
function setSel(sel, keepOpen) {
  const all = enabledCountries();
  view.sel = sel && all.every((c) => sel.has(c)) ? null : sel;
  view.sub = null;
  const l = selLocales();
  settings.sel = view.sel ? l : null; settings.tab = l.length === 1 ? l[0] : 'ALL';
  chrome.storage.local.set({ settings });
  if (!keepOpen) closePops();
  render(); requestLoad();
}
function requestLoad(force = false) {
  chrome.runtime.sendMessage({ type: 'load', period: view.period, range: curRange(), locales: selLocales(), dims: wantedDims(), force }).catch(() => {});
}
async function saveSettings(patch, reload = true) {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ settings });
  if (view.sel && !enabledCountries().some((c) => view.sel.has(c))) view.sel = null;
  if (reload) requestLoad();
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  const q = (s) => t.closest(s);
  if (anyPopOpen() && !q('.dd, .npanel, #bell')) { closePops(); render(); }
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
  else if (q('[data-all]')) { setSel(null); }
  else if (q('[data-only]')) { setSel(new Set([q('[data-only]').dataset.only])); }
  else if (q('[data-goto]')) { setSel(new Set([q('[data-goto]').dataset.goto])); }
  else if (q('[data-dd]')) {
    const k = q('[data-dd]').dataset.dd;
    const was = k === 'metrics' ? view.ddOpen : k === 'period' ? view.perOpen : k === 'locs' ? view.locOpen : view.calOpen;
    closePops();
    if (!was) { if (k === 'metrics') view.ddOpen = true; else if (k === 'period') view.perOpen = true; else if (k === 'locs') view.locOpen = true; else { view.calOpen = true; openCal(); } }
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
    setSel(t.checked ? null : new Set(enabledCountries().slice(0, 1)), true);
  } else if (t.dataset.loc) {
    const cur = new Set(selLocales());
    if (t.checked) cur.add(t.dataset.loc); else if (cur.size > 1) cur.delete(t.dataset.loc);
    setSel(cur, true);
  } else if (t.dataset.metric) {
    view.metrics.has(t.dataset.metric) ? view.metrics.delete(t.dataset.metric) : view.metrics.add(t.dataset.metric);
    render();
  } else if (t.dataset.country) {
    const set = new Set(settings.countries);
    t.checked ? set.add(t.dataset.country) : set.delete(t.dataset.country);
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

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && anyPopOpen()) { closePops(); render(); } });

chrome.storage.onChanged.addListener((ch) => {
  let dirty = false;
  if (ch.cache) { cache = ch.cache.newValue || {}; dirty = true; }
  if (ch.status) { status = ch.status.newValue || {}; dirty = true; }
  if (ch.accounts) { accounts = ch.accounts.newValue || []; dirty = true; }
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
    const st = await chrome.storage.local.get(['settings', 'cache', 'status', 'accounts', 'notif', 'viewState']);
    settings = { ...DEFAULTS, ...(st.settings || {}) };
    cache = st.cache || {}; status = st.status || {}; accounts = st.accounts || []; notif = st.notif || { items: [], readAt: 0 };
    view.period = settings.period;
    view.sel = Array.isArray(settings.sel) && settings.sel.some((c) => enabledCountries().includes(c)) ? new Set(settings.sel) : (enabledCountries().includes(settings.tab) ? new Set([settings.tab]) : null);
    if (settings.theme) { applyTheme(settings.theme); try { localStorage.setItem('affilyatics-theme', settings.theme); } catch (_) {} }
    restoreView(st.viewState);
    render();
    requestLoad();
  } catch (e) {
    console.error('[affilyatics] startup failed', e);
    const m = document.querySelector('#main');
    if (m) m.innerHTML = `<div class="banner">Startup error: ${esc(e.message)}</div>`;
  }
})();
