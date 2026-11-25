# Custom shop missions

Drop map-editor / mission exports here to sell them in the in-game **Shop → Missions** tab. Owned missions appear under **Missions → Store**.

## Add a store mission

1. Build a scenario with a `mission` block (events + popups) — use `scripts/generate-store-missions.js` or the map editor.
2. Save the `.json` file in this folder, for example `normandy-dday.json`.
3. Register it in `manifest.json`:

```json
{
  "missions": [
    {
      "id": "normandy-dday",
      "name": "D-Day: Normandy",
      "description": "Storm the Atlantic Wall.",
      "price": 200,
      "file": "normandy-dday.json",
      "aiCount": 1,
      "packType": "oneshot"
    }
  ],
  "maps": []
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique slug (letters, numbers, hyphens). |
| `name` | yes | Title shown in the shop and Missions → Store. |
| `description` | no | Short blurb under the title. |
| `price` | no | Gold cost (default **150**). |
| `file` | yes | JSON filename in this folder. |
| `aiCount` | no | Enemy AI count when launched. |
| `packType` | no | `oneshot` (default — cleared after a win), `replayable`, or `campaign` (ordered stage pack). |
| `gamePeriod` | no | `modern` (default), `napoleonic`, `medieval` or `ancient`. The shop lists missions by era, modern first, and sells an older era's mission only to a player who owns that era's army (troop skin) as well as the gold; the server checks the same (`store-catalog.js` `missionEraSkin`). |
| `stages` | campaign | Array of stage entries with unique `id`, `name`, `file`, `aiCount`, era, date, objective and source links. The parent pack's `file` points to stage one's scenario for its shop preview. |

4. Reload the game. Open **Shop → Missions** to purchase, then **Play vs AI → Missions → Store** to deploy.

## Notes

- `mission.fullStartingArmy: true` starts every authored unit (older scenarios were authored at twice the size and keep every other unit of each type); `mission.enemyManpowerRate` (0-1) scales the manpower the computer's towns raise.
- Store missions need a valid `mission.events` array (briefings, timers, reinforcements) so they load through the mission runtime.
- Unlocked packs are stored under `ownedShopVisuals` as `shop_map_<id>`.
- One-shot completion is tracked in `storeMissions.spent`; campaigns use `storeMissions.completed` for each stage ID and the pack ID after every stage is complete. Every preceding stage must be complete before starting a later stage. Completed stages remain replayable.
- Scenarios may include `mission.objective` with `type: capture | hold | fleet | evacuate`. Capture requires all listed towns and their urban cells; hold requires friendly towns through the timer; fleet requires eliminating the opposing naval force; evacuation requires qualifying unloaded land units inside a dry destination zone after the timer. Existing missions without this field retain ordinary victory rules. Objective data survives map editor import/export.
- Serve the repo root (e.g. local static server) — opening `index.html` directly may block `fetch` for local files.

## Regenerate store missions

```bash
node scripts/generate-store-missions.js
```

Writes all 27 scenario JSONs and the shop manifest: four modern standalone missions, six era battles (two each for the ancient, medieval and Napoleonic eras, from `scripts/era-battles.js`) and seventeen stages in three campaign packs. Existing purchased IDs and prices are preserved. Generators validate era, empty buildings, town spacing, distinct unit placements and supplied ground starts. Historical sources and adaptations are documented in [HISTORICAL-NOTES.md](HISTORICAL-NOTES.md).

Campaign battlefield plans live in `scripts/historical-battlefields.js` and their armies, waves and economy in `scripts/historical-campaigns.js`; the standalone missions are authored in `scripts/modern-battles.js` and `scripts/era-battles.js`. `mission.battlefield` preserves north-up orientation, a geographic note and named `{name,x,y,kind}` landmarks. Roads can include a finite `points: [{x,y}, ...]` route rather than a straight endpoint link. Both survive editor and map snapshot round-trips. Authored maps with no roads do not receive automatic routes across water.
