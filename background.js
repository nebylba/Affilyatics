// Affilyatics background worker.
// Uses the user's logged-in Associates session (cookies) on the Associates sites.
//   GET /p/reporting/earnings (HTML) -> embedded page state (identity token, csrf, store list)
//   -> /reporting/summary and /reporting/table with the same headers the Associates UI sends.
//
// Speed design (measured on a real account: ~0.4-0.8 s per request, 3 parallel requests = HTTP 429,
// one request cannot cover several countries, each token page is ~480 KB / 1.7 s):
//   * API requests run one at a time with NO fixed pause (the pause only grows after a 429)
//   * HTML pages (login tokens, Creator Rewards) are NOT rate-limited the same way: they load in parallel
//     with the API requests (measured: 3 pages in parallel = 1.8 s instead of 4.8 s, no 429)
//   * ONE "earning" summary request per country gives the daily numbers + bounties + bonus
//   * login tokens are kept in storage.session and reused until Amazon rejects them
//   * store/country discovery is cached for hours
//   * every entry is refreshed only when it is due: the interval adapts to Amazon's own
//     "last_updated" stamp (data that has not changed for hours is checked less often)
//   * quiet countries (no traffic) and slow data (Creator Connections, Creator Rewards) are checked rarely
//   * the popup shows cached data immediately; this worker pre-warms the cache on browser start

importScripts('shared.js', 'plan.js', 'license.js');

const isPro = async () => planOf(await getLicense()) === 'pro';
const REFRESH_MINUTES = 5;     // how often the alarm wakes the worker (cheap: only due entries are fetched)
const BASE = 'https://affiliate-program.amazon.com';
const CTX_MAX_AGE_MIN = 20;    // reuse login tokens this long (also refreshed when Amazon answers 401/403)
const DISCOVERY_MIN = 360;     // store/country discovery cache
const CACHE_VERSION = 2;       // entries written by an older layout are treated as stale
let DUE_MIN = FEATURES.pro.autoRefreshMin - 0.5;   // minutes before day/rewards data is due again; set from the plan in load()

const METRICS = 'clicks,total_ordered_items,total_ordered_revenue,shipped_items,returned_items,total_revenue,total_earnings';
const FULL = 'clicks,total_ordered_items,conversion_rate,total_ordered_revenue,shipped_items,returned_items,total_revenue,total_earnings,hva_total_earnings';
const DIMS = {
  tag: { group: 'tag_id', columns: 'tag_id,' + METRICS, sort: 'tag_id', limit: '100' },
  cat: { group: 'purchased_asin_product_category', columns: 'purchased_asin_product_category,' + FULL, sort: 'total_earnings', limit: '100' },
  product: { group: 'linked_product', columns: 'linked_product,' + FULL, sort: 'total_earnings', limit: '100' }
};
// lower = fetched first, so the numbers people look at first appear first
const PRIORITY = { day: 0, rewards: 1, tag: 2, tagday: 2, cat: 2, product: 2, connections: 3 };
const BACKGROUND_FROM = 3;     // priority >= 3 runs after the dashboard is already considered loaded

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
class AuthError extends Error {}
class StaleCtx extends Error {}   // 401/403: the cached login tokens are no longer accepted

// Make the worker's own requests look like the Associates site made them.
const SITE_BASES = [BASE, ...Object.values(SEPARATE_SITES)];
chrome.declarativeNetRequest.updateSessionRules({
  removeRuleIds: SITE_BASES.map((_, i) => i + 1),
  addRules: SITE_BASES.map((base, i) => ({
    id: i + 1, priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'set', value: base },
        { header: 'Referer', operation: 'set', value: base + '/p/reporting/earnings' }
      ]
    },
    condition: { urlFilter: `||${new URL(base).host}/`, resourceTypes: ['xmlhttprequest'], tabIds: [-1] }
  }))
}).catch((e) => console.warn('[affilyatics] header rule not applied:', e.message));

// ---- one-at-a-time request queue; the pause between requests only grows after an HTTP 429 -----
let chain = Promise.resolve();
let lastCall = 0;
let gap = 0, okStreak = 0;
function gate(fn) {
  const p = chain.then(async () => {
    const wait = lastCall + gap - Date.now();
    if (wait > 0) await sleep(wait);
    try { return await fn(); } finally { lastCall = Date.now(); }
  });
  chain = p.catch(() => {});
  return p;
}
async function request(url, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await gate(() => fetch(url, init));
    if (res.status === 429) {
      gap = Math.min(gap + 300, 1500); okStreak = 0;
      if (attempt < 4) { await sleep(1500 * 2 ** attempt); continue; }
    } else if (++okStreak >= 20 && gap > 0) { gap = Math.max(0, gap - 100); okStreak = 0; }
    return res;
  }
}

// HTML pages are fetched outside the one-at-a-time API queue (they can run in parallel), with their own 429 retry.
async function pageRequest(url, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 && attempt < 3) { await sleep(1000 * 2 ** attempt); continue; }
    return res;
  }
}

