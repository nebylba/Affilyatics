# Changelog

Newest first. Dates are when the change was made.

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
- v5.0.0: Free / Pro plans (14-day no-card trial, license keys, signed server answers), plan card in Settings, upgrade pop-up, Pro gating in popup and worker, `tools/package.py`, store listing in `store/`.
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
