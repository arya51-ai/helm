# Privacy Policy

_Last updated: June 2026_

Helm ("the app") helps a business owner see their own businesses and linked financial accounts
in one place. This policy explains what data Helm accesses, why, and how it is handled.

## What we access

When you choose to link a financial account, Helm uses **[Plaid](https://plaid.com)** to connect
to your bank or brokerage. We do **not** ask for or store your bank login credentials — you enter
those only inside Plaid's own secure Link flow. Through Plaid, with your consent, Helm accesses:

- **Investment holdings** — securities, quantities, cost basis, and market values — to show your
  portfolio and net worth.
- **Account balances** — available/current balances on depository accounts — to show cash on hand
  and a runway estimate.

We access only the data needed for these features and nothing more.

## How it's used

Account data is used solely to display your own financial picture inside Helm — your net worth,
cash position, and how your investments compare to your operating businesses. That's it.

- We do **not** sell your data.
- We do **not** share it with third parties for advertising or marketing.
- We do **not** use it to make decisions about you on anyone else's behalf.

## How it's stored

- Your Plaid **access token** is stored **server-side only** and is never exposed to the browser.
- Helm's Plaid API credentials live in server-side environment variables, never in client code or
  version control.
- In the current prototype, the data Helm displays is kept on your own device/session; it is not
  aggregated into a shared database.

## Disconnecting

You can unlink an account at any time by removing it in the app. You may also revoke Helm's access
to any institution directly from your [Plaid dashboard](https://my.plaid.com/). Removing a link
stops further access and discards the associated access token.

## Plaid

Your use of Plaid to link accounts is also governed by Plaid's
[End User Privacy Policy](https://plaid.com/legal/#end-user-privacy-policy).

## Contact

Questions about this policy or your data: **aryamehta0903@gmail.com**