// ---- page state + login-token cache ---------------------------------------------------------------
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`));
  return m ? decode(m[1] ?? m[2]) : null;
};

async function fetchContext(storeId, base = BASE) {
  const url = `${base}/p/reporting/earnings` + (storeId ? `?store_id=${encodeURIComponent(storeId)}` : '');
  const res = await pageRequest(url, { credentials: 'include', headers: { Accept: 'text/html' } });
  if (/\/ap\/|signin/i.test(res.url) || res.status === 401) throw new AuthError('Not signed in to Amazon Associates');
  if (!res.ok) throw new Error(`Page HTTP ${res.status}`);
  const html = await res.text();
  const psTag = html.match(/<[^>]*id="pageState"[^>]*>/);
  if (!psTag) throw new AuthError('Not signed in to Amazon Associates');
  const ps = JSON.parse(attr(psTag[0], 'data-page-state'));
  const csrf = (html.match(/<meta[^>]*name="csrf-token"[^>]*content="([^"]*)"/) || [])[1];
  if (!ps.associateIdentityToken || !csrf) throw new Error('Auth tokens not found on page');
  return { ps, csrf, html, base, at: Date.now(), tagIds: tagIdsFromHtml(html) };   // tagIds: tracking-ID name -> numeric id (for the daily clicks per tag)
}

const ctxMem = new Map();
const ctxKey = (storeId, base) => base + '|' + (storeId || '_');
const sessionStore = () => chrome.storage.session || null;

async function readCtxs() { const s = sessionStore(); return s ? ((await s.get('ctxs')).ctxs || {}) : {}; }
async function writeCtxs(ctxs) { const s = sessionStore(); if (s) await s.set({ ctxs }); }

// Returns login context for a store. Cached in memory and in storage.session (survives the worker
// being stopped), without the 480 KB page body. `fresh` forces a new page fetch.
const ctxInflight = new Map();
function ctxFor(storeId, base = BASE, opts = {}) {
  const k = ctxKey(storeId, base);
  if (!opts.fresh && ctxInflight.has(k)) return ctxInflight.get(k);
  const p = ctxForUncached(storeId, base, opts).finally(() => { if (ctxInflight.get(k) === p) ctxInflight.delete(k); });
  ctxInflight.set(k, p);
  return p;
}
async function ctxForUncached(storeId, base = BASE, { fresh = false } = {}) {
  const k = ctxKey(storeId, base), maxAge = CTX_MAX_AGE_MIN * 60000;
  if (!fresh) {
    const m = ctxMem.get(k);
    if (m && Date.now() - m.at < maxAge) return m;
    const s = (await readCtxs())[k];
    if (s && Date.now() - s.at < maxAge) { ctxMem.set(k, s); return s; }
  }
  const v = await fetchContext(storeId, base);
  if (storeId && v.ps.storeId !== storeId) throw new Error(`Store ${storeId} not switchable`);
  const slim = { ps: v.ps, csrf: v.csrf, base, at: v.at, tagIds: v.tagIds };
  const all = await readCtxs();
  // a page fetched without a store id is the default store's page: cache it under that store's key too
  for (const key of new Set([k, ctxKey(v.ps.storeId, base)])) { ctxMem.set(key, slim); all[key] = slim; }
  await writeCtxs(all);
  return v; // includes html, for discovery
}
async function dropCtx(storeId, base) {
  const k = ctxKey(storeId, base);
  ctxMem.delete(k);
  const all = await readCtxs(); delete all[k]; await writeCtxs(all);
}

function discover(html, ps) {
  const stores = new Set();
  const pick = html.match(/<select[^>]*id="menu-tab-store-id-picker"[\s\S]*?<\/select>/);
  if (pick) for (const o of pick[0].match(/<option[^>]*>/g) || []) { const v = attr(o, 'value'); if (v) stores.add(v); }
  const combos = {};
  for (const o of html.match(/<option[^>]*data-locale="[A-Z]{2}"[^>]*>/g) || []) {
    const loc = attr(o, 'data-locale'), v = attr(o, 'value') || '';
    const m = v.match(/^(.+)__\d+$/);
    if (m && LOCALES[loc]) (combos[m[1]] ||= new Set()).add(loc);
  }
  if (!stores.size) stores.add(ps.storeId);
  return [...stores].map((id) => ({ id, locales: [...(combos[id] || ['US'])] }));
}

// Stores/countries change rarely: discover once, reuse for hours (5 min after a partial failure).
async function discoverAll(settings, req, pro = true) {
  const st = await chrome.storage.local.get(['accounts', 'accountsAt', 'accountsSiteErrors']);
  const sepLocs = pro ? [...new Set([...req.locales, ...settings.countries].filter((l) => SEPARATE_SITES[l]))] : [];
  const cachedErr = st.accountsSiteErrors || {};
  const age = Date.now() - (st.accountsAt || 0);
  const maxAge = (Object.keys(cachedErr).length ? 5 : DISCOVERY_MIN) * 60000;
  const coversSep = sepLocs.every((l) => cachedErr[l] || (st.accounts || []).some((a) => a.base === SEPARATE_SITES[l]));
  // pressing Refresh re-checks a country site that failed before (e.g. after you signed in to it)
  const retryFailed = req.force && Object.keys(cachedErr).length > 0;
  if (st.accounts && st.accounts.length && age < maxAge && coversSep && !retryFailed) return { accounts: st.accounts, siteErrors: cachedErr };

  // the US page and every separate country site load at the same time
  const sepResults = sepLocs.map((loc) => ctxFor(null, SEPARATE_SITES[loc], { fresh: true }).then((v) => ({ loc, v }), (e) => ({ loc, e })));
  const first = await ctxFor(null, BASE, { fresh: true });
  // US site: every country EXCEPT those that have their own site (they would show a different, wrong view).
  const accounts = discover(first.html, first.ps).map((a) => ({ ...a, base: BASE, locales: a.locales.filter((l) => !SEPARATE_SITES[l]) }));
  const siteErrors = {};
  for (const r of await Promise.all(sepResults)) {
    const base = SEPARATE_SITES[r.loc];
    if (r.e) siteErrors[r.loc] = { message: r.e instanceof AuthError ? `Not signed in to ${new URL(base).host}` : r.e.message, url: base };
    else for (const a of discover(r.v.html, r.v.ps)) accounts.push({ id: a.id, base, locales: [r.loc] });
  }
  await chrome.storage.local.set({ accounts, accountsAt: Date.now(), accountsSiteErrors: siteErrors });
  return { accounts, siteErrors };
}

// ---- reporting ----------------------------------------------------------------------------
const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const FIELDS = ['clicks', 'ordered', 'shipped', 'returned', 'orderedRevenue', 'revenue', 'earnings'];
const hasData = (r) => r.clicks || r.ordered || r.shipped || r.returned || r.orderedRevenue || r.revenue || r.earnings;

function apiHeaders(ctx, acct, loc) {
  return {
    Accept: 'application/json, text/plain, */*',
    'X-CSRF-Token': ctx.csrf,
    Authorization: 'Bearer ' + ctx.ps.associateIdentityToken,
    marketplaceId: LOCALES[loc].mid, locale: ctx.ps.locale, storeId: acct,
    customerId: ctx.ps.customerId, programId: ctx.ps.programId,
    roles: (ctx.ps.roles || ['Primary']).join(','), language: ctx.ps.language,
    'X-Requested-With': 'XMLHttpRequest'
  };
}
function checkStatus(res, what) {
  if (res.status === 401 || res.status === 403) throw new StaleCtx(what);
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
}

// Summary report ("earning" / "connections"): per-day rows + Amazon's own last_updated stamp.
async function summaryChunk(ctx, acct, loc, type, [start, end], extra = {}) {
  const q = new URLSearchParams({ 'query[start_date]': start, 'query[end_date]': end, 'query[type]': type, 'query[storeId]': acct, 'query[locale]': loc, ...extra, store_id: acct });
  const res = await request(`${ctx.base}/reporting/summary?${q}`, { credentials: 'include', headers: apiHeaders(ctx, acct, loc) });
  checkStatus(res, `${type} ${acct}/${loc} ${start}..${end}`);
  const j = await res.json();
  return { records: j.records || [], lu: j.last_updated || null };
}

// One request per 90 days gives: clicks, orders, shipped, returned, revenue, earnings, bounties, bonus.
// (Verified against the daily table report: identical totals.)
async function fetchDay(ctx, acct, loc, range) {
  const rows = [];
  let lu = null;
  for (const ch of splitRange(range)) {
    const { records, lu: l } = await summaryChunk(ctx, acct, loc, 'earning', ch);
    lu = l || lu;
    for (const r of records) rows.push({
      name: String(r.day || r.date_range_start || '').slice(0, 10),
      clicks: num(r.clicks), ordered: num(r.ordered_items ?? r.total_ordered_items), shipped: num(r.shipped_items),
      returned: num(r.returned_items), orderedRevenue: num(r.ordered_revenue ?? r.total_ordered_revenue),
      revenue: num(r.total_revenue), earnings: num(r.total_earnings),
      bounty: num(r.bounty_earnings), bonus: num(r.hva_total_earnings)
    });
  }
  return { rows, lu };
}

// Daily clicks per tracking ID. Amazon reports clicks per day for one tag (its Tracking ID filter sends the tag's numeric id plus its name),
// but sales are empty on those days: a tag's sales only exist as period totals (see the tag table). The numeric ids are in the
// Tracking ID dropdown of the earnings page.
function tagIdsFromHtml(html) {
  const ids = {};
  for (const m of String(html).matchAll(/data-ac-report-widget-dropdown-select-multi="([^"]*)"/g)) {
    try {
      const o = JSON.parse(decode(m[1]));
      if (o && o.name === 'report-download-trackingIds' && /^\d+$/.test(String(o.value)) && o.label) ids[o.label] = String(o.value);
    } catch (_) { /* not a tag option */ }
  }
  return ids;
}
async function fetchTagDays(ctx, acct, loc, range) {
  const rows = [];
  for (const [label, id] of Object.entries(ctx.tagIds || tagIdsFromHtml(ctx.html || ''))) {
    for (const ch of splitRange(range)) {
      const { records } = await summaryChunk(ctx, acct, loc, 'earning', ch, { 'query[tag_id]': id, 'query[tag_value]': label });
      for (const r of records) {
        const clicks = num(r.clicks);
        if (clicks) rows.push({ name: String(r.day || r.date_range_start || '').slice(0, 10), tag: label, clicks });
      }
    }
  }
  return { rows };
}

// Creator Connections (field names not verified against real income: the account had none).
async function fetchConnections(ctx, acct, loc, range) {
  const rows = [];
  for (const ch of splitRange(range)) {
    const { records } = await summaryChunk(ctx, acct, loc, 'connections', ch);
    for (const r of records) {
      const v = num(r.connections_earnings ?? r.total_earnings);
      if (v) rows.push({ name: String(r.day || r.date_range_start || ch[0]).slice(0, 10), connections: v });
    }
  }
  return { rows };
}

function normalizeTable(r, dim) {
  const row = {
    clicks: num(r.clicks), ordered: num(r.total_ordered_items), shipped: num(r.shipped_items),
    returned: num(r.returned_items), orderedRevenue: num(r.total_ordered_revenue),
    revenue: num(r.total_revenue), earnings: num(r.total_earnings)
  };
  if (dim === 'tag') row.name = r.tracking_id || r.tag_value || 'Other';
  else if (dim === 'cat') row.name = r.purchased_asin_product_category || r.gl_product_group || 'Other';
  else { row.name = r.linked_product_title || r.creative_asin_title || r.linked_product || 'Unknown'; row.asin = r.linked_product || ''; }
  return row;
}

// Tracking IDs / categories / products: the table report (only fetched when that table is shown).
async function queryChunk(ctx, acct, loc, dim, [start, end]) {
  const d = DIMS[dim];
  const q = new URLSearchParams({
    'query[type]': 'overview', 'query[start_date]': start, 'query[end_date]': end, 'query[tag_id]': 'all',
    'query[order]': 'desc', 'query[device_type]': 'all', 'query[last_accessed_row_index]': '0',
    'query[group_by]': d.group, 'query[columns]': d.columns, 'query[tag_value]': '',
    'query[storeId]': acct, 'query[locale]': loc, 'query[skip]': '0', 'query[next_token]': '',
    'query[sort]': d.sort, 'query[limit]': d.limit, store_id: acct
  });
  const res = await request(`${ctx.base}/reporting/table?${q}`, { credentials: 'include', headers: apiHeaders(ctx, acct, loc) });
  checkStatus(res, `${dim} ${acct}/${loc} ${start}..${end}`);
  return ((await res.json()).records || []).map((r) => normalizeTable(r, dim));
}
async function fetchTable(ctx, acct, loc, dim, range) {
  const all = [];
  for (const ch of splitRange(range)) all.push(...await queryChunk(ctx, acct, loc, dim, ch));
  const m = new Map(); // merge duplicates coming from different chunks
  for (const r of all) {
    const k = r.asin || r.name;
    const t = m.get(k) || { ...r, ...Object.fromEntries(FIELDS.map((f) => [f, 0])) };
    for (const f of FIELDS) t[f] += r[f];
    m.set(k, t);
  }
  return { rows: [...m.values()].filter(hasData).sort((a, b) => b.earnings - a.earnings || b.orderedRevenue - a.orderedRevenue || b.clicks - a.clicks) };
}

// ---- Creator Rewards (Promotions > Creator Rewards) --------------------------------------------
// A monthly tiered bonus per store, rendered as HTML (no JSON API). Current month = page HTML,
// finished months = the page's own "Ended" tab call (POST <data-acp-path>switchTab).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const moneyNum = (s) => parseFloat(String(s).replace(/,/g, '')) || 0;

function parseRewardCards(html, status) {
  const text = decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const mon = MONTHS.join('|');
  const re = new RegExp(`Creator Rewards (${mon}) (\\d{4}) (.*?)(?= Creator Rewards (?:${mon}) \\d{4} | Rate Promotion | Operating agreement|$)`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const bonus = m[3].match(/Your total rewards this period: Bonus: \$([\d,]+(?:\.\d+)?)/);
    if (!bonus) continue;
    const shipped = m[3].match(/Total Bonus: \$([\d,]+(?:\.\d+)?)/);
    // the tier table: pairs of "shipped revenue needed" and "bonus"
    const tierText = (m[3].match(/Shipped revenue Bonus((?:\s+\$[\d,]+(?:\.\d+)?\s+\$[\d,]+(?:\.\d+)?)+)/) || [])[1] || '';
    const tiers = [...tierText.matchAll(/\$([\d,]+(?:\.\d+)?)\s+\$([\d,]+(?:\.\d+)?)/g)].map((t) => ({ revenue: moneyNum(t[1]), bonus: moneyNum(t[2]) })).sort((a, b) => a.revenue - b.revenue);
    out.push({ month: `${m[2]}-${pad2(MONTHS.indexOf(m[1]) + 1)}`, bonus: moneyNum(bonus[1]), shipped: shipped ? moneyNum(shipped[1]) : 0, tiers, status });
  }
  return out;
}

// ---- Creator Rewards offers that need you to enrol ----------------------------------------------------
// The Current page says "Store ID x is enrolled."; the Upcoming tab says "... has no upcoming promotions." when empty.
// When a store is NOT enrolled in a live or upcoming offer, the page shows a "not enrolled" sentence and/or an Enroll / Join / Opt-in
// button (wording not seen yet on this account, so the check is generous but only fires for a real offer: month or duration found).
const ENROLL_RE = /\b(enroll|enrol|opt[ -]?in|join|sign[ -]?up|participate|accept)\b/i;
function parseRewardOffer(html, tab) {
  const body = String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const text = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\bno (upcoming )?(promotions?|offers?)\b/i.test(text)) return null;
  const buttons = [...body.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter((t) => t && !/^(current|upcoming|ended)$/i.test(t));
  const notEnrolled = /\b(not|isn['’]t|aren['’]t)\s+(yet\s+)?enrolled\b/i.test(text);
  const enrolled = !notEnrolled && /\b(is|are|you(?:'ve| have))\s+enrolled\b/i.test(text);
  const btn = buttons.find((t) => ENROLL_RE.test(t) && t.length < 40);
  const label = (text.match(new RegExp('(' + MONTHS.join('|') + ')\\s+(\\d{4})')) || []);
  const dur = (text.match(/Offer duration:\s*([^.]*?\d{4}\s*[-–]\s*[^.]*?\d{4})/i) || [])[1] || '';
  if (!(notEnrolled || (btn && !enrolled))) return null;
  if (!label[0] && !dur) return null;                 // nothing that looks like an offer: do not guess
  return { tab, label: label[0] || '', duration: dur.trim(), button: btn || '' };
}
async function detectEnroll(acct, offers) {
  const { enrollSeen = {} } = await chrome.storage.local.get('enrollSeen');
  let changed = false; const live = new Set();
  for (const o of offers) {
    const key = `${acct}|${o.tab}|${o.label || o.duration || 'offer'}`; live.add(key);
    if (enrollSeen[key]) continue;
    enrollSeen[key] = Date.now(); changed = true;
    pushEvent('enroll', `Creator Rewards: enrollment needed${o.label ? ` · ${o.label}` : ''}`,
      `${o.tab === 'Upcoming' ? 'A new Creator Rewards offer is coming' : 'A Creator Rewards offer is open'}${o.duration ? ` (${o.duration})` : ''}. Click to open the page and enroll store ${acct}.`,
      { url: `${BASE}/creatorRewards?store_id=${encodeURIComponent(acct)}`, loc: 'US', acct, cur: null, amount: 0 });
  }
  for (const k of Object.keys(enrollSeen)) if (k.startsWith(acct + '|') && !live.has(k)) { delete enrollSeen[k]; changed = true; }   // enrolled or ended: a later offer announces again
  if (changed) await chrome.storage.local.set({ enrollSeen });
}

const REWARDS_TTL_MS = 4.5 * 60000; // every 5-minute alarm re-reads it (a hair under 5 min so a slightly early alarm still counts)
// The month list does not depend on the selected period: fetched at most once an hour per store (persisted).
async function fetchRewardMonths(acct, fresh) {
  const { rewardsMonths = {} } = await chrome.storage.local.get('rewardsMonths');
  const hit = rewardsMonths[acct];
  if (!fresh && hit && Date.now() - hit.at < REWARDS_TTL_MS) return hit.months;
  const res = await pageRequest(`${BASE}/creatorRewards?store_id=${encodeURIComponent(acct)}`, { credentials: 'include', headers: { Accept: 'text/html' } });
  if (/\/ap\/|signin/i.test(res.url) || res.status === 401) throw new AuthError('Session expired');
  if (!res.ok) throw new Error(`creatorRewards ${acct}: HTTP ${res.status}`);
  const html = await res.text();
  const months = parseRewardCards(html, 'current');
  const tag = html.match(/<[^>]*data-acp-path=[^>]*>/);
  const path = tag && attr(tag[0], 'data-acp-path'), params = tag && attr(tag[0], 'data-acp-params');
  if (path && params) {
    const r = await pageRequest(BASE + path.replace(/\/?$/, '/') + 'switchTab', {
      method: 'POST', credentials: 'include',
      headers: { Accept: 'text/html, */*; q=0.01', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'x-amz-acp-params': params },
      body: JSON.stringify({ tab: 'Ended', storeId: acct, associateProgramId: 1 })
    });
    if (r.ok) months.push(...parseRewardCards(await r.text(), 'ended'));
  }
  // offers that need enrolling: the current page every time, the Upcoming tab at most every 30 min
  try {
    const { rewardsOffers = {} } = await chrome.storage.local.get('rewardsOffers');
    let memo = rewardsOffers[acct];
    if (!memo || Date.now() - memo.at > 30 * 60000) {
      let up = memo ? memo.up : null;
      if (path && params) {
        const u = await pageRequest(BASE + path.replace(/\/?$/, '/') + 'switchTab', {
          method: 'POST', credentials: 'include',
          headers: { Accept: 'text/html, */*; q=0.01', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'x-amz-acp-params': params },
          body: JSON.stringify({ tab: 'Upcoming', storeId: acct, associateProgramId: 1 })
        });
        if (u.ok) up = parseRewardOffer(await u.text(), 'Upcoming');
      }
      memo = { at: Date.now(), up: up || null };
      rewardsOffers[acct] = memo; await chrome.storage.local.set({ rewardsOffers });
    }
    await detectEnroll(acct, [parseRewardOffer(html, 'Current'), memo.up].filter(Boolean));
  } catch (e) { console.warn('[affilyatics] enrollment check failed:', e.message); }
  detectRewards(acct, hit, months);
  rewardsMonths[acct] = { at: Date.now(), months };
  await chrome.storage.local.set({ rewardsMonths });
  await persistNotify();
  return months;
}

// A month's bonus counts toward a period when the period covers the whole month
// (the current month counts month-to-date). It is placed on the month's last day (today for the current month).
async function fetchRewards(acct, [s, e], fresh) {
  const today = ymd(new Date());
  const rows = [];
  for (const m of await fetchRewardMonths(acct, fresh)) {
    if (!m.bonus) continue;
    const [y, mo] = m.month.split('-').map(Number);
    const start = ymd(new Date(y, mo - 1, 1)), end = ymd(new Date(y, mo, 0));
    const isCurrent = start <= today && today <= end;
    const covered = isCurrent ? s <= start && e >= today : end >= s && end <= e && start >= s;
    if (covered) rows.push({ name: isCurrent ? today : end, rewards: m.bonus, shipped: m.shipped, month: m.month, status: m.status, tiers: m.tiers || [] });
  }
  return { rows };
}

// ---- when is an entry due? ------------------------------------------------------------------------
// Current periods follow Amazon's own "last_updated": data unchanged for hours is checked less often.
function dueAfterMs(dim, e, range) {
  const MIN = 60000;
  const current = range[1] >= ymd(new Date());
  if (dim === 'rewards') return DUE_MIN * MIN;
  if (dim === 'connections') return (current ? 360 : 720) * MIN;
  if (!current) return 60 * MIN;
  if (dim !== 'day') return 10 * MIN;                       // tag / category / product tables
  return DUE_MIN * MIN;                                      // Pro: every 5-minute alarm (quiet ones too); Free: about every 30 minutes
}
const isFresh = (dim, e, range) => !!e && e.v === CACHE_VERSION && e.range[0] === range[0] && e.range[1] === range[1] && Date.now() - e.at < dueAfterMs(dim, e, range);
const hasActivity = (rows) => rows.some((r) => r.clicks || r.ordered || r.shipped || r.earnings || r.orderedRevenue || r.bounty || r.bonus);

// Daily data for a period that lies inside another, already fresh period of the same store+country
// (Today / Yesterday / Last 7 days inside This month, This month inside This quarter, ...) needs no request:
// the rows are just filtered by date.
function deriveFromWider(cache, acct, loc, dim, range) {
  if (dim !== 'day' && dim !== 'connections') return null;
  const prefix = `${acct}|${loc}|`, suffix = `|${dim}`;
  let best = null;
  for (const [k, e] of Object.entries(cache)) {
    if (!k.startsWith(prefix) || !k.endsWith(suffix) || !isFresh(dim, e, e.range)) continue;
    if (e.range[0] <= range[0] && e.range[1] >= range[1] && (!best || e.at > best.at)) best = e;
  }
  if (!best) return null;
  const rows = best.rows.filter((r) => r.name >= range[0] && r.name <= range[1]);
  const out = { ...best, range, rows, derived: true };
  if (dim === 'day') out.active = hasActivity(rows);
  return out;
}

// ---- notifications: new orders, commissions, bonuses, Creator Rewards ---------------------------
// Detected by comparing each fresh "this month" fetch with the previous snapshot of the same
// store + country + month. Nothing is announced on the very first fetch (that is the baseline) or when the
// baseline is older than 14 days, so you never get a flood of "new" events for old data.
const NOTIFY_DEFAULT = { orders: true, commissions: true, bonuses: true, rewards: true, enroll: true, connections: true, signedout: true, dataissue: true, desktop: false };
const SYM = { USD: '$', CAD: 'C$', GBP: '£', EUR: '€', SEK: 'kr ', PLN: 'zł ' };
const money = (n, cur) => (n < 0 ? '-' : '') + (SYM[cur] || cur + ' ') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BASELINE_MAX_AGE_MS = 14 * 86400000;
let notifyConf = { ...NOTIFY_DEFAULT };
let pendingEvents = [];
let notifySnaps = null;

function pushEvent(type, title, body, extra = {}) {
  if (!notifyConf[type]) return;
  pendingEvents.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), type, title, body, ...extra });
}
async function getSnaps() {
  if (!notifySnaps) notifySnaps = (await chrome.storage.local.get('notifySnap')).notifySnap || {};
  return notifySnaps;
}

// store+country totals this month: [ordered items, ordered revenue, commissions, bounties, bonus]
async function detectDay(t, rows, range) {
  const snaps = await getSnaps();
  const key = `${t.acct}|${t.loc}|${range[0]}`;
  const tot = [0, 0, 0, 0, 0];
  for (const r of rows) { tot[0] += r.ordered; tot[1] += r.orderedRevenue; tot[2] += r.earnings; tot[3] += r.bounty || 0; tot[4] += r.bonus || 0; }
  const prev = snaps[key];
  snaps[key] = { at: Date.now(), tot };
  let base = prev && Date.now() - prev.at <= BASELINE_MAX_AGE_MS ? prev.tot : null;
  if (!prev) {
    // a new month for a store+country we already follow: everything in it is new (only in its first days)
    const followed = Object.keys(snaps).some((k) => k !== key && k.startsWith(`${t.acct}|${t.loc}|`) && !k.endsWith('|conn'));
    if (followed && new Date().getDate() <= 3) base = [0, 0, 0, 0, 0];
  }
  if (!base) return;
  const d = tot.map((v, i) => v - base[i]);
  const cur = LOCALES[t.loc].cur, cc = LOCALES[t.loc].short, where = `${cc} · ${t.acct}`;
  if (d[0] > 0.5) pushEvent('orders', `New order${d[0] > 1.5 ? 's' : ''} · ${cc}`, `+${Math.round(d[0])} item${d[0] > 1.5 ? 's' : ''} ordered${d[1] > 0.004 ? ` (${money(d[1], cur)})` : ''} · ${t.acct}`, { loc: t.loc, acct: t.acct, cur, amount: d[1] });
  if (d[2] > 0.004) pushEvent('commissions', `Commission ${money(d[2], cur).replace(/^/, '+')} · ${cc}`, `Earnings this month: ${money(tot[2], cur)} · ${t.acct}`, { loc: t.loc, acct: t.acct, cur, amount: d[2] });
  else if (d[2] < -0.004) pushEvent('commissions', `Commission adjusted ${money(d[2], cur)} · ${cc}`, `A return or cancellation. Earnings this month: ${money(tot[2], cur)} · ${t.acct}`, { loc: t.loc, acct: t.acct, cur, amount: d[2] });
  if (d[3] > 0.004) pushEvent('bonuses', `Bounty ${money(d[3], cur).replace(/^/, '+')} · ${cc}`, `Bounty earnings this month: ${money(tot[3], cur)} · ${where}`, { loc: t.loc, acct: t.acct, cur, amount: d[3] });
  if (d[4] > 0.004) pushEvent('bonuses', `Bonus ${money(d[4], cur).replace(/^/, '+')} · ${cc}`, `Bonus this month: ${money(tot[4], cur)} · ${where}`, { loc: t.loc, acct: t.acct, cur, amount: d[4] });
}

async function detectConn(t, rows, range) {
  const snaps = await getSnaps();
  const key = `${t.acct}|${t.loc}|${range[0]}|conn`;
  const tot = rows.reduce((a, r) => a + (r.connections || 0), 0);
  const prev = snaps[key];
  snaps[key] = { at: Date.now(), tot };
  if (!prev || Date.now() - prev.at > BASELINE_MAX_AGE_MS) return;
  const d = tot - prev.tot, cur = LOCALES[t.loc].cur, cc = LOCALES[t.loc].short;
  if (d > 0.004) pushEvent('connections', `Creator Connections ${money(d, cur).replace(/^/, '+')} · ${cc}`, `Creator Connections this month: ${money(tot, cur)} · ${t.acct}`, { loc: t.loc, acct: t.acct, cur, amount: d });
}

// ---- Amazon report gaps ---------------------------------------------------------------------------
// Sometimes Amazon's report drops a recent day (it shows clicks and orders in a single-day query but nothing for that day
// inside a longer range, and it comes back hours later). We keep a small ledger of the last values seen for each recent
// day. If a day that had activity vanishes from a fresh response, its last known values are put back into the rows,
// flagged `held`, so every card, the chart and the tables keep showing them (marked as unconfirmed). The hold ends
// as soon as Amazon returns data for that day again, or after 72 hours.
const HOLD_RECENT_DAYS = 7, HOLD_MAX_MS = 72 * 3600e3, LEDGER_KEEP_DAYS = 14;
const LEDGER_FIELDS = ['clicks', 'ordered', 'shipped', 'returned', 'orderedRevenue', 'revenue', 'earnings', 'bounty', 'bonus'];
const prettyDay = (d) => parseYmd(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const siteUrl = (loc) => (SEPARATE_SITES[loc] || 'https://affiliate-program.amazon.com') + '/p/reporting/earnings';
const daysAgo = (n) => ymd(new Date(Date.now() - n * 86400000));

async function guardDays(t, res, range) {
  if (!(await isPro())) return;                              // Free shows Amazon's report exactly as it comes
  const { ledger = {} } = await chrome.storage.local.get('ledger');
  const key = `${t.acct}|${t.loc}`;
  const L = (ledger[key] ||= {});
  const rows = res.rows;
  const byDay = new Map(rows.map((r) => [r.name, r]));
  const cur = LOCALES[t.loc].cur, cc = LOCALES[t.loc].short;
  const minDay = daysAgo(HOLD_RECENT_DAYS), now = Date.now();
  let dirty = false;
  // 1. remember what Amazon shows for recent days
  for (const r of rows) {
    if (r.name < minDay || !hasData(r)) continue;
    const old = L[r.name];
    if (old && old.heldSince) {
      pushEvent('dataissue', `Amazon's report is back for ${prettyDay(r.name)} · ${cc}`, `The missing day is available again (${Math.round(r.clicks)} clicks, ${Math.round(r.ordered)} ordered). Numbers are confirmed by Amazon again. · ${t.acct}`, { loc: t.loc, acct: t.acct, cur, amount: 0 });
    }
    L[r.name] = { at: now, row: Object.fromEntries(LEDGER_FIELDS.map((f) => [f, r[f] || 0])) };
    dirty = true;
  }
  // 2. recent days we knew that this response no longer contains
  for (const [day, e] of Object.entries(L)) {
    if (day < range[0] || day > range[1]) continue;
    if (day < daysAgo(LEDGER_KEEP_DAYS)) { delete L[day]; dirty = true; continue; }
    const got = byDay.get(day);
    if (got && hasData(got)) continue;
    if (day < minDay) continue;
    if (!e.heldSince) {
      e.heldSince = now; dirty = true;
      const s = e.row;
      pushEvent('dataissue', `Amazon's report is missing ${prettyDay(day)} · ${cc}`,
        `It showed ${Math.round(s.clicks)} clicks${s.ordered ? `, ${Math.round(s.ordered)} ordered item${Math.round(s.ordered) === 1 ? '' : 's'}${s.orderedRevenue > 0.004 ? ` (${money(s.orderedRevenue, cur)})` : ''}` : ''} earlier. Showing the last known values until Amazon restores them. · ${t.acct}`,
        { loc: t.loc, acct: t.acct, cur, amount: 0, url: siteUrl(t.loc) });
    }
    if (now - e.heldSince > HOLD_MAX_MS) { delete L[day]; dirty = true; continue; } // give up: accept Amazon's version
    e.diag = { at: now, lu: res.lu || null, range, got: got ? Object.fromEntries(LEDGER_FIELDS.map((f) => [f, got[f] || 0])) : null };
    const held = { name: day, ...e.row, held: { since: e.heldSince, lu: res.lu || null, got: e.diag.got, range } };
    if (got) Object.assign(got, held); else rows.push(held);
    dirty = true;
  }
  // 3. clear holds Amazon already settled (a day that is no longer in the ledger is simply not patched)
  for (const k of Object.keys(L)) if (k < daysAgo(LEDGER_KEEP_DAYS)) { delete L[k]; dirty = true; }
  if (dirty) await chrome.storage.local.set({ ledger });
}

