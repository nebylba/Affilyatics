// Free / Pro plans. Shared by the background worker (importScripts) and the dashboard (<script>).
//
// How it works: the license server (our backend) tells each installation which plan it has and signs that answer.
// The background worker verifies the signature, stores the answer in chrome.storage.local ("license") and re-checks about
// every 12 hours. Everything below only READS that stored answer, so a browser that is offline keeps its plan until the
// answer's own "validUntil" date (a few days), then falls back to Free. Nothing about your Amazon data is ever sent.

const PLAN_CFG = {
  // Where the license server lives. Changing the domain later means releasing an extension update.
  api: 'https://affilyatics.com/api/v1',
  // Public half of the signing key (base64 SPKI). The matching private key lives only on the server (php _lib/make-keys.php).
  publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxceWprn33HVNKGLIxsVn/HMsuSwaGcnIINdYR2YDRZai/j00oxzirfY6fKuBq8TlTu+1P8zOGaj/f3OpCNMp90ONaIRBCgh6tRmT8jay/RErYebX4+j5zmnIjm3pcWvdLgWdnfV5PtsO/s9jD0GkuZ5CqIdBAgSNaMAY3cK4hGKe9ljX+avyIRE9clie3PbuavM2q6KlHnPSQn+/R8u+LmbD01o9q0ZOFW2kOOl9rM7zVO9aznx7s2/7mpZeYE9rJ6OFj1i9yqW7za6JIhZZnWD/nOSuK9MMbm0QnY3XHVEgEE7xUl4tP3ejzdR8261V9n/B8WNMZ4FVHXu2SFe8fQIDAQAB',
  // Public web API key of the Firebase project (not a secret). Used for the sign-in forms inside the extension.
  firebase: { apiKey: 'AIzaSyBAkaKazUQKafNcPhzwua22S1ePH3UHe90' },
  // OAuth "Web client" id used for Google sign-in inside the extension (Google Cloud -> Credentials; see docs/Firebase-setup.md). Empty = Google button explains it is not set up.
  googleClientId: '497058350733-c6893gmjo8crvvm8no2cosk5vq9r4pcb.apps.googleusercontent.com',
  signinUrl: 'https://affilyatics.com/signin/',      // the page where people sign in (Firebase: email or Google)
  pricingUrl: 'https://affilyatics.com/#plans',     // where "Upgrade" goes (a Freemius checkout link once the product exists)
  privacyUrl: 'https://affilyatics.com/privacy/',
  contactEmail: 'contact@eblyn.com',                       // support address shown in the footer of the sign-in screen
  trialDays: 14,
  recheckHours: 0.25            // the worker asks the server about the plan every 15 minutes (and the open window every 20 seconds)
};

// Signed in? (an account token that the server made for this browser and has not run out). Everything needs it, Free included.
const accountOk = (lic, now = Date.now()) => !!(lic && lic.account && lic.account.token && now < lic.account.exp);

const FREE_PERIODS = typeof PERIODS !== 'undefined' ? PERIODS.map((p) => p.id) : ['today', 'yesterday', 'last7', 'last30', 'month', 'lastMonth', 'quarter', 'lastQuarter', 'year', 'lastYear'];   // every period is free; custom ranges too
const FREE_NOTIFY = ['orders', 'signedout', 'dataissue'];
const FEATURES = {
  free: { stores: 1, periods: FREE_PERIODS, customRange: true, tags: false, tabs: ['countries', 'dates'], otherSites: false, rewardsTier: false, gapGuard: false, desktop: false, notify: FREE_NOTIFY, autoRefreshMin: 30 },
  pro:  { stores: null, periods: null, customRange: true, tags: true, tabs: null, otherSites: true, rewardsTier: true, gapGuard: true, desktop: true, notify: null, autoRefreshMin: 5 }
};

// What the stored answer allows right now (it may have run out since it was written).
function planOf(lic, now = Date.now()) {
  const e = lic && lic.ent;
  if (!e || e.plan !== 'pro') return 'free';
  const t = (s) => (s ? Date.parse(s) : Infinity);
  if (!(now < t(e.validUntil))) return 'free';                       // not re-confirmed by the server for too long
  if (e.source === 'trial' && !(now < t(e.trialEndsAt))) return 'free';
  if (e.source !== 'trial') { const end = e.accessUntil || e.expiresAt; if (end && !(now < t(end))) return 'free'; }   // accessUntil = the end plus a short grace for a late renewal
  return 'pro';
}
const featuresFor = (lic, now) => FEATURES[planOf(lic, now)];

