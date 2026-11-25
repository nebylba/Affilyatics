# Affilyatics

A Chrome extension (Manifest V3) that turns Amazon Associates reporting into a live dashboard: all your stores and
countries in one popup, flexible periods, an interactive chart, per-source income cards, estimates of what is still to
come, and notifications for new orders and commissions.

It runs in your browser. It reuses your existing signed-in Associates session (cookies), calls the same
reporting endpoints the Associates site uses, and keeps your earnings data in `chrome.storage`: that data never leaves
your browser. The only thing sent to our server (https://affilyatics.com) is what the account and plan need: a random
installation id, the extension version, your plan and your account token (plus a license key if you enter one). A free
account (email or Google) is required. See https://affilyatics.com/privacy/.

Current version: see `manifest.json`.

## What you get

- **Total income card** (header): total plus one column per income source (Earnings, Bounties, Bonus, Creator
  Connections, Creator Rewards) with shares and a stacked bar. Fixed layout: nothing jumps when the period, store or
  currency set changes.
- **Stat cards**: Clicks, Ordered, Shipped, Conversion, **Pending shipments** (estimate), **Returned items**
  (exact amounts from Amazon's report). Hovering a card lists the numbers per country.
- **Chart**: earnings bars plus clicks/orders curves, hover tooltips, the last period always labelled, orange bands
  on days Amazon's report is missing (see below).
- **Tables**: Countries, Tracking IDs, Categories, Products, and **Dates** (one row per day, like Amazon's own report).
- **Periods**: today, yesterday, last 7/30 days, this/last month, quarter, year, custom range.
- **Notifications**: new orders, commissions (and adjustments), bounties/bonuses, Creator Rewards tiers, Creator
  Connections, signed-out warnings, and Amazon report issues. Optional desktop notifications.
- **Amazon report gap protection**: if Amazon's report suddenly drops a recent day, the last known values are kept,
  marked in orange, and explained (banner, chart tooltip, notification, "Copy details").

## Install

- **Chrome Web Store:** link coming as soon as the review is done.
- **From source (anyone can do this):**
  1. `git clone https://github.com/nebylba/Affilyatics.git`
  2. Open `chrome://extensions`, enable *Developer mode*, press *Load unpacked* and pick the cloned folder.
  3. Sign in to <https://affiliate-program.amazon.com> in the same Chrome profile, open the extension and press *Sign in*.
  4. Sign in with **email and password** (create a free account on the sign-in page). *Sign in with Google* only works in the Chrome Web Store build, because Google must know the extension's id.

The extension talks to the hosted service at https://affilyatics.com for accounts and plans (the Free plan needs no payment). The server code is not part of this repository.

## Development

1. Open `chrome://extensions`, enable *Developer mode*.
2. *Load unpacked* and pick this folder.
3. Sign in to <https://affiliate-program.amazon.com> in the same Chrome profile, then open the extension.

There is no build step. After editing a file, click the reload icon of the extension on `chrome://extensions`.
Quick syntax check: `node --check popup.js && node --check background.js && node --check shared.js`.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest. Permissions: `storage`, `alarms`, `declarativeNetRequest`; optional `notifications`. Hosts: `affiliate-program.amazon.com`, `associates.amazon.ca`. |
| `background.js` | Service worker: login tokens, fetching, caching, refresh schedule, notifications, report-gap guard. |
| `popup.js` / `popup.css` / `popup.html` | The dashboard UI. Reads only from `chrome.storage`. |
| `shared.js` | Constants shared by both: countries (`LOCALES`), periods (`PERIODS`), `rangeFor`, date helpers, defaults. |
| `theme.js` | Light/dark theme bootstrap. |
| `fonts/`, `icons/` | Oswald font files and extension icons. |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data flow, storage keys, caching and refresh.
- [docs/CALCULATIONS.md](docs/CALCULATIONS.md): how every derived number is computed (and its limits).
- [docs/AMAZON_REPORT_GAP.md](docs/AMAZON_REPORT_GAP.md): the "Amazon dropped a day" incident and the protection built for it.
- [docs/CHANGELOG.md](docs/CHANGELOG.md): what changed, newest first.
- [CLAUDE.md](CLAUDE.md): working notes for Claude Code sessions in this repo.