function detectRewards(acct, prev, months) {
  if (!prev) return; // baseline
  const was = Object.fromEntries((prev.months || []).map((m) => [m.month, m.bonus]));
  for (const m of months) {
    if (!m.bonus) continue;
    const before = was[m.month] || 0;
    if (m.bonus <= before) continue;
    const [y, mo] = m.month.split('-').map(Number);
    const tiers = m.tiers || [];
    // which tier is this? (the one whose bonus matches; else the highest tier the shipped revenue reaches)
    let idx = tiers.findIndex((t) => t.bonus === m.bonus);
    if (idx < 0) idx = tiers.reduce((best, t, i) => (t.revenue <= m.shipped ? i : best), -1);
    const next = idx >= 0 ? tiers[idx + 1] : null;
    const label = `${MONTHS[mo - 1]} ${y}`;
    let title, body;
    if (idx >= 0) {
      title = `Creator Rewards: tier ${idx + 1} of ${tiers.length} reached (${money(m.bonus, 'USD')})`;
      body = `${label} · Bonus ${before ? `${money(before, 'USD')} → ${money(m.bonus, 'USD')}` : money(m.bonus, 'USD')}` +
        `${m.shipped ? ` · Shipped so far ${money(m.shipped, 'USD')}` : ''}. ` +
        (next ? `Next tier: ${money(next.revenue, 'USD')} shipped for ${money(next.bonus, 'USD')} (${money(Math.max(0, next.revenue - m.shipped), 'USD')} to go).` : 'You reached the top tier.') +
        ` · ${acct}`;
    } else { // tier table not readable: still say what changed
      title = `Creator Rewards: ${label} bonus ${money(m.bonus, 'USD')}`;
      body = before ? `Up ${money(m.bonus - before, 'USD')}: a higher tier was reached · ${acct}` : `A new Creator Rewards bonus was earned · ${acct}`;
    }
    pushEvent('rewards', title, body, { loc: 'US', acct, cur: 'USD', amount: m.bonus - before });
  }
}

