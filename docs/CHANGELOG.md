# Changelog

Newest first. Dates are when the change was made.

## 2026-11-15

- **Corner radius reduced** (about 40% of before: cards 10px -> 4px, controls 8px -> 3px, pills and dots 3px, chart bars 1px).
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
