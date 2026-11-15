# Amazon report gap ("Amazon dropped a day")

## What happened (2026-11-14 / 15)

On Nov 14 the dashboard showed ~200 clicks and one ordered item ($387.64) and a new-order notification fired. The next
morning the extension showed only 7 clicks and no order. On the Associates site the same account showed:

- ranges (this month, last 30 days, custom Nov 1-15): Nov 14 = 0 clicks, 0 orders, and the table had no Nov 14 row;
- the single day "Yesterday" (Nov 14): 202 clicks, 1 ordered ($387.64).

Hours later everything was back to normal (a new earning for the day even appeared). The extension had faithfully
shown the range response, replacing its stored copy of the day with the gap.

## What we found

- Amazon reports in **Pacific time**; the user is on GMT+1, so their morning of Nov 15 was still the evening of Nov 14
  for Amazon, around the rollover when a day moves from "today" to "yesterday".
- Amazon's report header showed "Last Updated: Nov 14 2026 17:33 PST" and did not move for ~10 hours.
- Hypothesis (unproven): the range report is built from a batch-aggregated daily table while the single-day query
  reads nearer-live data; around the rollover the closing day can be missing from the first and present in the second.
- No public documentation of this exact symptom. Related: Amazon's help notes short windows can show orders without
  clicks; third-party tools report recent Amazon data being revised for 1-3 days.
- Amazon's data endpoints need the page's auth headers (401 from a plain fetch), so raw responses could not be compared
  from outside the extension.

## The protection (background.js `guardDays`, popup.js banner/chart/table)

1. **Ledger**: every time Amazon returns a day with activity within the last 7 days, its values are stored in
   `chrome.storage.local.ledger["<acct>|<loc>"][day]`.
2. **Detection**: in a fresh `day` response, if a ledger day inside the requested range is missing, or comes back
   all-zero, it is a gap. Applies to both the selected-period fetch and the internal 90-day `pending` fetch.
3. **Hold**: the ledger values are put back into the rows with `held: { since, lu, got, range }`. Every card, the chart,
   the tables and the pending estimate keep using them. Notification detection sees the held values, so no false
   "commission adjusted" alert.
4. **Release**: as soon as Amazon returns real data for the day (ledger is overwritten, "back" notification), or after
   72 hours (`HOLD_MAX_MS`), when Amazon's version is accepted.
5. **UI**: orange banner (days, last values, "Open Amazon report", "Copy details"); orange dashed band on the chart with
   a "Held values" note in the hover tooltip; orange row and "held" badge in the Dates tab; a notification
   "Amazon's report is missing Nov 14 · US" (type `dataissue`, toggle in settings) and one when it is back.

Constants: `HOLD_RECENT_DAYS = 7`, `HOLD_MAX_MS = 72 h`, `LEDGER_KEEP_DAYS = 14`.

## Limits

- Only a day that **vanishes completely** is caught. Amazon lowering a day's numbers is accepted as is (returns and
  cancellations are legitimate).
- A day that was never seen with activity cannot be protected (the ledger needs one normal fetch first).
- "Open Amazon report" opens the earnings report, not a specific day (no known date parameter).

## Testing

`guardDays` is testable in Node: load `shared.js` and the text between `// ---- Amazon report gaps` and
`function detectRewards` into a `vm` context with stubs for `chrome.storage.local`, `pushEvent`, `money` and `hasData`.
Scenarios verified on 2026-11-15: normal fetch (no event), day vanishes (held + one event), zero row (still held, no
duplicate event), Amazon returns it (held cleared + "back" event), range not covering the day (untouched), quiet day
(never held), 80 hours later (released).

## Ideas not built yet

- Cross-check: when a recent day is empty in a range, query that day alone (as the owner did by hand) and use it.
- Show Amazon's "last updated" stamp next to the refresh button, in Pacific time.
- Log, per fetch, the range, per-day row counts and `last_updated` to collect evidence of how Amazon behaves.