// Signed-out alerts: one per episode (main account, or a separate country site), cleared once it works again.
async function authAlert(key, title, body, url) {
  const { authAlerts = {} } = await chrome.storage.local.get('authAlerts');
  if (authAlerts[key]) return;
  authAlerts[key] = Date.now();
  await chrome.storage.local.set({ authAlerts });
  pushEvent('signedout', title, body, { url, cur: null, amount: 0 });
  await persistNotify();
}
async function authClear(key) {
  const { authAlerts = {} } = await chrome.storage.local.get('authAlerts');
  if (authAlerts[key]) { delete authAlerts[key]; await chrome.storage.local.set({ authAlerts }); }
}

let desktopOk = null;
async function canDesktop() {
  if (desktopOk === null) { try { desktopOk = !!chrome.notifications && await chrome.permissions.contains({ permissions: ['notifications'] }); } catch { desktopOk = false; } }
  return desktopOk;
}
chrome.permissions?.onAdded?.addListener(() => { desktopOk = null; });
chrome.permissions?.onRemoved?.addListener(() => { desktopOk = null; });

// Save the snapshots and publish the events found so far (in-app list + optional desktop alerts).
async function persistNotify() {
  if (notifySnaps) {
    const old = Date.now() - 62 * 86400000;
    for (const k of Object.keys(notifySnaps)) if (notifySnaps[k].at < old) delete notifySnaps[k];
    await chrome.storage.local.set({ notifySnap: notifySnaps });
  }
  const ev = pendingEvents.splice(0);
  if (!ev.length) return;
  const { notif } = await chrome.storage.local.get('notif');
  const items = [...ev.reverse(), ...((notif && notif.items) || [])].slice(0, 200);
  await chrome.storage.local.set({ notif: { items, readAt: (notif && notif.readAt) || 0 } });
  if (notifyConf.desktop && await canDesktop()) {
    const icon = chrome.runtime.getURL('icons/icon128.png');
    if (ev.length <= 3) for (const e of ev) chrome.notifications.create(e.url ? `open:${encodeURIComponent(e.url)}:${e.id}` : e.id, { type: 'basic', iconUrl: icon, title: e.title, message: e.body, priority: 1 });
    else chrome.notifications.create(`sum-${Date.now()}`, { type: 'basic', iconUrl: icon, title: `Affilyatics: ${ev.length} new events`, message: ev.slice(0, 3).map((e) => e.title).join('\n'), priority: 1 });
  }
}

