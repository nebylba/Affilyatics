# How to resubmit Affilyatics to the Chrome Web Store (version 5.1.0, shown as V1.0)

Written 2026-11-25. Item: Affilyatics, extension id `pikaeildnladnpjcakoglpheegipkokg`. All paste-ready texts are in `store/LISTING.md`.

## What is already done
- The package is built (`Affilyatics.com.zip` in the Projects folder, version 5.1.0, version_name 1.0, no fixed key) and **uploaded as the draft** of the item through the API.
- The listing texts and the three 1280x800 screenshots (`store/screenshot-*.png`) are ready in the repo. **The API cannot set them: you paste them in the dashboard.**
- The reviewer account (Lifetime Pro gift) is kept in the production database and in Firebase. Its login is in `C:\Perso\EBLYN\credentials\Affilyatics-reviewer-account.txt`.

## Before you start (5 minutes)
1. Production is up: open https://affilyatics.com/ and https://affilyatics.com/privacy/ (the privacy policy now mentions analytics, the push token and exchange rates).
2. Test the zip once in a clean Chrome profile: `chrome://extensions` > Developer mode > *Load unpacked* on an unzipped copy of `Affilyatics.com.zip` > sign in with a test account > check the account menu, Settings and the "Try Pro" flow. (The store version gets its own extension id: that is normal, sign-in works because that id is already registered with Google.)
3. Decide: **publish right after approval, or defer** (see step 7). Deferring is safer.

## Steps in the Developer Dashboard
Open https://chrome.google.com/webstore/devconsole with the Google account that owns the item and click **Affilyatics**.

1. **Package tab.** The draft must show **version 5.1.0**. If it still shows 5.0.0, click *Upload new package* and choose `Affilyatics.com.zip`. A package error appears here in red: fix it and upload again.
2. **Store listing tab.**
   - Description: paste "Detailed description" from `store/LISTING.md` (it now describes the 22 countries, exchange rates and the account menu).
   - Screenshots: delete the old three, upload `screenshot-1-dashboard-dark.png`, `screenshot-2-dashboard-light.png`, `screenshot-3-free-plan.png` (1280x800).
   - Check category (Productivity), language (English), website https://affilyatics.com/, support email contact@affilyatics.com. Optional: small promo tile 440x280 and marquee 1400x560.
3. **Privacy tab** (this is where new permissions get questioned, take your time).
   - *Single purpose*: paste from `LISTING.md`.
   - *Permission justification*: one box per permission. Paste from `LISTING.md`: storage, alarms, declarativeNetRequest, identity, **gcm (new)**, notifications (optional), the **host permissions** box (now lists 23 sites, **new**), and "remote code: No".
   - *Data usage*: tick **Personally identifiable information** and **Authentication information**, and also **User activity** (the opt-in "share anonymous usage" sends the names of buttons pressed). Leave the others unticked. Tick the three certifications (not sold, not used for unrelated purposes, not used for credit).
   - *Privacy policy URL*: https://affilyatics.com/privacy/
4. **Distribution tab.** Keep the current setting. The item was approved as **unlisted** (anyone with the link can install): choose **Public** only when you want it findable in the store search. Regions: all. Pricing: free (Pro is sold on your own site).
5. **Test instructions tab** (reviewers read this). Paste:
   - the reviewer login from `Affilyatics-reviewer-account.txt` (it has a Lifetime Pro gift, so every feature is unlocked);
   - this note: "Sign in with the account above (email and password) inside the extension. The extension reads the user's own Amazon Associates reports through their signed-in session, so without an Associates account it shows the sign-in prompt of Amazon. A full demo with sample data is at https://affilyatics.com/demo/ . New in this version: the extension checks the 22 Amazon Associates country sites for the user's accounts (that is why the host permissions grew), and uses the gcm permission to receive a push that tells it a plan changed."
6. **Click "Submit for review"** (top right). If it refuses, a list of missing fields appears: fill them and try again.
7. In the dialog choose the publishing option: **Defer publishing** (you press Publish yourself after approval) or *Publish automatically*. Confirm.

## After submitting
- Status becomes **Pending review**. A review with new permissions usually takes a few days (sometimes up to two weeks). You get an email when it finishes.
- You cannot edit the draft while it is in review (you can cancel the review and edit).
- **If it is rejected:** the email and the *Status* tab say which policy. The likely questions for this release: "broad host permissions" (answer: one Associates site per country, read-only, the user's own reports), "gcm" (answer: plan-changed push, no content), "User activity" (opt-in, off by default). Fix the text or the package, upload again and resubmit.
- **If approved with deferral:** open the item and click **Publish**. Users on 5.0.0 get 5.1.0 within hours; because of the new permissions **Chrome disables the extension until each user accepts the new permissions** (a banner on the extension icon). Expect a few support questions.

## After release (the same day)
1. Install the store version in a clean profile: check that `chrome://extensions` shows **version 1.0** and that sign-in works.
2. Production website: run the production deploy again so it matches the tag (GitHub > Actions > "CI and deploy" > Run workflow > `deploy-production`).
3. Git: push the extension repo and the tags (`git push origin main --tags`) so GitHub matches the store, and create a GitHub release "V1.0" with the zip attached.
4. Watch for errors the first days: backoffice history, the Web Store "Reviews" and "Support" tabs.
5. If something is badly broken: there is no store rollback. Fix it and submit a higher version (5.1.1) as fast as possible; ask Claude to prepare it.

## Useful facts
- Version rule: the store only accepts a version number **higher** than the published one. "V1" is the human label (`version_name`); the number stays 5.x. Every new submission needs a higher number (5.1.1, 5.2.0...): bump `version` in `manifest.json` in both extension folders, then `python tools/package.py`.
- The extension id of the store version (`pikaeildnladnpjcakoglpheegipkokg`) differs from the GitHub/unpacked id (`fhccbomkecngijcmapafebjbbbmenahl`). Both Google sign-in return addresses are registered in Google Cloud. The store version and a GitHub copy have different ids, so both can be installed side by side; the two folders `Affilyatics` and `Affilyatics.local` share the fixed id, so Chrome can load only one of them at a time.
- Everything can also be done through the Web Store API with the credentials in `C:\Perso\EBLYN\credentials\Chrome-WebStore-API.txt` (upload, status, publish): ask Claude to submit or publish for you once you have checked the listing.
