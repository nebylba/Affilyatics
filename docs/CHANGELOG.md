# Changelog

Newest first. Dates are when the change was made.

## 2026-11-15

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