// ---- loading ------------------------------------------------------------------------------
let gen = 0;
async function setStatus(patch) {
  const { status } = await chrome.storage.local.get('status');
  await chrome.storage.local.set({ status: { ...(status || {}), ...patch } });
}

// Fetch one task; if Amazon rejects the cached tokens, get fresh ones and retry once.
async function runFetch(t, range) {
  const go = (ctx) => {
    if (t.dim === 'day') return fetchDay(ctx, t.acct, t.loc, range);
    if (t.dim === 'connections') return fetchConnections(ctx, t.acct, t.loc, range);
    if (t.dim === 'tagday') return fetchTagDays(ctx, t.acct, t.loc, range);
    return fetchTable(ctx, t.acct, t.loc, t.dim, range);
  };
  if (t.dim === 'rewards') return fetchRewards(t.acct, range, t.force);
  let ctx = await ctxFor(t.acct, t.base);
  try { return await go(ctx); }
  catch (e) {
    if (!(e instanceof StaleCtx)) throw e;
    await dropCtx(t.acct, t.base);
    ctx = await ctxFor(t.acct, t.base, { fresh: true });
    try { return await go(ctx); }
    catch (e2) { throw e2 instanceof StaleCtx ? new AuthError('Session expired') : e2; }
  }
}

async function load(req) {
  const my = ++gen;
  const st = await chrome.storage.local.get(['settings', 'cache']);
  const settings = { ...DEFAULTS, ...(st.settings || {}) };
  const cache = st.cache || {};
  const lic0 = await getLicense();
  if (!accountOk(lic0)) { await setStatus({ loading: false, needsSignIn: true }); return; }          // signing in is mandatory, Free included
  const pro = planOf(lic0) === 'pro';
  DUE_MIN = FEATURES[pro ? 'pro' : 'free'].autoRefreshMin - 0.5;
  notifyConf = { ...NOTIFY_DEFAULT, ...(settings.notify || {}) };
  if (!pro) { for (const k of Object.keys(notifyConf)) if (!FREE_NOTIFY.includes(k)) notifyConf[k] = false; }   // Free: orders, sign-outs, report problems; no desktop pop-ups
  notifySnaps = null;
  if (!pro) {
    if (req.period === 'custom' ? !FEATURES.free.customRange : !FREE_PERIODS.includes(req.period)) { req.period = 'month'; req.range = undefined; }          // (every period is free today; kept in case the Free list shrinks)
    req.locales = (req.locales || []).filter((l) => !SEPARATE_SITES[l]);
    req.dims = (req.dims || []).filter((d) => d !== 'tagday' && d !== 'cat' && d !== 'product');          // 'tag' (just the tracking-ID names) is still read so the Free tags menu can list them, grayed
  }
  const weekAgo = Date.now() - 7 * 86400000;
  for (const k of Object.keys(cache)) if (cache[k].at < weekAgo) delete cache[k];

  await setStatus({ loading: true, done: 0, total: 0, errors: [], error: null, startedAt: Date.now() });
  try {
    const { accounts, siteErrors } = await discoverAll(settings, req, pro);
    await chrome.storage.local.set({ accounts });
    await setStatus({ siteErrors: { ...siteErrors } });
    for (const loc of Object.keys(SEPARATE_SITES)) {
      const host = new URL(SEPARATE_SITES[loc]).host;
      if (siteErrors[loc] && /^Not signed in/.test(siteErrors[loc].message)) await authAlert(`site:${loc}`, `Signed out of ${host}`, `${LOCALES[loc].label} data is paused. Sign in at ${host} to resume.`, SEPARATE_SITES[loc]);
      else if (!siteErrors[loc]) await authClear(`site:${loc}`);
    }
    if (my !== gen) return;
    const freeStore = (accounts.find((a) => a.base === BASE) || {}).id;          // Free: ONE store, the main one (the first Amazon lists on the main Associates site)
    const accts = accounts.filter((a) => (pro || a.id === freeStore) && (!settings.accounts || settings.accounts.includes(a.id)) && (!req.accounts || req.accounts.includes(a.id)));   // Free: the main Associates site only   // req.accounts: the dashboard is looking at one store only

    const okRange = (r) => Array.isArray(r) && r.length === 2 && r.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) && r[0] <= r[1] && r[0] >= '2010-01-01';
    const range = req.period === 'custom' && okRange(req.range) ? req.range : rangeFor(req.period === 'custom' ? 'month' : req.period);
    // legacy name: "income" = daily numbers (bounties/bonus) + Creator Connections
    const wanted = new Set(req.dims.flatMap((d) => (d === 'income' ? ['day', 'connections'] : [d])));
    const tasks = [];
    let derivedAny = false;
    for (const loc of req.locales) for (const a of accts) {
      if (!a.locales.includes(loc)) continue;
      for (const dim of wanted) {
        if (dim === 'rewards' && loc !== 'US') continue;
        const key = `${a.id}|${loc}|${req.period}|${dim}`;
        const e = cache[key];
        // Refresh = re-check the numbers you look at. Quiet countries (checked hourly) and slow data
        // (Creator Rewards / Connections) are only re-downloaded when they are due.
        const forced = req.force && (dim === 'day' || dim === 'rewards' || dim === 'tag' || dim === 'tagday' || dim === 'cat' || dim === 'product'); // Refresh = everything, quiet countries included
        if (!forced && !isFresh(dim, e, range)) {
          const d = deriveFromWider(cache, a.id, loc, dim, range);
          if (d) { cache[key] = d; derivedAny = true; continue; } // no request needed
        }
        if (forced || !isFresh(dim, e, range)) tasks.push({ key, acct: a.id, base: a.base, loc, dim, force: !!forced });
      }
    }
    // Pending shipments card: always the trailing 90 days of daily numbers, whatever period is on screen
    // (kept under the pseudo period "pending"; derived from a wider cached range when possible, background priority).
    const pRange = rangeFor('last90');
    for (const loc of req.locales) for (const a of accts) {
      if (!a.locales.includes(loc)) continue;
      const key = `${a.id}|${loc}|pending|day`, e = cache[key];
      // the 90-day window changes slowly: re-fetch every 30 min, not every 5 (it would double the API calls of each cycle)
      const pFresh = e && e.v === CACHE_VERSION && e.range[0] === pRange[0] && e.range[1] === pRange[1] && Date.now() - e.at < 30 * 60000;
      if (!req.force && pFresh) continue;
      const d = req.force ? null : deriveFromWider(cache, a.id, loc, 'day', pRange);
      if (d) { cache[key] = d; derivedAny = true; continue; }
      tasks.push({ key, acct: a.id, base: a.base, loc, dim: 'day', range: pRange, pending: true, force: !!req.force });
    }
    if (derivedAny) await chrome.storage.local.set({ cache });
    const prio = (t) => (t.pending ? BACKGROUND_FROM : PRIORITY[t.dim]);
    tasks.sort((a, b) => prio(a) - prio(b)); // stable: country order is kept inside each group
    // Slow-changing "background" work (Creator Connections) must not hold up the progress bar:
    // the dashboard counts as loaded once everything else is in.
    const fgCount = tasks.filter((t) => prio(t) < BACKGROUND_FROM).length;
    await setStatus({ total: fgCount });

    const errors = [], deadBases = new Set();
    const newSiteErrors = { ...siteErrors };
    let done = 0, fetched = 0, settled = fgCount === 0;
    const settle = async () => {
      if (settled) return;
      settled = true;
      await setStatus({ loading: false, signedOut: false, ...(fetched ? { updatedAt: Date.now() } : {}), checkedAt: Date.now() });
      await authClear('main');
      await updateBadge();
    };

    const execTask = async (t) => {
      try {
        if (deadBases.has(t.base)) throw new AuthError('skip');
        const day = t.dim === 'connections' ? cache[`${t.acct}|${t.loc}|${req.period}|day`] : null;
        const idle = day && day.range[0] === range[0] && day.range[1] === range[1] && !hasActivity(day.rows);
        let res;
        if (idle) res = { rows: [] }; // no traffic = no Creator Connections income: skip the request
        else {
          res = await runFetch(t, t.range || range); fetched++;
          if (t.dim === 'day') { await guardDays(t, res, t.range || range); await persistNotify(); }
          if (req.period === 'month' && !t.pending) {
            if (t.dim === 'day') { await detectDay(t, res.rows, range); await persistNotify(); }
            else if (t.dim === 'connections') { await detectConn(t, res.rows, range); await persistNotify(); }
          }
        }
        const prev = cache[t.key];
        const entry = { v: CACHE_VERSION, at: Date.now(), range: t.range || range, rows: res.rows };
        if (t.dim === 'day') {
          entry.lu = res.lu || null;
          entry.luSince = prev && prev.lu && prev.lu === entry.lu ? (prev.luSince || prev.at) : Date.now();
          entry.active = hasActivity(res.rows);
        }
        cache[t.key] = entry;
        await chrome.storage.local.set({ cache });
      } catch (e) {
        if (e instanceof AuthError) {
          if (t.base === BASE) throw e;               // the main account: signed out
          deadBases.add(t.base);                       // a separate country site: report it, keep the rest
          newSiteErrors[t.loc] = { message: `Not signed in to ${new URL(t.base).host}`, url: t.base };
          await setStatus({ siteErrors: newSiteErrors });
          await authAlert(`site:${t.loc}`, `Signed out of ${new URL(t.base).host}`, `${LOCALES[t.loc].label} data is paused. Sign in at ${new URL(t.base).host} to resume.`, t.base);
        } else errors.push(e.message);
      }
      if (prio(t) < BACKGROUND_FROM) { done++; await setStatus({ done, errors: errors.slice(0, 5) }); if (done >= fgCount) await settle(); }
    };

    // Two lanes. API requests (rate-limited by Amazon) run strictly one after another; HTML pages
    // (login tokens for every store, Creator Rewards) are not rate-limited that way and load in parallel with them.
    const rewardTasks = tasks.filter((t) => t.dim === 'rewards');
    const apiTasks = tasks.filter((t) => t.dim !== 'rewards');
    for (const k of new Set(apiTasks.map((t) => `${t.acct}\n${t.base}`))) { const [acct, base] = k.split('\n'); ctxFor(acct, base).catch(() => {}); }
    await Promise.all([
      Promise.all(rewardTasks.map((t) => (my === gen ? execTask(t) : null))),
      (async () => { for (const t of apiTasks) { if (my !== gen) return; await execTask(t); } })()
    ]);
    if (my === gen) {
      settled = false; // finalize once more so `updatedAt`/badge also reflect the background tail
      await setStatus({ loading: false, signedOut: false, ...(fetched ? { updatedAt: Date.now() } : {}), checkedAt: Date.now() });
      await authClear('main');
      await updateBadge();
    }
  } catch (e) {
    if (my !== gen) return;
    const out = e instanceof AuthError;
    await setStatus({ loading: false, signedOut: out, error: out ? null : e.message });
    if (out) await authAlert('main', 'Signed out of Amazon Associates', 'Sign in at affiliate-program.amazon.com to resume updates. Data and alerts are paused until then.', BASE + '/home');
  }
}

