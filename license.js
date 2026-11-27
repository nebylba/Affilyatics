// Account + license client, background worker only (importScripts after shared.js and plan.js).
// Talks to OUR server, never to Amazon. Sign-in is mandatory (even for Free): the extension opens our sign-in web page
// (Firebase: email or Google), then collects its own account token by polling. It sends: a random installation id, the extension
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
let verifyKeys = null;
// The server signs the exact JSON text it sends. Returns the entitlement object, or throws Error('bad_signature').
async function verifySigned(resp, installId) {
  try {
    if (!resp || typeof resp.payload !== 'string' || typeof resp.sig !== 'string') throw new Error('missing');
    verifyKeys ||= await Promise.all([PLAN_CFG.publicKey, PLAN_CFG.publicKeyNext].filter(Boolean)
      .map((k) => crypto.subtle.importKey('spki', fromB64(k), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])));
    const sig = fromB64(resp.sig), data = new TextEncoder().encode(resp.payload);
    let ok = false;
    for (const key of verifyKeys) { if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)) { ok = true; break; } }
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
  const s = await licenseSync('status');                 // fetch the plan (Free, trial, or a license bought with this email)
  return { ok: true, done: true, plan: s.plan };
}
async function signOut() {
  const lic = await getLicense();
  await saveLicense({ installId: lic.installId, lastError: null });          // forget account, plan and any pending sign-in
  return { ok: true };
}

