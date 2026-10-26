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
| `stages` | campaign | Array of stage entries with unique `id`, `name`, `file`, `aiCount`, era, date, objective and source links. The parent pack's `file` points to stage one's scenario for its shop preview. |

4. Reload the game. Open **Shop → Missions** to purchase, then **Play vs AI → Missions → Store** to deploy.

## Notes

- Store missions need a valid `mission.events` array (briefings, timers, reinforcements) so they load through the mission runtime.
- Unlocked packs are stored under `ownedShopVisuals` as `shop_map_<id>`.
- One-shot completion is tracked in `storeMissions.spent`; campaigns use `storeMissions.completed` for each stage ID and the pack ID after every stage is complete. Every preceding stage must be complete before starting a later stage. Completed stages remain replayable.
- Scenarios may include `mission.objective` with `type: capture | hold | fleet | evacuate`. Capture requires all listed towns and their urban cells; hold requires friendly towns through the timer; fleet requires eliminating the opposing naval force; evacuation requires qualifying unloaded land units inside a dry destination zone after the timer. Existing missions without this field retain ordinary victory rules. Objective data survives map editor import/export.
- Serve the repo root (e.g. local static server) — opening `index.html` directly may block `fetch` for local files.

## Regenerate store missions

```bash
node scripts/generate-store-missions.js
```

Writes all 24 scenario JSONs and the shop manifest: seven standalone missions and seventeen stages in three campaign packs. Existing purchased IDs and prices are preserved. Generators validate era, empty buildings, town spacing, distinct unit placements and supplied ground starts. Historical sources and adaptations are documented in [HISTORICAL-NOTES.md](HISTORICAL-NOTES.md).
