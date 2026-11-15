# CLAUDE.md: Affilyatics (Chrome extension)

Working notes for Claude Code sessions in this repository. Read this first.

## Workflow rules (from the owner)

- **Always commit every change, then push** to `origin main` (`git@github.com:nebylba/affilyatics.com.git`). Do not
  wait to be asked, and do not leave edits uncommitted at the end of a task. Commit messages end with the
  co-author trailer the session's system reminder specifies.
- **Keep the docs current**: when behaviour changes, update `docs/CALCULATIONS.md`, `docs/ARCHITECTURE.md`,
  `docs/AMAZON_REPORT_GAP.md` as relevant, add a line to `docs/CHANGELOG.md`, and mirror the user-facing summary in the
  owner's folder `../docs/` (outside this repo, plain-language).
- When the owner says "brainstorm" or "don't code yet", discuss and propose only.
- Git "dubious ownership" error (folder owned by Administrators): do **not** edit global git config. Use
  `git -c safe.directory=C:/Perso/EBLYN/Projects/amazonytics/Affilyatics.com <command>` per command.
- The repo root is this folder (`Affilyatics.com`). The parent folder `amazonytics/` is not a repo; it holds the owner's
  `docs/`, `designs/` (HTML mockups, not shipped) and the release zip `Affilyatics.com.zip` (made by the owner).

## No build, no test runner

Plain JS loaded by Chrome. Verify with `node --check <file>`. Logic that can run outside Chrome (for example the
report-gap guard) can be tested in Node by loading `shared.js` plus the function text into a `vm` context with a
stubbed `chrome.storage`. UI changes cannot be seen without loading the extension: say so when you could not check them.

## Map of the code

`background.js` (service worker, `importScripts('shared.js')`)
- Auth/ctx: login tokens from the Associates HTML page, kept in `storage.session`; retry once on 401/403.
- Fetchers: `fetchDay` (`/reporting/summary` type `earning`: clicks, orders, shipped, returned, revenue, earnings,
  bounty, bonus per day), `fetchConnections`, `fetchTable` (tag/cat/product), `fetchRewards` (HTML scrape).
- `load(req)`: builds tasks per store x country x dimension, skips fresh/derivable cache entries
  (`isFresh`, `deriveFromWider`), runs API requests strictly one at a time (HTTP 429 otherwise) and HTML pages in parallel.
  Also queues the pseudo period `pending` (last 90 days of daily rows) at background priority.
- `guardDays`: report-gap ledger and held rows (see docs/AMAZON_REPORT_GAP.md).
- Notifications: `detectDay`, `detectConn`, `detectRewards`, `authAlert`, `pushEvent`, `persistNotify`.

`popup.js` (reads `chrome.storage` only; `render()` rebuilds everything)
- State: `view` (period, filters, metrics, chart group...), `cache`, `status`, `accounts`, `settings`, `notif`.
- Data: `collect(dim)` returns rows for the selected countries/accounts; `sumByCurrency`, `byLocation`, `buildPoints`.
- Header: `totalCardHTML`. Cards: `kpiHTML`, `pendingStat`, `returnedStat`, `heldBannerHTML`.
- Chart: `chartSVG`, `lastStrip` (current-period values under the chart), `wireChart` (hover tooltip). Tables: `tableHTML` (subtabs countries/tag/cat/product/dates).
- Tooltips: `.tip` (chart), `.bdtip` (by-country breakdown, `data-bd` attribute), `.help::after` ("?" explanations).

`shared.js`: `LOCALES`, `SEPARATE_SITES` (CA has its own host), `PERIODS`, `rangeFor` (includes the internal `last90`),
`DEFAULTS` (including `notify` types), date helpers (`ymd`, `parseYmd`), `splitRange` (Amazon caps ranges at ~90 days).

## Data model

- `cache[`${acct}|${loc}|${period}|${dim}`] = { v, at, range, rows, lu?, active? }`. `dim` is `day`, `connections`,
  `rewards`, `tag`, `cat`, `product`. Period `pending` is internal (90 trailing days, `day` only).
- A `day` row: `{ name: 'YYYY-MM-DD', clicks, ordered, shipped, returned, orderedRevenue, revenue, earnings, bounty,
  bonus, held? }`. `revenue`/`earnings` are net: a return is negative on the day it happens.
- `ledger[`${acct}|${loc}`][day] = { at, row, heldSince?, diag? }` (report-gap guard).
- `notif`, `notifySnap`, `authAlerts`, `status`, `settings`, `viewState` also live in `chrome.storage.local`.

## Conventions and gotchas

- Colours are CSS variables `--s-<id>` per series in three palettes in `popup.css` (light, dark, auto-dark). Add new
  series to all three. Current notable ids: `clicks` (yellow), `pending` (orange), `conversion` (blue), `returned` (red).
- Amazon's calendar days are **Pacific time**. The user may be in another zone; "today" differs for hours.
- Amazon's range report and single-day query can disagree for recent days (see AMAZON_REPORT_GAP.md). Never treat a
  vanished day as truth without the guard.
- Money: always `fmtMoney(value, currency)`; never mix currencies; main currency big, others as small `+` amounts.
- Layout must not jump: fixed-height cells, always render all columns, reserve empty lines.
- Estimates must be marked (`~`) and carry a "?" tooltip saying they are not Amazon figures.
- Do not call Amazon endpoints directly from outside the extension: they need the page's auth headers (401 otherwise).