// ---- sign-in INSIDE the extension: Firebase Authentication over its REST API (email + password) and Google through Chrome's own
// sign-in window (chrome.identity). Either way we end up with a Firebase ID token, which only our server sees; it answers with our account token.
const FB_ERR = { INVALID_LOGIN_CREDENTIALS: 'wrong_credentials', INVALID_PASSWORD: 'wrong_credentials', EMAIL_NOT_FOUND: 'wrong_credentials', EMAIL_EXISTS: 'email_exists', INVALID_EMAIL: 'invalid_email', MISSING_EMAIL: 'invalid_email', MISSING_PASSWORD: 'weak_password', WEAK_PASSWORD: 'weak_password', USER_DISABLED: 'user_disabled', TOO_MANY_ATTEMPTS_TRY_LATER: 'too_many_attempts', OPERATION_NOT_ALLOWED: 'provider_disabled', INVALID_IDP_RESPONSE: 'google_failed' };
async function fbCall(method, body) {
  if (!PLAN_CFG.firebase || !PLAN_CFG.firebase.apiKey) throw new Error('not_configured');
  let r, j;
  try { r = await fetch(`https://identitytoolkit.googleapis.com/v1/${method}?key=${PLAN_CFG.firebase.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store' }); j = await r.json(); }
  catch (e) { throw new Error('network'); }
  if (!r.ok) { const m = (j.error && j.error.message) || ''; const k = Object.keys(FB_ERR).find((x) => m.startsWith(x)); throw new Error(k ? FB_ERR[k] : 'firebase_error'); }
  return j;
}
// A Firebase ID token -> our server -> account token (stored), then the plan is fetched.
// A Google profile picture, kept only in this browser to show the avatar (never sent to our server). Only Google's own picture hosts are accepted.
const cleanPicture = (u) => { try { const x = new URL(String(u)); return x.protocol === 'https:' && /(^|\.)(googleusercontent|ggpht)\.com$/.test(x.hostname) ? x.href : null; } catch (_) { return null; } };
async function acceptLogin(idToken, extra = {}) {
  const installId = await ensureInstallId();
  let r;
  try { r = await apiCall('auth-login', { installId, idToken, version: chrome.runtime.getManifest().version }); } catch (e) { return { ok: false, error: e.message }; }
  if (!r.ok || !r.accountToken) return { ok: false, error: r.error || 'server_error' };
  const lic = await getLicense(); delete lic.pending;
  await saveLicense({ ...lic, account: { token: r.accountToken, exp: r.accountExp * 1000, email: r.user && r.user.email, name: r.user && r.user.name, picture: cleanPicture(extra.picture) }, lastError: null });
  const s = await licenseSync('status');
  return { ok: true, plan: s.plan };
}
// mode: 'in' | 'up' (create account) | 'resend' (verification email again) | 'reset' (password reset email)
async function signInPassword({ mode, email, password }) {
  try {
    if (!email || (mode !== 'reset' && !password)) return { ok: false, error: mode === 'reset' ? 'invalid_email' : 'wrong_credentials' };
    if (mode === 'reset') { await fbCall('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email }); return { ok: true, info: 'reset_sent' }; }
    if (mode === 'up') {
      if (password.length < 8) return { ok: false, error: 'weak_password' };
      const fb = await fbCall('accounts:signUp', { email, password, returnSecureToken: true });
      await fbCall('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: fb.idToken });
      return { ok: false, error: 'verify_needed' };
    }
    const fb = await fbCall('accounts:signInWithPassword', { email, password, returnSecureToken: true });
    if (mode === 'resend') { await fbCall('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: fb.idToken }); return { ok: true, info: 'verify_resent' }; }
    const r = await acceptLogin(fb.idToken);
    if (!r.ok && r.error === 'email_unverified') {
      try { await fbCall('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: fb.idToken }); } catch (_) { /* too soon: the button can resend */ }
      return { ok: false, error: 'verify_needed' };
    }
    return r;
  } catch (e) { return { ok: false, error: e.message }; }
}
const b64uJson = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
async function signInGoogle() {
  if (!PLAN_CFG.googleClientId) return { ok: false, error: 'google_not_set_up' };
  const redirect = chrome.identity.getRedirectURL(), nonce = randomHex(16);
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: PLAN_CFG.googleClientId, response_type: 'id_token', redirect_uri: redirect, scope: 'openid email profile', nonce, prompt: 'select_account' });
  let back;
  try { back = await chrome.identity.launchWebAuthFlow({ url, interactive: true }); }
  catch (e) { return { ok: false, error: /did not approve|closed|cancel/i.test(String(e && e.message)) ? 'google_cancelled' : 'google_failed', detail: String(e && e.message) }; }
  try {
    const idt = new URLSearchParams((back || '').split('#')[1] || '').get('id_token');
    if (!idt || b64uJson(idt.split('.')[1]).nonce !== nonce) throw new Error('bad');
    const fb = await fbCall('accounts:signInWithIdp', { postBody: `id_token=${idt}&providerId=google.com`, requestUri: redirect, returnIdpCredential: true, returnSecureToken: true });
    return await acceptLogin(fb.idToken, { picture: b64uJson(idt.split('.')[1]).picture });
  } catch (e) { return { ok: false, error: /^[a-z_]+$/.test(e.message) && e.message !== 'bad' ? e.message : 'google_failed' }; }
}

// ---- push: the server can tell this browser "your plan changed" (a gift, a purchase, a trial change) and it asks at once ----------
// Registers with Chrome's gcm API once; the token goes to our server with each plan check. No push (offline, blocked)? The normal checks still run.
async function ensurePush() {
  try {
    if (!chrome.gcm || !PLAN_CFG.gcmSenderId) return null;
    const { pushId } = await chrome.storage.local.get('pushId');
    if (pushId) return pushId;
    const id = await new Promise((res) => chrome.gcm.register([PLAN_CFG.gcmSenderId], (r) => res(chrome.runtime.lastError ? null : r)));
    if (id) await chrome.storage.local.set({ pushId: id });
    return id || null;
  } catch (_) { return null; }
}

// ---- plan: 'status' | 'trial' | 'redeem' ----------------------------------------------------------------
// Returns { ok, error?, plan }. A refused or expired account token signs the browser out (the dashboard shows the sign-in screen).
async function licenseSync(route, extra = {}) {
  const installId = await ensureInstallId();
  let lic = await getLicense();
  if (!accountOk(lic)) return { ok: false, error: 'unauthorized', plan: 'free' };
  const body = { installId, version: chrome.runtime.getManifest().version, accountToken: lic.account.token, ...extra };
  if (route === 'status') { const u = await usagePayload(); if (u) body.usage = u; const p = await ensurePush(); if (p) body.push = p; }
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
