# Architecture

## Overview

```
Amazon Associates site (signed-in session, cookies)
        |  HTML page -> identity token + csrf + store list
        |  GET /reporting/summary, /reporting/table  (same headers as the Associates UI)
        v
background.js (service worker)  --writes-->  chrome.storage.local  --read by-->  popup.js (UI)
   alarm every 5 min, on browser start, and on popup request ("load" message)
```

The popup never talks to Amazon. It asks the worker to `load` a period and renders whatever is in `chrome.storage`
(it updates live through `chrome.storage.onChanged`).

## Fetching

- **Tokens**: the Associates earnings page (HTML, ~480 KB) embeds the identity token, csrf token and store list. They
  are cached in `storage.session` and reused until Amazon answers 401/403, then refreshed once.
- **Daily numbers**: one `/reporting/summary` request (`type=earning`) per store x country covers up to 90 days and
  returns clicks, ordered items, shipped, returned, ordered revenue, revenue, earnings, bounty and bonus per day, plus
  Amazon's own `last_updated` stamp. Longer ranges are split by `splitRange`.
- **Tables** (tag, category, product) use `/reporting/table` and are only fetched when that tab is shown.
- **Creator Connections**: `/reporting/summary` with `type=connections`. **Creator Rewards**: HTML scrape (US only).
- **Rate limits**: API requests run strictly one after another (3 in parallel gives HTTP 429, the pause only grows
  after a 429). HTML pages load in parallel with them. CA uses its own host (`associates.amazon.ca`).
- **Freshness**: each entry is refreshed only when due. The interval adapts to Amazon's `last_updated` stamp; quiet
  countries and slow data are checked rarely. Entries younger than the due time are not re-downloaded.
- **Derivation**: a period inside an already fresh wider period of the same store and country (today inside this
  month, this month inside this quarter, the 90-day `pending` window inside this year...) is filtered locally with
  `deriveFromWider`, no request.

## Storage (`chrome.storage.local` unless noted)

| Key | Content |
|---|---|
| `cache` | `{ "<acct>|<loc>|<period>|<dim>": { v, at, range, rows, lu?, active? } }`. Entries older than 7 days are dropped. |
| `accounts` | discovered stores and the countries each can report. |
| `settings` | enabled countries/accounts, default period, notification toggles. |
| `status` | loading progress, errors, `updatedAt`, `siteErrors`, signed-out flag. |
| `notif` / `notifySnap` | notification list and the per-month snapshots used to detect "new" events. |
| `authAlerts` | one signed-out alert per episode. |
| `ledger` | last known values per recent day (report-gap guard). |
| `viewState` | the filters you last used (restored when the popup reopens). |
| `storage.session` | login tokens. |

Periods are `PERIODS` in `shared.js` plus `custom`. `pending` and `last90` are internal: they never appear in menus.

## Popup rendering

`render()` rebuilds the header total card, the notification panel, and `#main` (stat cards, toolbar, banners, chart,
table) from scratch on every state change; `wireChart` then attaches the hover handlers. Event handling is delegated
(`document` listeners) because everything is re-rendered often.

Tooltips: `.tip` (chart hover, with the held-day note), `.bdtip` (by-country breakdown, driven by the `data-bd`
attribute on a card), `.help::after` (the "?" explanations, driven by `data-tip`; the breakdown is hidden while the "?"
is hovered so the explanation wins).

## Notifications

`detectDay` compares each fresh "this month" fetch with the previous snapshot of the same store + country + month and
announces new orders, commission changes and bounty/bonus. The first fetch is only a baseline; baselines older than
14 days are ignored. `detectConn`, `detectRewards`, `authAlert` and `guardDays` add their own events through
`pushEvent` (gated by the per-type toggles). `persistNotify` stores them and optionally raises desktop notifications.
Types: orders, commissions, bonuses, rewards, connections, signedout, dataissue.
