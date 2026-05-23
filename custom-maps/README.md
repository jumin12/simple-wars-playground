# Custom shop maps

Drop map editor exports here to sell them in the in-game **Shop → Maps** tab.

## Add a map

1. Open the **Map Editor** and build your scenario.
2. Export the map (same JSON format as **Export** in the editor — includes hexes, cities, units, forts, bridges, and start economy when saved from the editor).
3. Save the `.json` file in this folder, for example `my-scenario.json`.
4. Register it in `manifest.json`:

```json
{
  "maps": [
    {
      "id": "my-scenario",
      "name": "My Scenario",
      "description": "Two-front duel with a central lake.",
      "price": 150,
      "file": "my-scenario.json"
    }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique slug (letters, numbers, hyphens). |
| `name` | yes | Title shown in the shop. |
| `description` | no | Short blurb under the title. |
| `price` | no | Gold cost (default **150**). |
| `file` | yes | JSON filename in this folder. |

5. Reload the game (or refresh the page if running locally). Open **Shop → Maps** to preview, purchase, and load the map onto the skirmish setup screen.

## Notes

- Use the editor’s export so `hexList`, `cities`, `entities`, `forts`, `bridges`, and optional `savedStartEconomy` are included.
- Maps are fetched from `custom-maps/` relative to `index.html`, so serve the repo root (e.g. local static server) — opening `index.html` directly may block `fetch` for local files.
- Unlocked maps are stored in browser progress under `ownedShopVisuals` as `shop_map_<id>`.
