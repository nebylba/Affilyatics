# Plans and licensing (v5)

## Files
- `plan.js` (shared): `PLAN_CFG` (API address, **public key**, pricing URL), `FEATURES` (free/pro), `planOf(lic)`, `planInfo(lic)`, `UPSELL` copy, `planMessage(code)`.
- `license.js` (worker only): `ensureInstallId`, `verifySigned` (RSASSA-PKCS1-v1_5 / SHA-256 via WebCrypto), `apiCall`, `licenseSync(route, extra)`, `licenseCheckIfDue`.
- `background.js`: gating inside `load()` (`pro` flag), `dueAfterMs` (`DUE_MIN`), `discoverAll(..., pro)`, `guardDays` (Pro only), license alarm (12 h) and the `license` message (`trial`, `activate`, `deactivate`, `check`, `refresh`).
- `popup.js`: `isProNow`, `setAccounts`, `periodOk`, `tabOk`, `clampView`, `openUpsell`, `planCardHTML`, `upsellHTML`, `planBannerHTML`, `planAction`; locked controls carry `data-lock="<feature>"`.
- Backend: `eblyn.com/Affilyatics/_lib` (`lib.php`, `schema.sql`, `setup.php`, `cleanup.php`, `make-keys.php`), `api/v1/index.php`, `admin/*`.

## Storage
`chrome.storage.local.license = { installId, key?, email?, ent, checkedAt, lastError?, lastTryAt? }` where `ent` is the verified server answer:
`{ plan: 'free'|'pro', source: 'trial'|'license'|'comp'|null, trialEndsAt, expiresAt, validUntil, cycle, cancelled, reason, installId, issuedAt }`.
`planOf` returns `pro` only while `now < validUntil` (server contact grace, 7 days) and the trial / license end date has not passed.
Settings: `settings.shareUsage` (opt-in counters), `settings.dismissTrialEnded`.

## API (POST JSON, `${PLAN_CFG.api}/<route>`)
| route | body | effect |
|---|---|---|
| `status` | installId, version, licenseKey?, usage? | signed entitlement; records a check-in |
| `trial` | installId, version, email? | starts the 14-day trial (one per install, one per e-mail) |
| `activate` | installId, version, licenseKey | binds a key to this install (seats) |
| `deactivate` | installId, licenseKey | frees the seat |
| `freemius` | Freemius event, `X-Signature` = HMAC-SHA256(body, secret key) | creates/updates licenses and payments |

Answer: `{ ok, error?, payload, sig }`; `payload` is the JSON text the server signed (RSA, private key on the server), `sig` is base64.
The client rejects an answer whose signature fails or whose `installId` is not its own. Errors: `trial_used`, `trial_used_email`,
`invalid_key`, `license_ended`, `refunded`, `seats_full`, `rate_limited`, `bad_signature`, `network`.

## Free vs Pro (single source: `FEATURES` in plan.js, `FREE_PERIODS`, `FREE_NOTIFY`)
| | Free | Pro |
|---|---|---|
| Associates sites | main site (all stores and countries) | + separate regional sites (Canada) |
| Periods | today, yesterday, month, last month | all + custom range |
| Tags filter, Tracking IDs / Categories / Products tabs | locked | yes |
| Creator Rewards tier line + enrollment alerts | locked | yes |
| Alerts | orders, signed-out, report issues (bell only) | all types + desktop pop-ups |
| Report-gap protection (`guardDays`) | off | on |
| Auto refresh | due after ~30 min | due after ~5 min |

Free is enforced both in the popup (locks, `clampView`) and in the worker (`load()` clamps period, locales and dims, skips
other sites, filters accounts, switches alerts off), so a stale view or a request from an old popup cannot pull Pro data.

## Testing
No test runner in the repo. The suites used during development (Node `vm` harnesses, kept outside the repo) cover: plan logic
(`planOf`), worker as Free and as Pro (`plan-test`), popup as Free (locks, upsell, trial flow, expiry clamp: `plan-popup-test`),
and the real `license.js` against the real PHP server with signature verification (`license-client-test`).
Backend checked by hand with curl and signed fake Freemius webhooks.

## Known limits
- Freemius webhook field names follow its documentation, not a captured real event: verify with the first test purchase.
- A user can patch the extension locally to unlock Pro: unavoidable for a free extension.
- `PLAN_CFG.api` is baked into the extension: moving the server to another domain needs a new store version.
