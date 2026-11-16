// Account + license client, background worker only (importScripts after shared.js and plan.js).
// Talks to OUR server, never to Amazon. Sign-in is mandatory (even for Free): the extension opens our sign-in web page
// (Firebase: e-mail or Google), then collects its own account token by polling. It sends: a random installation id, the extension
// version, the account token, and, only if you opted in, a few anonymous counters. Never earnings, store ids or tags.

const LIC_KEY = 'license';
const getLicense = async () => (await chrome.storage.local.get(LIC_KEY))[LIC_KEY] || {};
const saveLicense = (l) => chrome.storage.local.set({ [LIC_KEY]: l });

async function ensureInstallId() {
  const lic = await getLicense();
  if (lic.installId) return lic.installId;
  const id = crypto.randomUUID();
  await saveLicense({ ...lic, installId: id });
  return id;
}

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let verifyKey = null;
// The server signs the exact JSON text it sends. Returns the entitlement object, or throws Error('bad_signature').
async function verifySigned(resp, installId) {
  try {
    if (!resp || typeof resp.payload !== 'string' || typeof resp.sig !== 'string') throw new Error('missing');
    verifyKey ||= await crypto.subtle.importKey('spki', fromB64(PLAN_CFG.publicKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', verifyKey, fromB64(resp.sig), new TextEncoder().encode(resp.payload));
    if (!ok) throw new Error('bad');
    const ent = JSON.parse(resp.payload);
    if (ent.installId !== installId) throw new Error('other install');   // an answer meant for another browser
    return ent;
  } catch (e) { throw new Error('bad_signature'); }
}

async function apiCall(route, body) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`${PLAN_CFG.api}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal, credentials: 'omit', cache: 'no-store' });
    const j = await r.json().catch(() => null);
    if (!j) throw new Error('server_error');
    return j;
  } catch (e) { throw new Error(e.message === 'server_error' ? 'server_error' : 'network'); }
  finally { clearTimeout(timer); }
}

// Only when the user ticked "Share anonymous usage" (Settings -> Plan): a few coarse counters, no names, no amounts.
async function usagePayload() {
  const st = await chrome.storage.local.get(['settings', 'accounts', 'viewState']);
  if (!st.settings || !st.settings.shareUsage) return undefined;
  const v = st.viewState || {};
  return {
    stores: (st.accounts || []).length, countries: (st.settings.countries || []).length,
    desktopAlerts: !!(st.settings.notify && st.settings.notify.desktop), tagFilter: Array.isArray(v.tags) && v.tags.length > 0,
    customRange: v.period === 'custom', dark: st.settings.theme === 'dark', period: typeof v.period === 'string' ? v.period : undefined
  };
}

const randomHex = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
const AUTH_ERRORS = ['unauthorized', 'blocked'];

// ---- sign in -----------------------------------------------------------------------------------------
// 1. authStart: tell the server a sign-in is coming, open the web page with the nonce. 2. authPoll: every few seconds until it is done.
async function authStart() {
  const installId = await ensureInstallId();
  const nonce = randomHex(16);
  let r;
  try { r = await apiCall('auth-start', { installId, nonce, version: chrome.runtime.getManifest().version }); } catch (e) { return { ok: false, error: e.message }; }
  if (!r.ok) return { ok: false, error: r.error || 'server_error' };
  const lic = await getLicense();
  await saveLicense({ ...lic, pending: { nonce, at: Date.now(), code: r.code }, lastError: null });
  try { await chrome.tabs.create({ url: `${PLAN_CFG.signinUrl}?nonce=${nonce}` }); } catch (_) { /* the popup shows the code and a button to try again */ }
  return { ok: true, code: r.code };
}
async function authCancel() { const lic = await getLicense(); delete lic.pending; await saveLicense(lic); return { ok: true }; }
async function authPoll() {
  let lic = await getLicense();
  if (accountOk(lic)) return { ok: true, done: true };
  const p = lic.pending;
  if (!p) return { ok: true, pending: false };
  if (Date.now() - p.at > 10 * 60000) { delete lic.pending; await saveLicense({ ...lic, lastError: 'sign_in_expired' }); return { ok: false, error: 'sign_in_expired' }; }
  let r;
  try { r = await apiCall('auth-poll', { installId: lic.installId, nonce: p.nonce }); } catch (e) { return { ok: true, pending: true, offline: true }; }
  if (r.status === 'pending') return { ok: true, pending: true };
  if (r.status !== 'done' || !r.accountToken) { delete lic.pending; await saveLicense({ ...lic, lastError: 'sign_in_expired' }); return { ok: false, error: 'sign_in_expired' }; }
  lic = await getLicense(); delete lic.pending;
  await saveLicense({ ...lic, account: { token: r.accountToken, exp: r.accountExp * 1000, email: r.user && r.user.email, name: r.user && r.user.name }, lastError: null });
  const s = await licenseSync('status');                 // fetch the plan (Free, trial, or a license bought with this e-mail)
  return { ok: true, done: true, plan: s.plan };
}
async function signOut() {
  const lic = await getLicense();
  await saveLicense({ installId: lic.installId, lastError: null });          // forget account, plan and any pending sign-in
  return { ok: true };
}

// ---- plan: 'status' | 'trial' | 'redeem' ----------------------------------------------------------------
// Returns { ok, error?, plan }. A refused or expired account token signs the browser out (the dashboard shows the sign-in screen).
async function licenseSync(route, extra = {}) {
  const installId = await ensureInstallId();
  let lic = await getLicense();
  if (!accountOk(lic)) return { ok: false, error: 'unauthorized', plan: 'free' };
  const body = { installId, version: chrome.runtime.getManifest().version, accountToken: lic.account.token, ...extra };
  if (route === 'status') { const u = await usagePayload(); if (u) body.usage = u; }
  let resp;
  try { resp = await apiCall(route, body); }
  catch (e) { await saveLicense({ ...lic, lastError: e.message, lastTryAt: Date.now() }); return { ok: false, error: e.message, plan: planOf(lic) }; }
  if (AUTH_ERRORS.includes(resp.error)) {
    lic = await getLicense();
    await saveLicense({ installId, lastError: resp.error });                 // signed out: the gate explains why
    return { ok: false, error: resp.error, plan: 'free' };
  }
  if (resp.error && !resp.payload) return { ok: false, error: resp.error, plan: planOf(lic) };     // rejected before an answer was made (rate limit, bad request)
  let ent;
  try { ent = await verifySigned(resp, installId); }
  catch (e) { await saveLicense({ ...lic, lastError: e.message, lastTryAt: Date.now() }); return { ok: false, error: e.message, plan: planOf(lic) }; }
  lic = await getLicense();
  const next = { ...lic, installId, ent, checkedAt: Date.now(), lastError: null };
  if (resp.accountToken) next.account = { ...(lic.account || {}), token: resp.accountToken, exp: resp.accountExp * 1000, email: (ent.user && ent.user.email) || (lic.account && lic.account.email), name: (ent.user && ent.user.name) || (lic.account && lic.account.name) };
  await saveLicense(next);
  return { ok: resp.ok !== false, error: resp.error, plan: planOf(next) };
}

const licenseDue = (lic) => !lic.ent || !lic.checkedAt || Date.now() - lic.checkedAt > PLAN_CFG.recheckHours * 3600000 || (planOf(lic) === 'free' && lic.ent.plan === 'pro');
async function licenseCheckIfDue(force = false) {
  const lic = await getLicense();
  if (!accountOk(lic)) return { ok: false, error: 'unauthorized', plan: 'free' };
  if (force || licenseDue(lic) || (lic.lastTryAt && lic.lastError && Date.now() - lic.lastTryAt > 30 * 60000 && Date.now() - (lic.checkedAt || 0) > 3600000)) return licenseSync('status');
  return { ok: true, plan: planOf(lic) };
}