// Toolbar icon badge: "!" (red) when signed out, otherwise the number of unread notifications. Follows storage, so it
// updates the moment an event is created or you open the bell panel (which marks everything as read).
async function updateBadge() {
  const { status, notif } = await chrome.storage.local.get(['status', 'notif']);
  const readAt = (notif && notif.readAt) || 0;
  const unread = ((notif && notif.items) || []).filter((i) => i.ts > readAt).length;
  const out = !!(status && status.signedOut);
  const text = out ? '!' : unread ? (unread > 99 ? '99+' : String(unread)) : '';
  chrome.action.setBadgeBackgroundColor({ color: out ? '#b42318' : '#ff9900' });
  try { await chrome.action.setBadgeTextColor?.({ color: out ? '#ffffff' : '#111111' }); } catch { /* older Chrome */ }
  chrome.action.setBadgeText({ text });
  try { await chrome.action.setTitle?.({ title: out ? 'Affilyatics: signed out of Amazon Associates' : unread ? `Affilyatics: ${unread} new notification${unread > 1 ? 's' : ''}` : 'Affilyatics' }); } catch { /* ignore */ }
}
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.notif || ch.status)) updateBadge(); });
updateBadge(); // restore the badge whenever the worker starts

// Keep the cache warm: the default view is refreshed on browser start and by the alarm (only due entries cost a request),
// so opening the dashboard almost never starts cold.
async function prewarm() {
  const { status, settings } = await chrome.storage.local.get(['status', 'settings']);
  if (status?.loading && Date.now() - (status.startedAt || 0) < 120000) return; // don't interrupt a popup-driven load
  const s = { ...DEFAULTS, ...(settings || {}) };
  const p = s.period === 'custom' ? 'month' : s.period;
  await load({ period: p, locales: s.countries, dims: ['day', 'connections', 'rewards'], force: false });
  // notifications compare this month's data, so it is always kept fresh even if another period is your default
  if (p !== 'month') await load({ period: 'month', locales: s.countries, dims: ['day', 'connections'], force: false });
}
// Earlier builds put "Sample alert" items in the bell: remove any left over.
async function purgeDemoNotifications() {
  const { notif } = await chrome.storage.local.get('notif');
  if (notif && (notif.items || []).some((i) => i.demo)) await chrome.storage.local.set({ notif: { ...notif, items: notif.items.filter((i) => !i.demo) } });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh', { periodInMinutes: REFRESH_MINUTES, delayInMinutes: 0.1 });
  chrome.alarms.create('license', { periodInMinutes: PLAN_CFG.recheckHours * 60, delayInMinutes: 0.2 });
  purgeDemoNotifications().catch(() => {});                     // removes any left-over sample alerts
});
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('refresh', { periodInMinutes: REFRESH_MINUTES }); chrome.alarms.create('license', { periodInMinutes: PLAN_CFG.recheckHours * 60 }); licenseCheckIfDue().catch(() => {}).then(prewarm); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'refresh') prewarm(); else if (a.name === 'license') licenseCheckIfDue(true).catch(() => {}); });

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.type === 'load') { load(msg); send({ ok: true }); }
  else if (msg?.type === 'license') {      // trial / activate / deactivate / refresh, asked from Settings -> Plan
    const a = msg.action;
    const run = a === 'login' ? signInPassword({ mode: msg.mode, email: String(msg.email || '').trim().slice(0, 190), password: String(msg.password || '').slice(0, 200) }) : a === 'google' ? signInGoogle()
      : a === 'authstart' ? authStart() : a === 'authpoll' ? authPoll() : a === 'authcancel' ? authCancel() : a === 'signout' ? signOut()
      : a === 'trial' ? licenseSync('trial')
      : a === 'redeem' ? licenseSync('redeem', { licenseKey: String(msg.key || '').trim().slice(0, 80) })
      : licenseCheckIfDue(a !== 'check');            // 'check' (dashboard opened): only if the answer is older than 12 h; 'refresh' ("Check again"): always
    run.then((r) => send(r), () => send({ ok: false, error: 'network' }));
    return true;
  }
  return false;
});

