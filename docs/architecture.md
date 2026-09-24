# How the frontend is wired

React + Vite, one page. The backend owns every rule about what an entity is and what a desk may do
(`../botmarket-backend/APP_SPEC.md`); this app is the surfaces those rules are seen through, and its
own architecture is about **one thing: many doorways into a few desks, without a second copy of any
mechanism.** Written 2026-09-19 from the code and its comments.

## The page

`pages/MainPage.jsx` is the conductor — ~3,300 lines, 38 `useState`s, and that is the honest shape:
it holds what crosses between surfaces (the open desk, the lists, the positions, the dialogs, what is
waiting at each desk) and hands each surface its slice. Three columns:

```
┌ workspace__left ─┐ ┌ workspace__chat ───────────────────────┐ ┌ workspace__right ──────────┐
│ FloorLeft        │ │ activeTab === 'axl' ? <AxlHub>          │ │ FloorLists — four desks,   │
│ the book:        │ │   : the desk panel for activeTab        │ │ one open at a time, the    │
│ positions +      │ │     (Mentor · Atlas · Argus ·           │ │ open one takes the column: │
│ ideas, one line  │ │      Prometheus · Pythia · Aether)      │ │ setups · ideas · scans ·   │
│ each             │ │   + PipelineCrumb, AgentSummon          │ │ calendar, Radar            │
└──────────────────┘ └─────────────────────────────────────────┘ └────────────────────────────┘
```

`activeTab` is the **agent key** (`axl · mentor · portfolio · scanner · analyst · strategy ·
aether`) — the same key `AGENTS` in `cmps/AxlHub/agentMeta.jsx` is keyed by, the contract registry is
keyed by, and a pipeline step's `tab` names. One vocabulary, so a desk is reachable without a second
mapping to keep in step. The Floor (`cmps/Floor/`) is a design variant (`useDesign() === 'floor'`,
`Ctrl+Shift+D`); the classic layout renders `TradeIdeasList` in the right column instead. Two of the
six panels remount on the way home to Axl (Argus, Atlas — a fresh conversation next time), four hide
with `display:none` and keep state; a desk mid-turn is exempt, because the server keeps the turn
running when the socket closes (`pages/deskReset.js`).

## A desk panel

Every desk is the same five parts, and the shared ones live once:

| Part | Where | What it owns |
|---|---|---|
| the stream | `customHooks/useChatStream.js` | the messages list, loading/status/phase, the typewriter drain, abort, "keep Stop live until the drain finishes", resume (▶) and its saved-history rule. `run()` owns the whole turn; the panel supplies the request and an `onDone` tail |
| the transport | `services/agentStream.js` → `services/sse.util.js` | ONE way to open an agent stream; only the endpoint and body fields differ per desk. `buildStreamHandlers` maps every SSE event a stream can emit; a stream that emits a subset simply never calls the rest |
| the opening turn | `customHooks/useSeedTurn.js` | a keyed one-shot `{ key, message }` SENT as the panel's next turn — the words are the user's, the hand-off says them. Keyed, not value-watched: one hand-off is one turn however often the panel re-renders |
| the way out | `customHooks/useRouteOffer.js` → `cmps/RouteOffer.jsx` | any desk's `done` may carry `route · routeSymbol · opening · edit` because the user asked to be sent somewhere; the panel holds the offer, shows *Go to {brand} · SYMBOL / Not now*, and hands the press to MainPage's one doorway |
| the contract | `cmps/<Desk>Panel/<desk>.contract.js` | what this desk emits and accepts, and how it takes delivery (see [hand-offs.md](./hand-offs.md)) |

What stays per desk is the panel's own body: its request params, its artifact preview (a `<setup>`
worksheet, a `<portfolio_plan>`, a `<scan_list>`), its `onDone`. `AgentChatInput`, `AgentMessages`,
`ChatPhaseHeading`, `ChatReasoning`, `ToolStatusChip`, `SuggestionChips` and the chart dock are the
shared rendering pieces every panel composes.

## Doorways — how something gets opened

Three kinds of arrival, and the rule is that each kind has ONE handler in MainPage:

1. **From the hub.** `AxlHub` is the one Axl surface — greets, shows the desk buttons, holds a real
   conversation, and *summons* a desk when Axl's reply carries a route (`handleAxlPick`). The
   hand-off is the user's own ask plus Axl's `opening` sentence, seeded as the desk's first turn —
   every desk, including Pythia and Aether, which take it only for an admin: the server drops the
   route for a trader (`routing.util` `ADMIN_DESKS`), the summon checks the role again, and neither
   panel is mounted for a trader at all.
2. **From a desk, by the user's ask.** "Send NVDA to Prometheus" said at Argus: the reply carries the
   same route grammar Axl's does, the panel offers it, the press lands on the **same** doorway as the
   hub's summon (`handleRoute`). A hop added at any desk is a prompt edit there, never a handler here.
3. **From an artifact.** A desk finished and produced something the next desk takes — the conveyor
   ([hand-offs.md](./hand-offs.md)). Nothing in MainPage knows which two desks are talking.

And one rule for **reopening**: a social-chat card, a list pencil and an Axl `<edit>` all reach a
desk's edit/review mode by READING the entity by id — `services/entityResolve.js`, React → service →
HTTP → Mongo and back. Never out of a list this client holds, never a stale row on a failed read: a
card can arrive before its list has loaded, and an empty list is indistinguishable from a failed
fetch. That is how a portfolio review once got authored against no holdings. A failed read is `null`;
tell the user.

