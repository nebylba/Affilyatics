# How the numbers are calculated

Everything comes from Amazon's daily rows. "Exact" means taken from Amazon; "estimate" means derived here, shown with
a `~` and a "?" tooltip.

## Total income card (header)

- Per currency: `total = earnings + bounty + bonus + Creator Connections + Creator Rewards`.
- The biggest currency is the main one; shares (%) and the stacked bar are in the main currency. Other currencies show
  as small amounts on the line under each value (full list on hover).
- All five sources always have a column (empty ones are dimmed) so the layout never changes.

## Stat cards

- **Clicks, Ordered, Shipped, Conversion**: sums of the daily rows; conversion = ordered / clicks.
- **Returned items**: exact. Amazon books a return as negative revenue and earnings on the day it happens (example:
  1 returned, revenue -340.98, earnings -8.53). For each day with returns and negative earnings the card shows that
  day's earnings (commission lost, e.g. -$8.53) and the sales value goes in the tooltip. If a day's shipments outweigh its
  returns the loss is hidden inside a positive total; that part is estimated from the average earnings per shipped item
  (shown with `~`). It follows the selected period.
- **Pending shipments** (estimate, ignores the selected period, follows store/country filters): from the trailing 90 days
  of daily rows (internal period `pending`), per currency:
  1. `pending revenue = ordered revenue - shipped revenue`, used when positive and not above the ordered revenue;
     otherwise `pending items x average ordered price` (average over the same 90 days).
  2. `estimate = pending revenue x commission rate`, rate = earnings / shipped revenue (90 days).
  3. Without a usable rate: `pending items x earnings per shipped item`.
  4. `pending items = ordered items - shipped items` (90 days) is the count shown at the right.
  5. Pending items with nothing to price them from (no shipment with earnings in the 90 days) are still shown: the card
     says "No estimate" with the item count, the "?" gives the pending sales value, and no commission rate is assumed.
     With several currencies, the money is for those that have an estimate; the item count covers all of them.
     "None pending" appears only when there is neither a pending item nor an estimate.
  Limits: "ordered minus shipped" is not Amazon's list of open orders (older shipments shrink it, cancellations inflate it);
  returns are not subtracted; the rate is your blended rate, not the category rate of the pending items.
  The per-country hover estimates each country separately, so it may not add up exactly to the card.

## Dates tab

One row per day (per country when several are shown), newest first, quiet days left out, max 500 rows. Columns follow
Amazon's report: Date, Clicks, Ordered, Conv., Ordered revenue, Shipped, Returned, Revenue, Earnings, Bounties.
Held days (see AMAZON_REPORT_GAP.md) are tinted orange with a "held" badge.

## Chart

Left axis = first selected money series; other series are scaled to their own peak (stated under the chart). Weeks
and months aggregate days; a point is "held" if any day inside it is held. Hover shows exact values.
