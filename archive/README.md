# archive/

**Frozen UI. Nothing here is imported, routed, rendered, linted or tested.** Kept whole so a desk
can come back as a decision rather than as an archaeology project. Mirrors
`botmarket-backend/archive/` — read that one too; it carries the revival checklist for the API side.

## Kairos (the `call` desk) — archived 2026-08-18, DELETED 2026-11-10

Roy deleted Kairos outright on 2026-11-10, data included. The archived panel, lens options, remote
service and `/call/:id` page that lived here are gone (`git log --follow` recovers them), and so is
what had been kept for old history: `AGENTS.kairos`, `KairosBadge` / `HermesBadge`, `kairos` in
`BOT_IDS` (it is in `RETIRED_BOT_IDS` now), the call cards in `SocialChat/`, `CallCard` and the Calls
tab, `openCallPopup`, the `call` pop-out kind and `deriveCallOverlay`. The backend deleted the `call`
documents and the Kairos chat threads in the same change. Argus's hand-off field is `argus_pick` now.
The monitors' `hermesReasoning` preference is `talosReasoning` (`services/aiPrefKeys.js` moves a
browser's copy).

---

## Argus's list-building chat and the scan list (archived 2026-11-09)

**Why:** Roy archived Argus's chat for BUILDING SCAN LISTS, the list itself (the Floor's Watchlists, the Radar's
Scans tab) and the Events radar's "Scan with Argus" cut. Argus stays ONLY as Mentor's single-pick helper: Mentor sends
a user with no name to Argus (`<route>scan</route>`, from Mentor only — the server drops it from anyone else), Argus
finds ONE ticker and emits `argus_pick` (`kairos_pick` until 2026-11-10), and the chain carries it back to Mentor. Old `scan` documents stay in Mongo
untouched, just unreachable. The backend half is in `botmarket-backend/archive/README.md`.

| | |
|---|---|
| `cmps/ScannerSurface/` | the list-building surface — the list in progress, the trading/investing lens, the angle chips, `PrometheusStep` (the radar cut's batch read) and the Generate / Update / Later bar — with `scannerSurface.utils.js` and both tests |
| `cmps/ScannerPanel/ScannerPanel.scss` | the `scanner-panel__*` styles that surface drew with |
| `cmps/Radar/ScanList.jsx`, `ScanList.scss` | the Radar's Scans tab |
| `customHooks/useScans.js` | the scans list hook |
| `services/scanner/scanner.service.remote.js` | the `/api/scanner/scans` CRUD client |

Imports were recomputed for the new depth (they point back into `../../../src/`).

**What stays live:** `src/cmps/ScannerSurface/ScannerSurface.jsx` is a new, one-line surface ("Argus is finding one
name to trade — it goes on to Mentor by itself") because the side pane still mounts Argus while he works a hand-off.
`AGENTS.scanner`, `ArgusBadge` and `'scanner'` in `BOT_IDS` stay, so old threads and cards still render; the agent's copy now describes the hand-off.

**Removed, not archived (wiring, not UI):** the Floor's `scans` desk and `ScanRows` (`FloorLists.jsx`) and its sort
(`floor.sort.js`); the Scans hub card (`TradeIdeasList.jsx`) and the Radar's `scans` tab (`Radar.jsx`, now defaulting to
`earnings`); the "Scan with Argus" button (`AetherCandidates.jsx`) and `aetherService.getScanUniverse` / `batchRead`;
in `MainPage.jsx` `onArgusTable`, `handleScanRadar` / `radarBusy`, `handleEditScan`, `handleBuildFromCandidate` /
`handleResearchCandidate`, the `scan` case of `openForEdit`, the scanner branch of `handleDeskSaved` and the
`watchlists` view; the `watchlists` show label (`ShowOffer.jsx` — an old offer now draws no button rather than a dead
one); the `scan` getter in `services/entityResolve.js`; the Scan Desk entry in `agentMeta.jsx` `DESKS`. `handleRoute`
now opens nothing for a route to Argus — he is reached only through Mentor, on the server.

### Reviving Argus's lists

1. Move the files back under `src/` (`git log --follow`) and re-run the import fix in reverse.
2. `FloorLists.jsx`: the `scans` desk, `ScanRows` and its props; `floor.sort.js`: the `scans` options.
3. `MainPage.jsx`: `useScans`, `onArgusTable`, `handleScanRadar`, `handleEditScan`, `handleBuildFromCandidate`, the
   `scan` edit case, the `watchlists` view, and the scan props on `FloorLists` and the Radar.
4. `entityResolve.js` (the `scan` getter), `ShowOffer.jsx` (`watchlists`), `aether.service.remote.js` (the two calls),
   `AetherCandidates.jsx` (the button), `agentMeta.jsx` (the Scan Desk and Argus's list-building copy).
5. The backend must bring back its half first — the routes, the desk's actions and edits, and the radar endpoints.
