// License client, background worker only (importScripts after shared.js and plan.js).
// Talks to OUR license server, never to Amazon. It sends: a random installation id, the extension version, the license key
// (if you entered one) and, only if you opted in, a few anonymous counters. It never sends earnings, store ids or tags.

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

// route: 'status' | 'trial' | 'activate' | 'deactivate'. Returns { ok, error?, plan }.
async function licenseSync(route, extra = {}) {
  const installId = await ensureInstallId();
  let lic = await getLicense();
  const body = { installId, version: chrome.runtime.getManifest().version, ...extra };
  if (route === 'status') { if (lic.key) body.licenseKey = lic.key; const u = await usagePayload(); if (u) body.usage = u; }
  let resp;
  try { resp = await apiCall(route, body); }
  catch (e) { await saveLicense({ ...lic, lastError: e.message, lastTryAt: Date.now() }); return { ok: false, error: e.message, plan: planOf(lic) }; }
  if (resp.error && !resp.payload) return { ok: false, error: resp.error, plan: planOf(lic) };     // rejected before an answer was made (rate limit, bad request)
  let ent;
  try { ent = await verifySigned(resp, installId); }
  catch (e) { await saveLicense({ ...lic, lastError: e.message, lastTryAt: Date.now() }); return { ok: false, error: e.message, plan: planOf(lic) }; }
  lic = await getLicense();
  const next = { ...lic, installId, ent, checkedAt: Date.now(), lastError: null };
  if (route === 'activate' && resp.ok) next.key = extra.licenseKey;
  if (route === 'deactivate') delete next.key;
  if (route === 'trial' && extra.email) next.email = extra.email;
  await saveLicense(next);
  return { ok: resp.ok !== false, error: resp.error, plan: planOf(next) };
}

const licenseDue = (lic) => !lic.ent || !lic.checkedAt || Date.now() - lic.checkedAt > PLAN_CFG.recheckHours * 3600000 || planOf(lic) === 'free' && lic.ent.plan === 'pro';
async function licenseCheckIfDue(force = false) {
  const lic = await getLicense();
  if (force || licenseDue(lic) || (lic.lastTryAt && lic.lastError && Date.now() - lic.lastTryAt > 30 * 60000 && Date.now() - (lic.checkedAt || 0) > 3600000)) return licenseSync('status');
  return { ok: true, plan: planOf(lic) };
}
