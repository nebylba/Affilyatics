# CLAUDE.md: Affilyatics (Chrome extension)

Working notes for Claude Code sessions in this repository. Read this first.

## Workflow rules (from the owner)

- **Always commit every change, then push** to `origin main` (`git@github.com:nebylba/affilyatics.com.git`). Do not
  wait to be asked, and do not leave edits uncommitted at the end of a task. Commit messages end with the
  co-author trailer the session's system reminder specifies.
- **Keep the docs current**: when behaviour changes, update `docs/CALCULATIONS.md`, `docs/ARCHITECTURE.md`,
  `docs/AMAZON_REPORT_GAP.md` as relevant, add a line to `docs/CHANGELOG.md`, and mirror the user-facing summary in the
  owner's folder `../docs/` (outside this repo, plain-language).
- **Rebuild the website demo after EVERY extension change**: `node tools/build-demo.js "C:/Perso/EBLYN/Projects/Affilyatics.com/demo"` (it copies popup.js/css, plan.js, shared.js into the site's demo), check it at https://eblyn.local/Affilyatics/demo/app.html?full=1&plan=pro, then commit and push the website repo (`git push git@github.com:nebylba/eblyn.com.git main`, stage only `Affilyatics/`). The owner then uploads the demo folder.
- When the owner says "brainstorm" or "don't code yet", discuss and propose only.
- Git "dubious ownership" error (folder owned by Administrators): do **not** edit global git config. Use
  `git -c safe.directory=C:/Perso/EBLYN/Projects/amazonytics/Affilyatics.com <command>` per command.
- The repo root is this folder (`Affilyatics`, GitHub `nebylba/Affilyatics`, public). The parent folder `amazonytics/` is not a repo; it holds the owner's
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
- Filters: `storeFilterHTML` (under the logo, `#storefilter`), `locsDropdownHTML`, `tagsDropdownHTML`; state `view.stores`, `view.sel`, `view.tags`.
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
- Money: always `fmtMoney(value, currency)`; never mix currencies (the one exception: the chart's "All currencies (~USD)" option converts at the rough `APPROX_USD` rates and every amount is marked with `~`); main currency big, others as small `+` amounts.
- Layout must not jump: fixed-height cells, always render all columns, reserve empty lines.
- Estimates must be marked (`~`) and carry a "?" tooltip saying they are not Amazon figures.
- Do not call Amazon endpoints directly from outside the extension: they need the page's auth headers (401 otherwise).

## Plans (Free / Pro)

`plan.js` (shared) + `license.js` (worker) + gating in `background.js` / `popup.js`. Read `docs/PLANS_AND_LICENSING.md` first.
Locked UI carries `data-lock="<feature>"`; whatever you add that is Pro-only must be gated BOTH in the popup and in `load()`.
The backend lives in the website repo (private repo `nebylba/affilyatics.com`, local folder `C:/Perso/EBLYN/Projects/Affilyatics.com`: `_lib`, `api`, `admin`; rebuilt demo goes to its `demo/` folder; it deploys by itself, see its CLAUDE.md). Release zip: `python tools/package.py`.
Demo for the website: `node tools/build-demo.js <site>/demo` (also copies `plan.js`).


## Note (2026-11-24)
The website and backend moved to their own repo (`nebylba/affilyatics.com`). `tools/set-env.py` and `plan.js` still point at `eblyn.com/Affilyatics/` and the old `eblyn.local`; they switch to `https://affilyatics.com/` (and `https://affilyatics.neb/` for local) in the go-live phase, together with the new production public key in `plan.js`.

## Two copies of the extension (owner's rule, 2026-11-25)
- `C:\Perso\EBLYN\Projects\Affilyatics` (this git repo, `nebylba/Affilyatics`): points at https://affilyatics.com; what GitHub users and the store get.
- `C:\Perso\EBLYN\Projects\Affilyatics.local` (not a git repo): the owner's copy for localhost. It points at https://affilyatics.neb (local DB `affilyatics_dev`, local backoffice). It was made with `python tools/set-env.py local`.
- **Every extension change is made in BOTH folders**; the only difference is the four server addresses in `plan.js`. Never run `set-env.py` in this folder (it would point the git copy at localhost); use it only in `Affilyatics.local`.
- Both folders carry the same `key` in `manifest.json` (same extension id `fhccbomkecngijcmapafebjbbbmenahl`, registered with Google for sign-in), so Chrome can only load ONE of them at a time: remove one before loading the other.
- Do not push until the owner says so.

## Chrome Web Store material
Everything about the store listing (texts, screenshots, promo images, resubmission guide, helper scripts) lives in the PRIVATE website repo: `C:\Perso\EBLYN\Projects\Affilyatics.com\chrome-store\` (see its README). Do not put listing drafts back in this public repo.
