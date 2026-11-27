# Changelog

Newest first. Dates are when the change was made.

## 2026-11-27

- **Release 5.1.1**: licence answers are accepted when signed with either the current licence key or the next one, so the server can change keys later without another release. No change in behaviour or permissions.

## 2026-11-25

- **New README**: logo, hero image, screenshots, features, Free/Pro table, install, privacy, file map and docs links; images in `docs/images/` (including `social-preview.png`, 1280x640, for GitHub's Social preview setting).
- **Store material moved out of this public repo**: the `store/` folder (listing texts, screenshots, resubmission guide) now lives, complete, in the private website repo (`Affilyatics.com/chrome-store/`, never deployed). It is no longer here.
- **Licence added**: `LICENSE` (Affilyatics Source-Available License 1.0: read and run unmodified, no redistribution, no bypassing the plan checks) and a README section. Also a step-by-step guide to resubmit the extension to the Chrome Web Store (now in the private website repo, folder `chrome-store/`).
- **Release 5.1.0** (new Web Store submission; the version number stays in the 5.x series): everything listed below for 2026-11-25. New permissions to explain to the store: `gcm` and the 21 other Amazon Associates sites (the store listing texts are in the private website repo, folder `chrome-store/`).
- **Header**: the "N days left in Pro" / Upgrade button now spans the full width of the Refresh button (the Close X moved to the icon row, after the avatar).
- **Simpler Settings, one screen**: no more statistics or big cards. Countries are compact flag chips (the countries where your stores sell first, the rest under "Other Amazon countries"), stores are one line each (flag, store id, account, badges), and the two blocks sit side by side when the window is wide.
- **Real currency converter**: the "~USD" chart no longer uses fixed rough rates. The worker asks OUR server for today's exchange rates (at most every 12 h; the server gets them daily from ExchangeRate-API) and converts at that rate; until the first answer, or when offline, it falls back to the old table. All explanations (chart caption tooltip, currency menu, tour) now say "converted at today's exchange rate".
- **Gifts and plan changes show up at once**: (1) the server now PUSHES "your plan changed" to the browser (Firebase Cloud Messaging through Chrome's `gcm` API: new `gcm` permission, `PLAN_CFG.gcmSenderId`, the push token is sent with each plan check, a push wakes the worker which asks for the plan); (2) while the window is open the plan is asked every 15 s (was 20 s) and the server's limit of 120 checks/hour, which 20 s polling exceeded after 40 minutes (causing "rate_limited" and a stuck plan), is now 600. The push needs the server key `_lib/keys/fcm.json` (see the website docs); without it the 15 s / 15 min checks still work.
- **Opt-in usage events**: with "Share anonymous usage" on, the names of the main buttons pressed (Upgrade, Refresh, Settings, account menu, sign out, ...) are sent to our server, which relays them to Google Analytics 4 (property Affilyatics, `ext_` events, anonymous id). Never earnings, store names or tags. The setting's tooltip says so.
- **Account menu**: the avatar and email moved from under the logo and from the plan card in Settings to a new avatar button on the right of the header. Its menu shows the avatar, name, email and plan, with Settings, Manage plan / See plans, Check my plan again, Privacy policy and Sign out.
- **Sign out returns to the start by itself**: Settings used to stay open after signing out (the popup does not redraw on storage changes while Settings is open), so you had to click the back arrow. Signing out now closes Settings and shows the sign-in screen at once, also when the sign-out comes from another window.
- **Flag next to each account in the store menu**: every store row (and the locked Pro rows) shows the flag of its account's country (the country of its own Associates site, the US flag for the main account).
- **Shorter chart caption**: the long line under the chart ("Earnings (the chosen currencies drawn together in ~USD ...") is now just "Earnings in ~USD" (or the currency) with a "?" whose tooltip holds the explanation (it opens upwards).
- **Fix: CORS errors in the extension's error list**: checking a country site where the user has no account made Amazon redirect to its sign-in page on another domain, which Chrome blocks and logs (one error per country per check). Requests to the other country sites no longer follow redirects (`redirect: 'manual'` in `fetchContext`); a redirect now simply means "no account / not signed in". No functional change.
- **All Amazon countries, found automatically**: the extension now knows all 22 Associates countries (added JP, IN, BR, MX, AU, AE,
  SG, SA, BE, IE, TR, EG, with flags) and finds the user's accounts by itself on the first load. It reads Amazon's own country
  switcher (the `ac-country` radios with each country's site address), then checks every country site in the background (4 at a
  time, Pro only) for an account: the stores and countries found there are added, and the countries with an account of their own
  are switched on automatically (until the user picks countries by hand: `settings.countriesCustom`). Countries with no account
  are skipped silently (never shown as "signed out"). The list and the countries without an account are re-checked every 24 h
  (`SITES_MIN`) and when you press Refresh (at most every 10 minutes); a country Amazon adds later is registered by itself from
  the site's own page (currency, marketplace id). Sites that only exist on their own site stay in `SEPARATE_SITES`; GB, DE, FR, IT,
  ES, NL, SE and PL (also reachable through the US account) are in `OWN_SITES`, and their own-site stores come in as extra accounts.
  A separate site now uses the marketplace id its own page reports. `manifest.json` lists all 21 other Associates sites in
  `host_permissions` (needed for this; the Web Store will review it and users get a permission prompt on update).
  Details of the research behind it: `docs/ASSOCIATES_SITES.md`.
- **Fixed extension id for GitHub and local installs (Google sign-in)**: `manifest.json` now always carries the public `key` from
  `tools/dev-extension-key.json` (id `fhccbomkecngijcmapafebjbbbmenahl`), so an unpacked install from GitHub gets the same id as
  local testing and Google's `redirect_uri_mismatch` goes away once `https://<id>.chromiumapp.org/` is registered in Google Cloud.
  `tools/set-env.py` no longer adds/removes the key (it only switches the server addresses); `tools/package.py` removes the key
  from the manifest inside the Web Store zip (the store keeps its own id `pikaeildnladnpjcakoglpheegipkokg`). Only the public
  key is committed; there is no private key in the repo.
- **New logo and icons**: replaced `icons/logo-{light,dark}.svg`, `icons/favicon-{light,dark}.svg` and the toolbar/store
  PNGs `icons/icon{16,32,48,128}.png` with the final artwork from `_old_Affilyatics.com/designs/Logo/Final`
  (new wordmark tagline "A Better Amazon Dashboard"). The PNGs are rendered from `favicon Affilyatics light.svg`
  (navy tile, white bars, transparent corners), same style as before. Not pushed yet: to be tested locally first.

## 2026-11-15

- **Pending shipments / Returned items with several currencies**: the cards showed every currency on one line and overflowed.
  They now show the main currency and a small "+N" (the other currencies are in its tooltip).
- **Store filter uses the Countries click logic**: a checkbox per store (and "All stores") to combine stores, and a click on the
  name to see only that store; the menu stays open while you tick. At least one store stays on, the countries follow the chosen
  stores, and unticking "All stores" keeps the main store. The Tags filter already worked this way.
- **Cascade Store -> Countries -> Tags**: each filter only offers what the previous one leaves. With a store chosen, the
  Countries menu greys out the countries it does not sell in (they cannot be picked, and "All countries" means all of the
  store's countries). When the tracking-ID data of the new scope has arrived, tags that no longer exist in it are dropped from
  the Tags filter (and it goes back to all tags if none is left), so a Canada-only tag no longer stays selected, with no data,
  after you switch to the UK.
- **Daily clicks per tag in the chart**: with a tag filter on, the chart shows the real daily clicks of the selected tags
  (new dimension `tagday`, one `/reporting/summary` request per tag, store and country, using Amazon's own Tracking ID
  filter: the tag's numeric id + its name; the ids are read from the Tracking ID dropdown of the earnings page and kept in
  the login context as `tagIds`). Checked on the live account: Amazon returns clicks per day for a tag, but every sales
  field on those days is empty (a tag's sales only exist as period totals), so earnings and orders stay in the cards.
  "Other" = the day's total clicks minus the named tags. The Dates tab still shows all tags, with a note.
- The temporary test alert for the Creator Rewards enrollment notification was added and then removed at the owner's request
  (reloading no longer adds any sample alert; left-over samples are purged).
- **Desktop alerts checkbox** in the notifications popup header (same setting as Settings > Notifications).
- **Settings**: Associate stores are now cards (main badge, account and host, countries, earned and clicks for the period,
  Amazon "last updated", not-signed-in badge). Countries to show are cards with switches, grouped into where your stores
  sell and the other Amazon countries, with live figures and quick actions (Where my stores sell / Only with activity / All).
  At least one country always stays on.
- **Filters swapped again**: period, dates and metrics on the left; Countries and Tags on the right (their menus open leftwards).
- **Creator Rewards enrollment alert** (new notification type `enroll`, on by default, with its own switch in Settings):
  when a live or upcoming Creator Rewards offer needs you to enrol, an alert says so and a click opens that store's
  Creator Rewards page. Checked on every Creator Rewards refresh (the Current page) and every 30 min for the Upcoming tab;
  announced once per offer and store, forgotten once you are enrolled or the offer ends. The wording of a not-enrolled
  page has not been seen on this account yet, so detection looks for a "not enrolled" sentence or an Enroll / Join /
  Opt-in button on a page that shows a month or an offer duration, and never guesses without one.
- **Total income card taller**: its top lines up with the top of the logo and its bottom with the Store filter / Refresh button.
- **Creator Rewards tier** in the Creator Rewards tile of the total card: "Tier 3/4 · $640 to next" (or "top tier"); the tooltip gives
  the month, the next tier and the whole tier table. The rewards rows now carry `tiers` (background.js `fetchRewards`).
- **Header polish**: logo 58 -> 66 px; the Store filter has the Refresh button's height (40 px), ends exactly where the logo
  ends (the logo sets the column width) and its bottom line matches Refresh; it shows "+2" (tooltip: 2 other stores); the "?"
  next to the Tags filter is bigger (24 px).
- **Tags filter**: the "Tag filter on" banner is replaced by a "?" next to the filter. It fades between its normal and the
  accent colour while a tag is unselected, and its tooltip explains that the chart and Dates tab cannot be split by tag.
  Unticking "All tags" (or the last tag) now works: nothing selected shows zero totals ("No tags"); it is not restored
  on reopening.
- **Store filter under the logo** (view-only): shows the main store id and "+N others"; clicking lists every store (account,
  countries, income) and picking one shows that store alone. The countries follow the store, and only that store is
  requested from the worker (`load` message gets `accounts`). Notifications and the 5-minute refresh still cover every store.
- **Tags filter after Countries**: with tags selected, the cards (clicks, ordered, shipped, conversion), the total income
  (earnings only) and the countries table show only those tags, from Amazon's tracking-ID table (period totals). Pending
  and Returned cards show "-" and other income sources are left out (not per tag). The chart and the Dates tab cannot be
  split by tag (Amazon's daily totals are for all tags), and a note says so. The tag list is fetched only when needed.
- Fixes: the Countries menu opened off-screen to the left; the Store filter now has the Refresh button's height and shape,
  fills the logo's width and its bottom line matches the Refresh button.
- **Filters on the left**: Countries and Tags on the left of the toolbar; period, dates and metrics on the right.
- Store and tag choices are remembered with the rest of the view (`viewState.stores`, `viewState.tags`).
- **Refresh load fix**: the internal 90-day `pending` fetch is now refreshed every 30 min instead of every 5 min
  (it doubled the API requests of every cycle: 18 instead of 9 per 5 minutes with 9 store x country entries).
- Refresh rules documented in docs/ARCHITECTURE.md (daily numbers and Creator Rewards every 5 min for every store and
  country, Refresh forces them, Connections 6 h, tables 10 min).
- **Corner radius reduced** (about 60% of the original: cards 10px -> 6px, controls 8px -> 5px, pills and dots 5px, small items 3px, chart bars 2px).
- **Amazon report gap protection**: ledger of recent days, held rows, orange chart band with tooltip note, banner with
  "Open Amazon report" / "Copy details", Dates-tab badge, `dataissue` notifications (missing / back). See
  docs/AMAZON_REPORT_GAP.md.
- Documentation added (README, CLAUDE.md, docs/).
- Project folder and zip renamed to `Affilyatics.com`.

## 2026-11-14

- First commit of the extension (version 4.0.0) with all of the following.
- **Total income card** redesigned: fixed grid, all five sources always present, other currencies on their own line,
  green highlighted total block.
- **Chart**: the last period is highlighted and its values are always visible (a closable "Current day performance" strip under the chart, `lastStrip`; closing is remembered while the popup is open).
- **Pending shipments** card (estimate): items ordered not yet shipped valued with your average price and commission
  rate over 90 days, independent of the selected period, with "?" explanation, by-country hover, orange colour.
- **Returned items** card: exact commission lost from Amazon's negative return rows, item count, "?" explanation.
- **Ordered** card kept as item count; card order is Clicks, Ordered, Shipped, Conversion, Pending shipments, Returned items.
- Stat colours: Clicks yellow, Pending shipments orange, Conversion blue (with a coloured dot).
- **Dates** table tab: one row per day, like Amazon's report.
- Country filter: clicking the text "All countries" selects all and closes the menu; the checkbox keeps toggling.
- "?" tooltip styled like the chart tooltip and shown above the by-country breakdown.
- Internal 90-day `pending` fetch (background priority) so the pending estimate does not depend on the period.
- Header card never overflows into the buttons (no percentages below 1240px); Pending/Returned item count sits under the amount.
- v5.0.0: Free / Pro plans (14-day no-card trial, license keys, signed server answers), plan card in Settings, upgrade pop-up, Pro gating in popup and worker, `tools/package.py`, store listing (since 2026-11-25 kept in the private website repo, folder `chrome-store/`) in `store/`.
- v5.0.0: first-run guided tour (4 steps over the real controls, `TOUR` in popup.js, `settings.tourDone`; Settings -> Take the tour runs it again; the website demo offers it from the orange bar).
- v5.0.0: mandatory account (Firebase sign-in on a hosted page, email or Google) for every plan; sign-in gate screen; account token; licenses belong to accounts; trials per account.
- tools/set-env.py local|prod switches the extension between your local server and production; package.py refuses a local build; local test sign-in on the server (dev_login, localhost only).
- Sign-in inside the popup (Firebase REST for email; Google through chrome.identity). Website: demo page shell, prices Pro $4.99/mo, $54.89/yr, Lifetime $99.
- The plan is re-checked on open, every 20 s while the window is open (5 s after See plans), and every 15 min in the background; Pro unlocks the screen by itself.
- Every period and the custom range are now FREE (Free vs Pro: tags, tabs, Creator Rewards, alerts, other sites, gap guard, 5-min refresh).
- Free = 1 store (the main store, the first Amazon lists); Pro and Lifetime = unlimited stores.
- Free: Countries and Tags menus also list what we found (countries of other stores, tracking-ID names) grayed with a PRO pill.
- Gifts: backoffice action on an account (1 month Pro or Lifetime Pro); the extension shows a gift banner and 'Pro (a gift)'.
- The 14-day Pro trial starts automatically at the first sign-in; during it Pro features work and carry a 'PRO (N days left)' pill; the header button reads 'N days left in Pro'.

- Pricing (2026-11-16): Pro $7.99/month or $79.90/year (two months free); Lifetime $129 founding price for the first 50 early adopters, then $199. Website, terms, FAQ, store listing and owner docs updated.

- Plans reviewed end to end (2026-11-17): one shared plan rule on the server and in the backoffice lists; late-renewal grace (3 days) for subscriptions; a refund ends Pro for good; the longest license wins; "Link to account" on the license page for purchases made with another email; the extension shows "Renews on <date>" and a "renewal is late" message and honors `accessUntil`; the site explains how Pro unlocks after buying.

- Extension modes (2026-11-17): `python tools/set-env.py test` points the extension at the shared test server https://eblyn.com/Affilyatics/ and KEEPS the fixed extension id (Google sign-in needs it); `prod` is only for the store build (no key); `local` is WAMP. Reload the extension after switching.

- Chart currency selector (2026-11-17): the chart plots one currency at a time (never mixed); with several currencies a small selector next to "Cumulative" switches between them (the choice is remembered). Before, earnings in CAD or GBP (for example a CA commission) were not plotted at all when USD was the main currency.
- Chart "All currencies (~USD)" (2026-11-17): the currency selector has an option that draws every currency together, converted to US dollars at the rough fixed rates in shared.js (APPROX_USD). Every amount is marked "~" and the caption says it is an estimate, not an Amazon figure.
- Chart currency menu and tour (2026-11-17): the currency choice is now a menu next to Metrics, like "All countries" (checkboxes, symbols, "only" buttons; it appears when you earn in more than one currency; default all). One currency = its exact amounts; several = drawn together in ~USD at rough rates, and the chart tooltip lists each currency's exact amount instead of one converted number. Tour: step 2 now covers dates, metrics and currencies; step 4 opens the notifications panel and asks to tick "Desktop alerts" (pulse, bouncing hand, ticking demo; the page stays clickable; the card changes once it is on).
- Plan card and account (2026-11-17): in Settings the header middle (empty before) now holds the plan card, styled like the total-income card (plan name and status, the line about it, "Signed in as <email>" with Sign out, and the trial / plans / check buttons). The settings body keeps only "Plan details" (what Pro adds, license key, usage opt-in). The connected account also shows under the logo on every screen.
- Plan card complete in the header + avatar (2026-11-17): the Settings "Plan details" section is gone; the header plan card now also holds what Pro adds, the license key box, the usage opt-in and the plan check line. A signed-in avatar shows in that card and next to the account under the logo: the Google profile picture for Google accounts (kept only in this browser, only Google picture hosts accepted, mentioned in the privacy policy), otherwise the first letter on a colour made from the email.
- Plan card tightened (2026-11-17): account and buttons share one row, the usage opt-in and "Plan checked" share one footer line (details in a tooltip), and the duplicate account chip under the logo is hidden on the Settings page.
- Tooltip currency breakdown redesigned (2026-11-17): a money line with several currencies shows the label, then one indented line per currency (code on the left, exact amount on the right) instead of stacked numbers beside a centred label.
- Demo (2026-11-17): the countries button shows up to 4 flags then "+N" (it showed none with more than 5 countries); the full demo page is wider so the demo shows at its natural 1160px, no longer smaller than the one on the home page.
- Demo cache busting (2026-11-17): tools/build-demo.js stamps a new version (?v=) on the files app.html loads and on the iframe address in the site pages, so visitors never keep an old copy of the demo.
- Notifications panel position (2026-11-17): it now opens right under the bell instead of under the whole header (which is tall), in the extension and in the demo.
- Tour is now 5 steps (2026-11-17): step 4 "Mode, settings and alerts" explains the whole icon menu (light/dark mode, Settings, the bell); step 5 "Desktop alerts" opens the panel and asks to tick the box (animated).