// Everything the interface needs to describe the plan in words.
function planInfo(lic, now = Date.now()) {
  const plan = planOf(lic, now), e = (lic && lic.ent) || {};
  const day = 86400000;
  const out = { plan, source: plan === 'pro' ? e.source : null, daysLeft: null, cancelled: !!e.cancelled, reason: e.reason || null, trialEnded: false, cycle: e.cycle || null, pastDue: false, expiresAt: (plan === 'pro' && e.expiresAt) || null };
  if (plan === 'pro' && e.source === 'trial') out.daysLeft = Math.max(0, Math.ceil((Date.parse(e.trialEndsAt) - now) / day));
  if (plan === 'pro' && e.expiresAt) { out.daysLeft = Math.max(0, Math.ceil((Date.parse(e.expiresAt) - now) / day)); out.pastDue = e.source !== 'trial' && now >= Date.parse(e.expiresAt); }
  if (plan === 'free' && (e.reason === 'trial_ended' || (e.source === 'trial' && e.trialEndsAt && Date.parse(e.trialEndsAt) <= now))) out.trialEnded = true;
  return out;
}

const PLAN_MESSAGES = {
  trial_used: 'This browser already used its free trial.',
  trial_used_email: 'That email address already used a free trial.',
  invalid_key: 'That license key was not recognised. Check it and try again.',
  license_ended: 'That license has ended.',
  refunded: 'That license was refunded and no longer works.',
  license_other_account: 'That license key already belongs to another account. Write to us if it is yours.',
  unauthorized: 'Please sign in again.',
  wrong_credentials: 'Wrong email or password.',
  email_exists: 'There is already an account with this email. Sign in instead.',
  invalid_email: 'That email address does not look right.',
  weak_password: 'Choose a password of at least 8 characters.',
  too_many_attempts: 'Too many tries. Wait a few minutes and try again.',
  provider_disabled: 'This sign-in method is not enabled yet.',
  user_disabled: 'This account is disabled. Please contact support.',
  google_cancelled: 'The Google window was closed before finishing.',
  google_failed: 'Google sign-in did not complete. Try again, or use your email.',
  google_not_set_up: 'Google sign-in is not set up yet. Use your email for now.',
  not_configured: 'Sign-in is not configured yet.',
  firebase_error: 'The sign-in service had a problem. Please try again.',
  bad_token: 'We could not verify your sign-in. Please try again.',
  wrong_project: 'Sign-in is misconfigured on our side. Please contact support.',
  no_email: 'Your account has no email address.',
  blocked: 'This account is blocked. Please contact support.',
  sign_in_expired: 'The sign-in took too long. Please try again.',
  email_unverified: 'Your email is not verified yet.',
  rate_limited: 'Too many tries. Please wait a little and try again.',
  network: 'Could not reach the license server. Check your connection and try again.',
  bad_signature: 'The answer from the license server could not be verified.',
  server_error: 'The license server had a problem. Please try again later.'
};
const planMessage = (code) => PLAN_MESSAGES[code] || 'Something went wrong. Please try again.';

// Which feature asked for an upgrade -> the sentence shown to the user.
const UPSELL = {
  periods: ['Every period', 'Free shows Today, Yesterday, This month and Last month. Pro adds the last 7 and 30 days, quarters, years and the previous ones.'],
  custom: ['Custom date ranges', 'Pick any start and end date with the calendar. Included in Pro.'],
  tags: ['Tag filters', 'Filter every card, total and chart by tracking ID, with the real daily clicks per tag. Included in Pro.'],
  tabs: ['Tracking IDs, categories and products', 'See what earns: your tracking IDs, product categories and best products. Included in Pro.'],
  stores: ['Unlimited stores', 'Free includes one store: your main store, the first one Amazon lists. Pro and Lifetime include all your stores, with a menu to switch between them or combine them.'],
  sites: ['Other Associates sites', 'Add the accounts that live on a separate Associates site (for example a regional one). Free covers one Associates account with all its stores and countries.'],
  rewards: ['Creator Rewards tiers and alerts', 'See your tier, how much is left to the next one, and get alerts when you tier up or must enroll. Included in Pro.'],
  desktop: ['Desktop alerts', 'Get a pop-up on your desktop for every new order and alert. Included in Pro.'],
  notify: ['More alert types', 'Free alerts you about new orders, sign-outs and Amazon report problems. Pro adds commissions, bonuses, Creator Rewards, Creator Connections and more.'],
  refresh: ['5-minute updates', 'Free checks Amazon every 30 minutes. Pro checks every 5 minutes, so you see today as it happens.'],
  plan: ['Affilyatics Pro', 'Every period, tag filters, Creator Rewards tiers, desktop alerts, report-gap protection and 5-minute updates.']
};
