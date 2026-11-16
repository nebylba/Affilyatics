# Chrome Web Store listing: Affilyatics

Everything to paste into the Developer Dashboard. Screenshots are in this folder (1280x800, made from the live demo with
`?bar=0`; regenerate them with headless Chrome after UI changes). Upload `Affilyatics.com.zip` made by `python tools/package.py`.

## Basics
- **Name:** Affilyatics
- **Category:** Productivity (alternative: Shopping)
- **Language:** English
- **Short description** (manifest `description`, 132 characters max):
  Your Amazon Associates earnings in one click: all stores and countries, live up to today, with alerts. Free, with a Pro plan.
- **Website:** https://eblyn.com/Affilyatics/  (after the move: https://affilyatics.com/)
- **Support email:** contact@eblyn.com  (after the move: contact@affilyatics.com)
- **Privacy policy URL:** https://eblyn.com/Affilyatics/privacy/

## Detailed description
Everything you need to know with one click.

Affilyatics is a live dashboard for your Amazon Associates business. It reads your own reports through the Amazon Associates
session you are already signed in to (it never asks for your password) and puts every store and every country on one screen.

EVERY STORE. EVERY COUNTRY.
All your stores and marketplaces in one place, each country in its own currency. Filter by store, country or tag: each filter
only offers what the previous one leaves.

EVERY ALERT.
A bell with new orders, commissions, bonuses and Creator Rewards tiers, and sign-out or report warnings. Optional desktop pop-ups.

LIVE TO TODAY.
Today's clicks, orders and earnings refresh while your browser is open, so you see how the day is going as it happens.

AND MUCH MORE
- Total income card: commissions, bounties, bonuses, Creator Connections and Creator Rewards, with the tier you are in
- Interactive chart, countries and dates tables, tracking IDs, categories and products
- Honest estimates: pending shipments and returns are marked with "~" and explained
- Report-gap protection when Amazon's report drops a recent day
- Light and dark mode, filters remembered between visits

FREE AND PRO
Pro is $7.99 per month, $79.90 per year (two months free), or $199 once (Lifetime; $129 for the first 10 buyers).
Free: 1 store (your main store) with all its countries, total income, chart, countries and dates tables, today,
yesterday, this month, last 7/30 days, quarters, years and custom date ranges, alerts for new orders / sign-outs / report problems, updates every 30 minutes.
Pro and Lifetime: unlimited stores, tag filters, tracking ID / category / product tables, Creator Rewards tiers and
enrollment alerts, all alert types and desktop pop-ups, other Associates sites, report-gap protection, updates every 5 minutes.
A free account (email or Google) is required. Try Pro free for 14 days, no credit card required. Refund of the current month in full, no questions asked.

ACCOUNT
You sign in once with your email or Google (the sign-in page is on our website and handled by Google Firebase). The extension does not work without an account, Free plan included.

PRIVACY
Your earnings, stores and tags stay in your browser. They are never sent to us. The only thing the extension sends to our
license server is a random installation id, the extension version and your plan (plus a license key or an optional email if
you enter one, and anonymous counters only if you turn that on).

Affilyatics is an independent product. It is not affiliated with, endorsed by or sponsored by Amazon.

## Single purpose (required field)
Show the user's own Amazon Associates earnings and reports in one dashboard, with alerts.

## Permission justifications
- **storage:** keeps the cached figures, the user's settings and filters, the alerts list and the plan answer on the user's device.
- **alarms:** refreshes the figures (every 5 minutes on Pro, 30 on Free) and re-checks the plan about every 12 hours while the browser is open.
- **declarativeNetRequest:** adds the headers that Amazon's own report pages expect when the extension reads the user's reports.
- **notifications (optional, asked only when the user turns on desktop alerts):** desktop pop-ups for new orders and alerts.
- **identity:** opens Chrome's built-in Google sign-in window (`launchWebAuthFlow`) so people can sign in with Google without leaving the extension.
- **Host permission** `https://identitytoolkit.googleapis.com/*`: Firebase Authentication (email + password sign-in, verification and password-reset emails) from the extension's own sign-in form.
- **Host permissions** `https://affiliate-program.amazon.com/*`, `https://associates.amazon.ca/*`: read the user's own Associates reports with their signed-in session. No other site is accessed.
- **Remote code:** none. All code is in the package.

## Privacy practices tab (data disclosure)
- Collects: **Personally identifiable information** (email address, name if Google sign-in, a Firebase user id: needed because an account is required), **Authentication information** (sign-in is done on the developer's web page with Google Firebase; the extension stores only a token made by the developer's server; license key if entered), **Website content / user activity**: none leaves the device (Amazon report data is processed locally and never transmitted to the developer).
- Certify: data is not sold; not used for purposes unrelated to the item's single purpose; not used for creditworthiness or lending.
- Data sent to the developer's server: account token, random installation id, extension version, plan, license key (if entered), anonymous counters (opt-in, off by default). Account creation (email or Google) happens on https://eblyn.com/Affilyatics/signin/ and is processed by Google Firebase.

## Images
- `screenshot-1-dashboard-dark.png`, `screenshot-2-dashboard-light.png`, `screenshot-3-free-plan.png` (1280x800)
- Small promo tile 440x280 and marquee 1400x560 are optional: make them from the logo on #14244a with the headline
  "Every store. Every country. Every alert. Live up to today."

## Before submitting (see also ../docs/CHECKLIST in the owner's folder)
1. `python tools/package.py` (checks the manifest, description length and files).
2. Make sure `plan.js` has the **production** public key (the private key on the server must be the matching one).
3. Make sure `PLAN_CFG.api` points at the final domain: changing it later means a new store version.
4. Test the zip as an unpacked extension in a clean Chrome profile: start a trial, check the Pro features unlock, remove the license.