Reading the entity is only half of it — a card also says WHICH SURFACE it wants, and the two columns
answer different asks. `pages/coverageRoute.js` holds that judgment for coverage: a `revise` runs the
desk's update pipeline, an `open` puts the book up in the RIGHT column and leaves the left one alone,
and only an unresolved doc moves the desk. The left column's panels are kept mounted behind
`display:none` (most are not in `deskReset`), so switching to one shows whatever was last done there
— a card that switches desks for no reason appears to answer itself with the previous name's work.
(2026-09-24)

## Entities

The frontend mirror of the backend's entity layer, piece for piece:

| Backend | Frontend | |
|---|---|---|
| `entityCrud` | `services/entityApi.js` — `makeEntityApi` | one REST transport per owner-scoped kind: list-or-empty, get-or-null, delete, and the window broadcast that refreshes every open list after a write. The kind's own service keeps the judgment (what a Generate posts, what a verb means) |
| `entity/vocabulary.js` | `services/entityStatus.js` | the ONE lifecycle: `waiting → looking → hit → long \| short → closed`; a kind uses a subset, never a synonym |
| — | `customHooks/useEntityList.js` | one loader for every owner-scoped list, replacing three copies that each got loading state wrong differently |
| — | `cmps/EntityCard/` | one card frame for every kind — status, badge, title, summary, footer, controls; each kind's card is built on it |
| `kindForDoc` | `cmps/TradeIdeas/tradeIdea.utils.js` | `ideaWorkspaceMode`, `inWorkspace`, `isPortfolioReview`, `activatePortfolio` — the shared readings of an entity that several surfaces must agree on |

## The workspace

`customHooks/useWorkspaceMode.js` — `live | paper | manual`. A VIEW switch, not a router: the account
bound to an entity is what routes it. `resolveWorkspace(paperConnected, stored)` is copied verbatim
from the backend's `api/workspace/workspace.model.js` and the two must agree — paper-connected wins
over anything stored; the stored value decides manual vs live. localStorage stays the client's
synchronous source of truth (the account and position hooks read it without awaiting) and the server
is written alongside. `inWorkspace(list, workspace)` scopes every list of account-bound kinds
(`setup`, `portfolio`); scans and coverage bind to no account and are never filtered.

## Real-time

- **Agent streams** are SSE, one per turn, through `agentStream` (above).
- **Social chat** is a WebSocket (`customHooks/useChatWs.js`, `cmps/SocialChat/`): the feed every
  monitor posts into. A **card** is a message with a `type` and a `payload` — `portfolio_review`,
  `setup_manage`, `manual_entry` / `manual_exit`, `coverage_event`, `tilt_review`, `sleeve_sourced`,
  `market_brief_offer`… — rendered by its own bubble, sharing one collapsed-state shell. Resolution
  is ONE read (`cardResolution.js`): top-level `status` (`done | dismissed | superseded`) is the
  truth, the legacy payload flags a fallback, so a scrolled-back card still reads and a superseded
  one collapses instead of sitting in the feed as a second live ask. Visibility (`all | admin |
  own`) is filtered on the client from the message's own field.
- **Cross-tree state** that shares no context goes over `services/event-bus.service.js` (a review
  resolved → the portfolio list refetches its due set; a manual fill confirmed → the ideas list
  patches and positions refresh; a card's *Confirm order* → the app switches workspace and opens
  the dialog) or a `window` CustomEvent (`paper-mode-changed`). A `[]`-dep bus handler closes over
  first-render state — read a ref or fetch, never a render-scoped list.

## Pop-outs

An entity opens in a **real browser window**, not a modal: `pages/IdeaPage.jsx`, `pages/SetupPage.jsx`
(the setup's right column is *cards waiting on the user*, then three folded sections — *thesis ·
scenarios · Talos journal* — each a `cmps/FoldSection.jsx` whose summary line carries the section's
gist; `cmps/TradeIdeas/SetupPlan.jsx` is one block per scenario, `TalosJournal.jsx` is headed by the
NEXT CALL — when Talos reads next, on which candle, the prices that would wake it sooner — over the
rows, newest first). Everything a pop-out needs talks to the server
or closes the window — except re-drawing a plan, which happens in Mentor's chat in the main window.
`services/popupBridge.js` is that one channel back: the pop-out asks, the main window acts.

## Threads

A conversation that crossed the substantive floor but produced no artifact is a DRAFT thread
(`services/threads/`), resumable from `cmps/ThreadHistory/`, pinnable, TTL'd on the server. A thread
that produced something is reached through the thing it produced. `deskWork.js` turns "the user has
unfinished threads" into a badge on the one desk they walked out of, and a lock on every desk that
needs an agent busy elsewhere — a panel is a singleton.

## Conventions worth knowing

- `npm run build` writes into `../botmarket-backend/public/` — the backend serves the app.
- `httpService` is the only way out; it owns retries and the 401 redirect. Never fire an authed call
  while logged out (gate on `user`).
- `agentMeta.jsx` is data only — brand, hue, glyph, copy, `DESKS` — because mixing components with
  constants breaks Fast Refresh for every importer; `AgentSummon.jsx` has the pieces.
- Tests: Vitest + React Testing Library, 961 across 67 files, beside the component.
- `archive/` mirrors the backend's: the Kairos panel, its contract, the `/call/:id` pop-out — imported
  by nothing (`archive/README.md`).
