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
- **Freshness**: each entry is refreshed only when due (`dueAfterMs`). Current-period daily numbers of every store x
  country (quiet countries too) and Creator Rewards are due after 4.5 min, so every 5-minute alarm refreshes them;
  Creator Connections 6 h (12 h for finished periods); tag/category/product tables 10 min; finished periods 60 min;
  the internal 90-day `pending` window 30 min (it changes slowly and would otherwise double the API calls of each
  cycle). The Refresh button forces daily numbers, Creator Rewards and the open tables, quiet countries included.
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

## Filters (popup)

- **Store** (`view.stores`, a Set of store ids or null): view-only filter applied inside `activeAccounts()`, on top of the
  Settings list `settings.accounts`. The dashboard sends `accounts: [...]` in the `load` message so only that store is
  fetched; the 5-minute alarm (`prewarm`) ignores it, so alerts keep covering every store.
- **Countries** (`view.sel`): `setSel()` also widens `view.stores` when the chosen stores do not sell in the chosen
  countries, so the screen is never empty. Picking a store sets the countries to that store's countries.
- **Tags** (`view.tags`): `collect('tag')` filters the Tracking IDs table; `tagAgg()` builds one total row per store x country
  from the tracking-ID table and replaces the daily rows for the cards, the total income and the countries table
  (`tagMode()`); the chart shows `tagDayRows()` (daily clicks of the selected tags, from the `tagday` dimension: Amazon
  returns clicks per day for a tag but no daily sales, which only exist as period totals); the Dates tab keeps the
  unfiltered daily rows. `collect('tag', true)` is the unfiltered list for the menu. The `tag`
  dimension is requested when a tag filter is active, or the table / menu is open.
- Both are persisted in `viewState`.

## Creator Rewards enrollment alerts

`fetchRewardMonths` (once per rewards refresh) runs `parseRewardOffer` on the Current page HTML and, at most every 30 min
(`rewardsOffers` memo in `chrome.storage.local`), on the Upcoming tab (same `switchTab` POST as the Ended tab). Offers that
need enrolling go to `detectEnroll`, which keeps `enrollSeen` (`acct|tab|month`) so each offer is announced once, then
forgotten when it no longer needs enrolling. The event (`type: 'enroll'`) carries `url` = the store's Creator Rewards page,
used by the bell list and by desktop alerts.