// Clicking the toolbar icon opens the dashboard in its own resizable window.
// The existing window is found by the page it shows (never by a remembered window id, which Chrome reuses).
const DASH_BASE = () => chrome.runtime.getURL('popup.html');
async function findDashboardWindow() {
  try {
    const ctxs = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
    return ctxs.find((c) => c.documentUrl && c.documentUrl.startsWith(DASH_BASE()) && c.windowId > 0)?.windowId ?? null;
  } catch { return null; }
}

// Every open dashboard (a popup window, or a tab if one was ever opened that way).
async function dashboardContexts() {
  try {
    const ctxs = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
    return ctxs.filter((c) => c.documentUrl && c.documentUrl.startsWith(DASH_BASE()) && c.tabId > 0);
  } catch { return []; }
}

// One dashboard at a time: clicking the icon closes ALL previous ones, then opens a single fresh window
// at the size/position you left it. (`opening` ignores a second click while this is in progress.)
let opening = false;
async function openDashboard() {
  if (opening) return;
  opening = true;
  try {
    const old = await dashboardContexts();
    if (old.length) {
      // remember where the window was before closing it
      try {
        const w = await chrome.windows.get(old[0].windowId);
        if (w.state === 'normal') await chrome.storage.local.set({ dashBounds: { width: w.width, height: w.height, left: w.left, top: w.top } });
      } catch { /* already gone */ }
      await chrome.tabs.remove([...new Set(old.map((c) => c.tabId))]).catch(() => {}); // closing a popup's last tab closes the window
    }
    const { dashBounds } = await chrome.storage.local.get('dashBounds');
    const b = dashBounds || {};
    const opts = { url: DASH_BASE() + '?full=1', type: 'popup', width: b.width || 1280, height: b.height || 900 };
    if (Number.isFinite(b.left) && Number.isFinite(b.top)) { opts.left = b.left; opts.top = b.top; }
    try { await chrome.windows.create(opts); }
    catch (e) { console.warn('[affilyatics] window create failed, opening a tab:', e.message); await chrome.tabs.create({ url: DASH_BASE() + '?full=1' }); }
  } finally { opening = false; }
}
chrome.action.onClicked.addListener(() => openDashboard());
// clicking a desktop alert opens the dashboard (the API only exists once the optional permission is granted)
chrome.notifications?.onClicked?.addListener((id) => {
  chrome.notifications.clear(id);
  if (id.startsWith('open:')) chrome.tabs.create({ url: decodeURIComponent(id.split(':')[1]) });
  else openDashboard();
});

chrome.windows.onBoundsChanged.addListener(async (w) => {
  if (w.state !== 'normal') return;
  if ((await findDashboardWindow()) === w.id) chrome.storage.local.set({ dashBounds: { width: w.width, height: w.height, left: w.left, top: w.top } });
});
