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
│ FloorLeft        │ │ activeTab === 'axl' ? <AxlHub>          │ │ FloorLists — the desks,    │
│ the book:        │ │   : the desk panel for activeTab        │ │ one open at a time, the    │
│ positions +      │ │     (Mentor · Atlas · Argus ·           │ │ open one takes the column; │
│ ideas, one line  │ │      Prometheus · Pythia · Aether)      │ │ a chip strip keeps every   │
│ each             │ │   + PipelineCrumb, AgentSummon          │ │ desk + count on screen.    │
│                  │ │   + DetailPanelSlot (a row's detail     │ │ Calendar is a PANEL desk:  │
│                  │ │     docks HERE, over the chat)          │ │ its month opens in the     │
│                  │ │                                         │ │ DetailPanel, not here      │
└──────────────────┘ └─────────────────────────────────────────┘ └────────────────────────────┘
```

The Lists column's desks, in order (2026-10-14): Awaiting orders · Your trades · Your portfolios ·
Watchlists · Analyst companies · Calendar · Forecasts · Research queue (admin, last). Events radar is
`hidden: true` for now, not deleted. An empty desk stays in place, dimmed; a request to open a
hidden or panel desk is ignored. The Calendar (`cmps/Floor/CalendarPanel.jsx`) is a month grid —
per-day earnings / Fed / IPO counts, the high-impact Fed days named — and a clicked day replaces the
grid with that day's rows; it replaced the Earnings, Fed and IPO desks. Record:
`../botmarket-backend/docs/design/floor-calendar.md`.

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
  `setup_manage`, `manual_entry` / `manual_exit`, `coverage_event`, `industry_view`, `sleeve_sourced`,
  `market_brief_offer`… — rendered by its own bubble, sharing one collapsed-state shell. Resolution
  is ONE read (`cardResolution.js`): top-level `status` (`done | dismissed | superseded`) is the
  truth, the legacy payload flags a fallback, so a scrolled-back card still reads and a superseded
  one collapses instead of sitting in the feed as a second live ask. A `message_resolved` push patches the open
  thread in place; the open conversation is recorded the moment it is selected, not in an effect after paint — a
  push landing while the thread loads was dropped before (2026-10-13). Visibility (`all | admin |
  own`) is filtered on the client from the message's own field.
- **Cross-tree state** that shares no context goes over `services/event-bus.service.js` (a review
  resolved → the portfolio list refetches its due set; a manual fill confirmed → the ideas list
  patches and positions refresh; a card's *Confirm order* → the app switches workspace and opens
  the dialog) or a `window` CustomEvent (`paper-mode-changed`). A `[]`-dep bus handler closes over
  first-render state — read a ref or fetch, never a render-scoped list.

## The detail surface (pop-outs, and the page on a phone)

An entity opens in a **real browser window**, not a modal: `pages/IdeaPage.jsx`, `pages/SetupPage.jsx`
(the setup's right column is *cards waiting on the user*, then three folded sections — *thesis ·
scenarios · Talos journal* — each a `cmps/FoldSection.jsx` whose summary line carries the section's
gist; `cmps/TradeIdeas/SetupPlan.jsx` is one block per scenario, `TalosJournal.jsx` is headed by the
NEXT CALL — when Talos reads next, on which candle, the prices that would wake it sooner — over the
rows, newest first). Everything a pop-out needs talks to the server
or closes the window — except re-drawing a plan, which happens in Mentor's chat in the main window.
`services/popupBridge.js` is that one channel back: the pop-out asks, the main window acts.

**ONE opener, two surfaces (2026-09-25).** `cmps/EntityCard/entityPopup.js` is the single doorway —
the Floor, the lists, the social-chat bubbles and Axl's `<show>` button (setups only — the one kind a desk read can name) all go through it — and it
decides which surface the click gets. A window is a desktop answer: on a phone `window.open` ignores
the size arguments and yields a TAB, which inside an installed PWA can leave the app altogether.
Three things break with that tab, and every one of them was silently broken before: it reports no
`window.opener`, so the *re-draw it in Mentor* hand-off rendered as a memo instead of a button;
`window.close()` after a delete is a no-op on a tab the script did not open; and the service worker
stops counting the app's only window as the app (`pwa/rules.js` `isPopoutPath`), so a push fires
while the user is reading the very setup it is about.

So a handheld (`isHandheld` — a coarse pointer, or the app's own 767px breakpoint) opens the SAME
page in place instead: `cmps/EntityCard/EntityDetailHost.jsx`, rendered from `RootCmp` beside a
MainPage that stays mounted (the trick `/profile` already uses, so the chat behind it survives).
It is a ROUTE, on a query param — `?setup=<id>` / `?idea=<id>` (`entityDetail.js`) — which is what
makes the phone's back button close it, a reload keep it, and the pathname stay `/` so the service
worker still sees the app. A sheet was the other candidate and is the wrong shape: nothing is behind
it to stay in context with under 767px, the body is a chart plus a nested-scrolling journal, and a
sheet earns no history entry, so back would leave the app instead of closing the page.

The pages take two props for it — `entityId` (a window reads its own `/setup/:id`; in the app there
is no path to read) and `onClose` (a window closes itself; in the app it is a history step back) —
and in place the re-draw ask needs no bridge at all: the page emits the same event on the app's own
bus that `popupBridge` re-emits it on, so MainPage's one handler takes both.

**The detail panel (2026-10-13).** Not every row has an entity page behind it. A coverage thesis, an
events-radar name (its evidence, Prometheus's quick read, the hand-off to Mentor) and Pythia's rows
(Assessed, Themes, Structure) are a page of reading, and they used to open as drawers inside the
lists column, at 10–12.5px, in a column 27% wide. They open in `cmps/DetailPanel/` now:

- **Where it lands.** On desktop, over the CHAT column: `DetailPanelSlot`, mounted once inside
  `.workspace__chat` (in both layouts), is the dock, and the panel is absolute over it. It is not
  a modal: the book and the lists stay live beside it, and the chat underneath stays MOUNTED, so a
  stream mid-turn is still there when the panel closes. On a handheld (`isHandheld`), or with no slot
  mounted, it is a full-screen page portalled to `<body>`, and a history entry on the same URL makes
  the back gesture close it, as with `EntityDetailHost`.
- **A portal, not a hand-off.** The row that owns the item renders `<DetailPanel id=…>` and its
  content; the panel only decides where that renders. So everything inside keeps the row's state and
  handlers: the quick read in flight, Trade with Mentor, the jumps between events, the theme admin
  buttons. That is why it is never a pop-out window: a window is a second copy of the app with none
  of that wired (the setup pop-out needs `popupBridge` for its ONE action back).
- **One open, across the app.** `detailPanel.store.js` holds the open id (`coverage:<id>`,
  `aether:<run>|<ticker>`, `industry:<code>`, `assessment:<id>`, `theme:<id>`, `calendar`); opening one closes
  the other. A panel closes with its row (desk closed, event collapsed, tab left), counted per id so a
  StrictMode remount or a re-keyed row does not shut it. A hand-off INTO the chat closes it too: an
  `activeTab` change, `seedMentorChat`, and coverage's Edit, because the desk the user was sent to
  would otherwise open underneath the panel.
- **The shell is shared, the content is not.** Header (kicker = the desk, title, the row's chips as
  `meta`), close, Esc, focus in and back, scroll, the reading size for the lists' own `floor-detail`
  / `industry-view__detail` markup, and the header's `actions` slot, which is where features every
  panel gets go (coverage puts Edit / Retire / Delete there). An opener is a button with
  `aria-haspopup="dialog"` + `aria-expanded`, and that is the one selector that marks the open row
  in every list.

Driven end to end by `../botmarket-backend/scripts/drive-detail-panel.mjs`: both desktop layouts and a
touch tablet. The Lists column and the Calendar: `../botmarket-backend/scripts/drive-floor-lists.mjs`.

## Threads

A conversation that crossed the substantive floor but produced no artifact is a DRAFT thread
(`services/threads/`), resumable from `cmps/ThreadHistory/`, pinnable, TTL'd on the server. A thread
that produced something is reached through the thing it produced. `deskWork.js` turns "the user has
unfinished threads" into a badge on the one desk they walked out of, and a lock on every desk that
needs an agent busy elsewhere — a panel is a singleton.

## The paths not taken — what a plan is NOT

> 2026-09-26. The backend contract is `botmarket-backend/docs/desks/mentor-talos.md` §The paths not
> taken; this is where the three records SHOW UP.

A setup now carries four things that describe the trade it is not, and all four are authoring record
— nothing in the monitor reads them, and nothing here writes them:

| field | where it shows |
|---|---|
| `scenarios[].archetype` | a borderless badge on the scenario header (`ScenarioBlock`), and a tag on the saved plan (`SetupPlan`) |
| `stop_legs[].anchor` / `target_legs[].anchor` | replaces the caption under the price box while building (`ZoneEditor`); an `abbr` beside the level on the saved plan |
| `alternatives[]` | `cmps/PathsNotTaken` — the rejects, one clause each |
| `challenges[]` | the same component: what was thrown at the DIRECTION, and what came back |

**`PathsNotTaken` is one component in three surfaces** — the live worksheet, the saved plan, and the
ORDER CONFIRM, which is where it earns its space: you are about to buy the pullback, and the gap that
was considered and skipped (with the reason) is the one thing you cannot reconstruct from the levels
in front of you. It renders **nothing** when both lists are empty, which is the ordinary case on a
plan the user brought (they chose the way in) and on one nobody has attacked.

`services/setupTaxonomy.js` holds the words and the tooltips. **An id this build has not heard of
degrades to the id with its underscores opened out and no tooltip** — readable, obviously
un-annotated, never a blank or a crash. That fallback is deliberate and it is why there is no test
asserting this client knows every archetype the server does: the coupling it would pin is the one the
fallback exists to survive.

Two more, from the same build: `validity.on_away` reads in the scenario's validity line (*"gone above
209 · let it go"*, or *"no answer yet if it runs"* — which is what Generate is refusing on), and
`readiness.warnings` gets its own quiet line under Generate that never joins the "still needs" list,
because a warning is not a refusal.

## Conventions worth knowing

- `npm run build` writes into `../botmarket-backend/public/` — the backend serves the app.
- `httpService` is the only way out; it owns retries and the 401 redirect. Never fire an authed call
  while logged out (gate on `user`).
- `agentMeta.jsx` is data only — brand, hue, glyph, copy, `DESKS` — because mixing components with
  constants breaks Fast Refresh for every importer; `AgentSummon.jsx` has the pieces.
- Tests: Vitest + React Testing Library, 1068 across 76 files, beside the component.
- `archive/` mirrors the backend's: the Kairos panel, its contract, the `/call/:id` pop-out — imported
  by nothing (`archive/README.md`).
