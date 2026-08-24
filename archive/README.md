# archive/

**Frozen UI. Nothing here is imported, routed, rendered, linted or tested.** Kept whole so the desk
can come back as a decision rather than as an archaeology project. Mirrors
`botmarket-backend/archive/` — read that one too; it carries the revival checklist for the API side.

Archived 2026-08-18.

## What is in here

| | |
|---|---|
| `cmps/KairosPanel/` | the Kairos chat panel, its pipeline contract, `remapAsk` and its test |
| `cmps/kairosModeOptions.js` | the three lens options + the stored-mode reader |
| `services/kairos/` | the `/api/kairos` remote service |
| `pages/CallPage.jsx` | the `/call/:id` pop-out window |

## What did NOT come with it, and why

**The Calls tab, the call rows and the call order-confirm path were removed, not archived.** They
were wiring into MainPage rather than self-contained UI, so there was nothing to freeze — the
revival checklist below is what replaces them.

**Historical rendering was deliberately KEPT.** These are not oversights:

- `AGENTS.kairos` and `AGENTS.idea` in `agentMeta.jsx`, and `KairosBadge` / `HermesBadge` /
  `MinosBadge` in `AgentBadges.jsx`. A user's old threads and notification cards still carry those
  agent ids, and without the branding they render blank. This is the precedent `AGENTS.idea`
  already set when the Idea desk was archived in July.
- `'kairos'` in `BOT_IDS`, so the past bot feed still opens.
- `CallExpiryBubble`, `CallManageBubble` and the other call cards in `SocialChat/`. They are pure
  renderers over stored messages — the cards still display, they just no longer offer an *edit*
  that would land nowhere.

Erasing those would delete the user's own history, which is a product regression rather than
cleanliness.

## Behaviour that MOVED rather than died

| Was | Is now |
|---|---|
| A saved-list candidate seeded Kairos's inbox | seeds **Mentor's** (`handleBuildFromCandidate`). The artifact is unchanged — the live Argus → Mentor hand-off already hands Mentor this exact shape |
| `tradeFloorItems(calls, setups)` | `tradeFloorItems(setups)`. Rows still carry `kind`: a second trade kind is the expected case, not a special one |
| `positionOpenTarget(position, ideas, calls)` | an idea is the only owner a position can have |

## One live contract still carries the name

`kairos_pick` — the scanner's hand-off field. It is BOTH the wire field between
`api/scanner/scanner.controller.js` and this app AND the `<kairos_pick>` emit tag in Argus's prompt,
so it was left alone deliberately. Renaming it means moving five things in one commit — the prompt
tag, `ALL_EMIT_TAGS`, the agent's `buildTagCaptures`, the controller, and the reader here — and a
half-done rename drops the hand-off silently, which is exactly the failure `ALL_EMIT_TAGS` exists to
prevent. The local React state was renamed to `handoffPick`; the wire was not.

## Reviving

1. Move the files back under `src/` (`git log --follow`) and re-run the import fix in reverse.
2. `RootCmp.jsx`: restore the `/call/:id` route.
3. `services/entityResolve.js`: restore the `call` getter. `services/pipeline/contracts.js`: restore
   `kairosContract`. `services/pipeline/doors.js`: restore the `kairos` inbox door.
4. `MainPage.jsx`: restore the calls list (`loadCallsFn` + `useEntityList`), `handleEditCall` /
   `handleCallEditDone`, the `CALL_EXPIRY_EDIT` and `CALL_CONFIRM_OPEN` doorways, the call
   OrderConfirmDialog branch, the KairosPanel tab, and the call props on `FloorLists` / the Lists
   surface.
5. `Floor/floor.utils.js`: restore the `calls` argument to `tradeFloorItems`, and `callActions` in
   `FloorLists.jsx`.
6. Point `handleBuildFromCandidate` back at the Kairos inbox if the discovery hand-off returns.
7. Drop `'scan_request'` from `ARCHIVED_PRODUCERS` in `services/pipeline/hop.test.js` — Kairos was
   its only producer, and that guard is muted by name until it comes back.
