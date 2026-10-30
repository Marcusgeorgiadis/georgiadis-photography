# The newsletter

Visitors can ask for **dispatches by email**: a short note whenever a new outing goes up, with its best photograph and a link straight to the outing. The site offers it once (a small card, after a visitor has looked around) and keeps it in the header (the envelope) and the footer. Its page is `#/newsletter`.

`Newsletter.gs` does the rest as a Google Apps Script web app:

- **Sign-ups.** The site's form posts the address here. Each new address gets one email asking it to confirm, and nothing else is ever sent to an address that hasn't confirmed. Bots and floods are turned away: a hidden form field, three confirmations a day per address, 30 sign-up emails an hour in all.
- **The list.** Subscribers are kept in a Google Sheet in the account's Drive: "Georgiadis Photography newsletter", tab *Subscribers*, with each address's status (`pending`, `confirmed`, `unsubscribed`). The *Dispatches* tab records every outing announced and to how many people.
- **Announcing.** Every hour the script reads the site's outings feed, `data/dispatches.json`, which the build writes. An outing that has been on the site, unchanged, for six hours is emailed once to everyone confirmed, so a day still being uploaded goes out once, complete. Outings already on the site when the newsletter starts are never announced. Wildlife outings only: a session with the family dog stays off the list.
- **Leaving.** Every email has its own unsubscribe link, which works in one click on the site.

## Setting it up (once, about ten minutes)

1. **Choose the address it sends from.** Mail goes out from the Google account that installs the script, under the name "Georgiadis Photography". For an address of its own, create a free Google account for the gallery first (a Gmail address named after it) and do the steps below signed in to it. Your own account works too, but subscribers will then see that address.
2. **Install the script.** Go to [script.google.com](https://script.google.com), click **New project**, name it "Georgiadis Photography newsletter", and paste the whole of `Newsletter.gs` over the sample code. Save.
3. **Run `setupNewsletter`.** Choose it in the function menu and click **Run**. Google asks for permission: **Review permissions**, choose the account, then **Advanced** and **Go to Georgiadis Photography newsletter**, and **Allow**. (Google says "unverified" because the script is your own, not a published app.) This creates the subscriber sheet, schedules the hourly check and notes the outings already on the site.
4. **Deploy it.** **Deploy → New deployment**, click the gear and choose **Web app**. Set *Execute as* to **Me** and *Who has access* to **Anyone**, then **Deploy** and copy the **Web app URL** (it ends in `/exec`).
5. **Give the site the URL.** Put it in `site.js` as `const NEWSLETTER = "https://script.google.com/macros/s/…/exec";`. The card, the envelope and the newsletter page appear on the next deploy of the site.
6. **Optional:** run `sendNewsletterTest` to send yourself the dispatch and the confirmation email exactly as subscribers will see them.

## Day to day

- **Adding people yourself.** Sign them up with the form, giving `owner` as the source, and run `confirmAddedByOwner` to confirm them without waiting for them to click.
- **Sending the latest outing again.** `announceLatest` sends the newest outing on the site to everyone confirmed, even one that was up before the newsletter began.
- **Send straight away.** To announce a waiting outing without the six-hour wait, run `sendWaitingNow`. The wait itself is a script property, `SETTLE_HOURS` (Project Settings → Script properties).
- **How many a day.** A free Google account can send about 100 emails a day. A longer list is no problem: the rest go out the next day, picking up where they stopped.
- **Other settings** (all optional script properties): `SENDER_NAME` (the name mail comes from), `REPLY_TO` (where replies go, if not this account), `SITE_URL` (the public site).
- **Removing someone by hand.** Set their status to `unsubscribed` in the sheet.
- **Updating the script.** Paste the new version, save, then **Deploy → Manage deployments**, edit the deployment and choose **Version: New version**. The URL stays the same, so the site needs no change.
