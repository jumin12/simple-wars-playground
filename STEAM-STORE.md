# Steam shop deployment

The game sells these fixed USD products through Steam Wallet:

| Product | Steam item ID | Price | Grant |
| --- | --- | --- | --- |
| 1,000 Gold | 101 | $1 | 1,000 gold |
| 6,000 Gold | 102 | $5 | 6,000 gold |
| 15,000 Gold | 103 | $10 | 15,000 gold |

`store-catalog.js` defines product IDs, prices and the fivefold gold shop prices.
The server determines every price; requests cannot override it. Steam converts
USD purchases for other wallet currencies. Sovereign remains an achievement skin.

### Supporter Pack: no longer sold

The $10 Supporter Pack (in-game item **100**, and supporter DLC **5475970**) has
been withdrawn. The game no longer shows, advertises or checks it out, and the
server rejects `begin` for it as an unknown purchase. Do not reuse item ID 100.

Existing owners keep what they paid for. A player is a supporter when either:

- Steam verifies a direct, permanent license for DLC **5475970**
  (borrowed/family/café licenses do not count), or
- their account holds a granted, unreversed supporter order. Each stored order
  embeds a copy of its product, so these orders stay valid, and refunds and
  chargebacks still reverse them, without a catalog entry.

Supporters keep the Patron Gold skins for every unit and era and the era
unlocks. The Patron Gold card in the shop is shown to them only. Direct DLC
owners still receive the one-time 5,000-gold grant after Steam verifies their
license. Individually owned items are retained.

**Developer action required in Steamworks.** The code cannot stop Steam from
selling the DLC. Delist DLC **5475970** or stop its sales in Steamworks (and
remove any store-page or bundle text that advertises it). Until then, anyone who
buys the DLC on Steam still becomes a supporter in game. Keep the DLC app and
its ownership checks in place so existing owners remain recognised.

## Render

1. Review/apply `render-commerce.yaml` to create the PostgreSQL database in
   Ohio, matching the existing multiplayer web service. It intentionally creates no new relay service, avoiding a change to
   the production URL. Review the recurring charge in Render before creation.
2. On the existing `simple-wars.onrender.com` **web service**, configure the
   database's internal connection string as `DATABASE_URL` and a Steamworks
   **publisher** key with authentication, ownership and microtransaction access
   as `STEAM_PUBLISHER_KEY`. The key must cover app **5043620** and supporter
   DLC **5475970** (still checked so existing owners keep their entitlement).
   Keep credentials out of this repository and the static site.
3. Set `STEAM_MICROTXN_MODE=sandbox` and `STEAM_PURCHASES_ENABLED=1`, then deploy.
   The service creates its commerce tables automatically. The public
   `/api/steam/catalog` endpoint reports readiness and sandbox/live mode without
   revealing credentials. Missing credentials/database keep checkout disabled.
4. Run the Steam client as a Steamworks developer and test all three gold SKUs,
   cancellation, restore, reconnect and duplicate callbacks. Sandbox transactions
   do not deduct wallet funds. The shop explicitly labels this mode.
5. After successful testing, set `STEAM_MICROTXN_MODE=live` and redeploy. Live and
   sandbox account rows and settlement cursors occupy separate namespaces.
   Configure the Steam store's in-app purchase feature. Delist DLC **5475970**
   or stop its sales in Steamworks (see "Supporter Pack: no longer sold").

Use managed database backups and retain them through service/Steam updates.
Payment data never falls back to the relay's ephemeral profile JSON files.
The old multiplayer profile endpoints cannot change commerce balances.

## Purchase and recovery flow

The sandboxed preload invokes a small main-process bridge. A Steam Web API
ticket with identity `simple-wars-store` establishes an expiring backend
session after identity and base-game ownership verification. Neither tickets nor
bearer sessions are exposed to the renderer. The publisher key is server-only.

Orders are stored before `InitTxn`. An authorization callback triggers server
`QueryTxn`, identity/item/currency/price checks, `FinalizeTxn`, and a second query.
An atomic PostgreSQL transaction applies each settled grant once. A lost final
response or database write is recovered from Steam's settled state. Refresh can
finish an order that Steam confirms the user already approved, including after
a lost callback; it cannot authorize an unapproved order. Steam's regional sales
tax and inclusive VAT are checked against the stored price. A canceled or
unapproved checkout grants nothing.

Settlement reports run every minute with a persistent overlapping cursor.
Refunds and chargebacks reverse their one-time grant and supporter entitlement
(including supporter orders placed before the pack was withdrawn);
already-spent gold becomes a balance debt, preventing refunds from creating free
spendable currency. There is no trading/gifting of gold in this implementation.

The Steam wallet imports existing earned gold and individual cosmetics once.
Subsequent profile gold values are ignored. Existing bounded match/achievement
receipts and the credits secret reward are deduplicated in the database. Solo
gameplay rewards remain client-reported, as in the existing offline game; those
reports never act as payment receipts or grant the supporter product. Progress
reset does not reset Steam purchase records. Steam store spending requires a
connection; ordinary browser play retains its earned-gold shop.

## Validation

Run `node scripts/verify-steam-commerce.js` for real embedded PostgreSQL
rollback, concurrent spending, cold restart, exact uint64 IDs, callback replay,
failed/canceled orders, server prices, DLC ownership, refunds and bridge tests.
It also proves the Supporter Pack cannot be bought and that existing owners
(DLC or a stored supporter order) keep Patron Gold until a refund or chargeback.
No real money or production player data is used by these tests.

Run the store UI verification and the bundled web-game client before release.
`node scripts/verify-steam-sandbox.js` checks real Steam authentication and
restoration with an isolated desktop profile. Add `--purchase=gold1000` (or another
gold product ID) to open an actual no-charge sandbox authorization in the
Steam overlay. The script refuses to run against a live checkout backend.
`desktop/` contains the canonical Electron sources; copy these to the wrapper's
`electron/` directory and rebuild ASAR when changing native integration.
Runtime sync includes the catalog, art, commerce client and responsive stylesheet.

Official references:
- https://partner.steamgames.com/doc/features/microtransactions/implementation
- https://partner.steamgames.com/doc/webapi/ISteamMicroTxn
- https://partner.steamgames.com/doc/webapi/ISteamUserAuth
- https://partner.steamgames.com/doc/webapi/ISteamUser
- https://render.com/docs/blueprint-spec
