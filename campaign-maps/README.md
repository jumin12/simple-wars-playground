# Campaign missions

Campaign maps live here, like shop maps in `custom-maps/`. **All ten missions can share one map file** — difficulty stacks via handicaps in `manifest.json`, not by editing the map ten times.

## Quick start

1. Open the **Map Editor** and build your scenario.
2. Design an **even start** (see checklist below).
3. **Export** the map JSON.
4. Save it as **`campaign-map.json`** in this folder (overwrite the placeholder).
5. Refresh the game → **Play vs AI → Campaign**.

Optional: use different files per mission by changing each mission’s `"file"` in `manifest.json`.

---

## Map editor checklist (mission template — even start)

Build **one** balanced map. Do **not** bake handicaps into the file; the game applies them from `manifest.json` at runtime.

| What to set in the editor | Player (green / owner **1**) | AI (red / owner **2**) |
|---------------------------|------------------------------|-------------------------|
| Territory | Roughly equal land area | Roughly equal land area |
| Cities | Same count (e.g. 3 each) | Same count |
| Factories | One per capital / fair split | One per capital / fair split |
| Starting units | Full army (e.g. 12–20 lights + 2 heavies) | Mirror the player |
| Starting cash (`savedStartEconomy`) | **10000** | **10000** (AI pools in export) |
| Starting manpower | **5000** | **5000** |

**Victory:** Domination (capture all enemy cities) unless a mission sets `"victoryMode": "annihilation"` in the manifest.

**Export must include:** `hexList`, `cities`, `entities`, `roads`, `forts`, `bridges`, `factionColors`, and `savedStartEconomy: true` with money/manpower fields (same as Map Editor export).

---

## Stacking difficulty (manifest only — do not edit the map)

All missions below use the **same** `campaign-map.json`. Only change `manifest.json` to tune difficulty.

| Mission | What gets harder for the **player** | Manifest fields |
|--------:|-------------------------------------|-----------------|
| **1** Opening Strike | Even start | Defaults (`1` multipliers, no caps) |
| **2** Thin Lines | Fewer starting troops | `"unitMul": 0.72` |
| **3** Tight Budget | Less starting cash | `"moneyMul": 0.68`, `"manpowerMul": 0.9` |
| **4** Contested Soil | Less starting land | `"landFrac": 0.84` |
| **5** Fewer Strongholds | Fewer starting cities | `"cityCap": 2` |
| **6** Underequipped | Troops + cash + half heavies | `"unitMul": 0.58`, `"moneyMul": 0.62`, `"manpowerMul": 0.82`, `"heavyMul": 0.5` |
| **7** Total War | Annihilation win + fewer troops | `"victoryMode": "annihilation"`, `"unitMul": 0.52`, `"heavyMul": 0.5` |
| **8** Broken Front | Land + cash + troops, no heavies | `"landFrac": 0.72`, `"moneyMul": 0.48`, `"manpowerMul": 0.75`, `"unitMul": 0.48`, `"heavyMul": 0` |
| **9** Last Bastion | One city, small realm | `"cityCap": 1`, `"landFrac": 0.58`, `"moneyMul": 0.32`, `"manpowerMul": 0.65`, `"unitMul": 0.32`, `"heavyMul": 0` |
| **10** One Rifle | One unit, one city, almost no cash | `"unitCap": 1`, `"cityCap": 1`, `"landFrac": 0.42`, `"moneyMul": 0.18`, `"manpowerMul": 0.5`, `"unitMul": 0.05`, `"heavyMul": 0` |

### Field reference

| Field | Description |
|-------|-------------|
| `id` | Mission number (1–10). |
| `name` | Title in the campaign UI. |
| `description` | Short blurb. |
| `file` | JSON filename in this folder. |
| `victoryMode` | `"domination"` or `"annihilation"`. |
| `baseMoney` | Baseline cash before `moneyMul` (default **10000**). |
| `moneyMul` | Player starting cash multiplier (AI unchanged). |
| `manpowerMul` | Player starting manpower multiplier. |
| `unitMul` | Player starting **light** army size multiplier. |
| `landFrac` | Fraction of player starting territory kept (rest → AI). |
| `cityCap` | Max cities the player keeps (extras → AI). |
| `heavyMul` | Player starting heavy count multiplier (`0` = none). |
| `unitCap` | Hard cap on player combat units (e.g. `1` for final mission). |

---

## Per-mission map files (optional)

To use a different layout per mission, export separate JSON files and point each mission at its file:

```json
{ "id": 4, "name": "Contested Soil", "file": "mission-04-custom.json", ... }
```

Handicaps in the manifest still apply on top of whatever is in that file.

---

## Progress & saves

Campaign unlocks and clears are stored **per player ID** on the game server (not shared between accounts). Each browser keeps only its player ID locally.

---

## Files in this folder

| File | Purpose |
|------|---------|
| `manifest.json` | Mission list + handicaps (edit to rebalance). |
| `campaign-map.json` | **Your exported map** — replace with editor export. |
| `mission-template.json` | Reference export shape (replace hexList/cities/entities with yours). |

Serve the repo root over HTTP (e.g. local static server) so `fetch('campaign-maps/...')` works.
