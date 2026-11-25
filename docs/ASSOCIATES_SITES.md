# Amazon Associates: one site per country, and how to find all of a user's accounts (research, 2026-11-25)

**Status: implemented** (see the changelog of 2026-11-25): `parseSwitcher` and `discoverAll` in `background.js`, `applyDiscovered`, `SEPARATE_SITES` and `OWN_SITES` in `shared.js`.

Findings from reading the live Associates pages in the owner's signed-in Chrome (read-only; nothing was changed or accepted).
It is the basis of the automatic discovery of every country and store (now built, see below).

## 1. Amazon publishes the list of all country sites on every page
Every Associates page contains the country switcher: 22 `div[data-a-input-name="ac-country"]` blocks, each with
`data-url` (the site) and an inner `input[name="ac-country"]` with the country code (`value`):

US affiliate-program.amazon.com, GB affiliate-program.amazon.co.uk, DE partnernet.amazon.de, FR partenaires.amazon.fr,
JP affiliate.amazon.co.jp, CA associates.amazon.ca, IT programma-affiliazione.amazon.it, ES afiliados.amazon.es,
IN affiliate-program.amazon.in, BR associados.amazon.com.br, MX afiliados.amazon.com.mx, AU affiliate-program.amazon.com.au,
AE affiliate-program.amazon.ae, SG affiliate-program.amazon.sg, NL partnernet.amazon.nl, SA affiliate-program.amazon.sa,
SE affiliate-program.amazon.se, PL affiliate-program.amazon.pl, BE affiliate-program.amazon.com.be,
IE affiliate-program.amazon.ie, TR gelirortakligi.amazon.com.tr, EG affiliate-program.amazon.eg.

So `SEPARATE_SITES` does not need to be hand-written: it can be read from this switcher.

## 2. Each country site is a separate account with its own sign-in and its own stores
- The US page store picker `#menu-tab-store-id-picker` only lists the stores of the US account (2 for the owner).
- The report dropdowns `ac-report-input-store` / `ac-download-report-input-store` (70 options on the US page) list EVERY linked
  store id x the 10 marketplaces the reports cover (US, GB, DE, FR, IT, ES, NL, SE, PL, CA): that is how the page shows linked
  stores (the owner linked all store ids in `/home/account/storeLink`). The extension currently only uses these options to learn
  which countries a store has (`data-locale`, `<store>__<n>`).
- BUT the data of a store can only be read with the session of ITS OWN site. From the US site:
  - `/p/reporting/earnings?store_id=<other-country store>` redirects to `/operating-agreement/accept` (EU stores) or returns HTTP 500 (CA store);
  - `/reporting/summary` with the US token and another store id returns HTTP 403.
  From the UK site, its own store (`pageState.storeId`) returns data (HTTP 200) and the US store returns 403.
- A site with a single store has no `#menu-tab-store-id-picker` at all; the store id is then `pageState.storeId` (the extension's `discover()` already falls back to it).
- A user with no account on a site is redirected away (sign-in / registration / agreement page) and has no `pageState` element.

## 3. Proposed automatic discovery (first load)
1. Fetch `/p/reporting/earnings` of the main site; read the 22 country sites from the switcher (section 1).
2. In parallel, fetch `/p/reporting/earnings` on each site with the user's cookies. A site that returns a page with `#pageState`
   is an account the user can use: read its stores (picker, or `pageState.storeId`) and its countries (`option[data-locale]`).
   Anything else (sign-in, registration, operating agreement) is skipped silently, never shown as "signed out".
3. Cache the result like the store list today (hours), re-probe on Refresh.
4. Only countries known in `LOCALES` can be shown (it needs the marketplace id and currency); the other sites (JP, IN, BR, MX, AU,
   AE, SG, SA, BE, IE, TR, EG) need a `LOCALES` entry first.
5. Permissions: the manifest must allow every site that is probed (`host_permissions`), or request them at runtime
   (`optional_host_permissions`, needs one click). Adding hosts needs a new Web Store review and a permission prompt on update.

## What was built
- Sites checked 4 at a time, only when the plan is Pro; results kept in `chrome.storage.local`: `countrySites` (the list, with the time it was read) and `sitesProbed` (per country: when it was checked and whether it had an account).
- A country without an account is checked again after 24 h or on Refresh; a country that worked before and now fails is reported as signed out (as Canada always was).
- Countries Amazon adds later: registered from the site's own `pageState` (`localeCurrency`, `marketplaceId`), shown with its code on a grey flag.
- Not verified against real accounts: the sites other than US, UK and CA (the owner has accounts on US, UK, DE, FR, CA).

## Not checked
DE, FR, CA and the other sites could not be opened from the automation browser (blocked there), so only US and UK were tested live.
The operating-agreement page was NOT accepted.
