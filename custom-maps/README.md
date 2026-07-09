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
| `packType` | no | `oneshot` (default — cleared after a win) or `mini_campaign` (replayable). |

4. Reload the game. Open **Shop → Missions** to purchase, then **Play vs AI → Missions → Store** to deploy.

## Notes

- Store missions need a valid `mission.events` array (briefings, timers, reinforcements) so they load through the mission runtime.
- Unlocked packs are stored under `ownedShopVisuals` as `shop_map_<id>`.
- One-shot completion is tracked in `storeMissions.spent`; mini-campaigns only use `storeMissions.completed`.
- Serve the repo root (e.g. local static server) — opening `index.html` directly may block `fetch` for local files.

## Regenerate Normandy

```bash
node scripts/generate-store-missions.js
```
