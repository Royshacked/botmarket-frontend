# How the frontend is wired

React + Vite, one page. The backend owns every rule about what an entity is and what a desk may do
(`../botmarket-backend/APP_SPEC.md`); this app is the surfaces those rules are seen through, and its
own architecture is about **one thing: many doorways into a few desks, without a second copy of any
mechanism.** Written 2026-09-19 from the code and its comments.

> **Rewritten 2026-10-20 for the unified chat** (`../botmarket-backend/docs/design/unified-chat.md`, the build record in
> `unified-chat-plan.md` §7–§11). The chat column is ONE conversation — the session timeline — with each desk's work in
> the side pane beside it. The desk tabs, the agent bar, the pipeline conveyor and the per-desk chat panels are gone;
> Pythia's and Aether's panels remain, as kept pane tabs with their own conversations.

## The page

`pages/MainPage.jsx` is the conductor — ~1,750 lines, 22 `useState`s: it holds what crosses between surfaces (the
lists, the positions, the dialogs, the marked accounts, the outside asks) and hands each surface its slice. Three
columns:

```
┌ workspace__left ─┐ ┌ workspace__chat ───────────────────────────────┐ ┌ workspace__right ──────────┐
│ FloorLeft        │ │ <ChatTimeline>            <SidePane>            │ │ FloorLists — the desks,    │
│ the book:        │ │  the session: every desk   the floor desk's     │ │ one open at a time; the    │
│ positions +      │ │  speaks here, under its    WORK (worksheet,     │ │ Calendar and Forecasts are │
│ ideas, one line  │ │  name and role; Axl's      plan, list, draft) + │ │ PANEL desks: they open in  │
│ each             │ │  greeting when it is new;  kept tabs (Pythia,   │ │ the DetailPanel over the   │
│                  │ │  History; the input        Aether, the ticket)  │ │ chat column                │
│                  │ │ + DetailPanelSlot (a row's detail docks over it)│ │                            │
└──────────────────┘ └─────────────────────────────────────────────────┘ └────────────────────────────┘
```

The Lists column's desks, in order (2026-10-14): Awaiting orders · Your trades · Your portfolios · Watchlists ·
Calendar · Forecasts · Research queue (admin, last). Events radar is `hidden: true` for now, not deleted. The
Calendar (`cmps/Floor/CalendarPanel.jsx`) is a month grid — per-day earnings / Fed / IPO counts, a clicked day
replacing the grid with that day's rows (`../botmarket-backend/docs/design/floor-calendar.md`); Forecasts is the
heat map of every industry (`ForecastPanel.jsx`). The Floor (`cmps/Floor/`) is a design variant (`useDesign() ===
'floor'`, `Ctrl+Shift+D`); the classic layout renders `TradeIdeasList` in the right column instead.

**One session per scope** (`customHooks/useSession.js`): the main chat's is shared through `SessionContext`, so the
timeline, the side pane and every doorway press the SAME one. Its state is folded from the socket's frames by
`services/session/sessionReducer.js` — rows, the live turn (text, reasoning, the tool status line with the stocks it
runs on), the floor, the chain, each agent's working state and revision. A commit (Generate / Update / Accept…) ends
the session: the desk's conversation is sealed onto the entity, and a fresh session opens with Axl, a line above his
greeting saying what was saved.

Agent keys (`axl · mentor · portfolio · scanner · analyst · strategy · aether`) are the one vocabulary —
`AGENTS` in `cmps/AxlHub/agentMeta.jsx` (brand, role, hue, glyph), the side pane's tabs, the session's `floor`.

## A desk's surface

The CONVERSATION is the timeline's; the WORK is a surface in the side pane (`cmps/SidePane/`), drawn from the desk's
state on the session — never from a reply. `SURFACES` in MainPage maps each agent to its surface:

| Surface | Draws | Presses |
|---|---|---|
| `MentorSurface` | the worksheet, the coverage chips, the gates, the account picker, the Generate / Update bar | a gate or a pick is a TURN (ops ride the message); a worksheet field is a hand EDIT; Generate / Update / Later are COMMITS |
| `PortfolioSurface` | the plan, the review's proposal, the adopt grid, the accounts | Generate plan / Update plan / Accept / Dismiss are commits |
| `ScannerSurface` | the list, the lens, the angle chips, a radar cut | Generate / Update list are commits; an angle is a turn |
| `AnalystSurface` | the coverage draft | Initiate / Update coverage are commits |
| `PythiaSurface` · `AetherSurface` · `TicketSurface` | Pythia's and Aether's own panels (their own chats, `useChatStream` over `/api/strategy` · `/api/aether` `/stream`), the order ticket | kept MOUNTED (`keepMounted`) through portals, so a half-typed draft survives a tab switch |

Every press goes through `useSurfacePress` → `useSession.commit` / `edit` / `send` (`POST /api/sessions/:id/act`,
`PATCH …/state`, `…/turn`), naming the agent's revision it was looking at — a stale one is refused and the surface
says so. In edit and review modes the bar is always on screen, dark until there is something valid to save. The pane
follows the floor (a pinned tab is not taken over), closes its desk tabs on a new session, and says what it is in one
line under its tabs (`paneHint`).

The timeline's own pieces live in `cmps/ChatTimeline/`: `TimelineRow` (a reply, a hand-off, a decision, a sealed or
ended line), `SpeakerTag` (the glyph, the agent's name, its role small under it), `ShowOffer` (a setup's window, the
ticket, the heat map, the calendar), `SessionHistory` (past sessions — read, delete, or write in one to pick it back
up). `ChatBubble`, `ChatInputRow`, `SuggestionChips`, `ToolStatusChip` and the chart dock are shared with the panels.

## Doorways — how something gets opened

Hand-offs between desks happen on the SERVER: Axl's or a desk's `<route>` moves the floor in the session and runs the
desk's first turn there; the side pane follows. What MainPage keeps is the doorways from OUTSIDE the chat — a card, a
list row, a calendar day — and each kind has ONE handler:

1. **A desk ON a sentence** — `talkTo(agent, text)`: a turn to that desk with the marked accounts (a card's "Build",
   a candidate's "Research", the market brief). Argus's table is asked about first when it holds work (`onArgusTable`).
2. **Reopening an item** — `editEntity(kind, id)`: `POST /api/sessions/:id/edit` reopens it IN the session, its
   sealed conversation loaded; a desk holding other unsaved work answers busy, and the user is asked. A card's reason
   rides as the desk's first turn (`ask`).
3. **A screen** — `handleOpenTicket(symbol)` (the ticket tab), `handleOpenView('heatmap' | 'calendar', symbol)` (the
   Floor's Forecasts / Calendar panels, through `deskRequest`), `openEntityPopup(kind, entity)` (a setup's window).
   Axl's `<show>` lands on these.
4. **Pythia's and Aether's routes** — `handleRoute(offer)`: their panels still offer a route (`RouteOffer`), which
   becomes a session turn, an edit, or the other panel's seed.

And one rule for **reading**: a card, a list pencil and an Axl `<edit>` reach an item by READING it by id —
`services/entityResolve.js` client-side, `services/desks/entityLookup.js` on the server — never out of a list this
client holds: a card can arrive before its list has loaded, and an empty list is indistinguishable from a failed
fetch. A failed read is `null`; tell the user. `pages/coverageRoute.js` keeps the judgment of WHICH surface a coverage
card wants (a `revise` reopens the desk, an `open` shows the book in the right column).

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
  `activeTab` change, `seedMentorChat`, coverage's Edit and every `openDesk` (the side pane, below),
  because the desk the user was sent to would otherwise open underneath the panel.
- **The shell is shared, the content is not.** Header (kicker = the desk, title, the row's chips as
  `meta`), close, Esc, focus in and back, scroll, the reading size for the lists' own `floor-detail`
  / `industry-view__detail` markup, and the header's `actions` slot, which is where features every
  panel gets go (coverage puts Edit / Retire / Delete there). An opener is a button with
  `aria-haspopup="dialog"` + `aria-expanded`, and that is the one selector that marks the open row
  in every list.

Driven end to end by `../botmarket-backend/scripts/drive-detail-panel.mjs`: both desktop layouts and a
touch tablet. The Lists column and the Calendar: `../botmarket-backend/scripts/drive-floor-lists.mjs`.

**The drawer shell and the side pane (unified chat, phase 8b — 2026-10-17).** The detail panel's
mechanics are `cmps/DrawerShell` now, shared with the side pane: Esc closes the TOP open shell only
(something above it that claims Esc first — the history drawer, the header menu — keeps it), focus in
and back, the handheld back gesture, portal or in place. `cmps/SidePane` is each desk's WORK beside the
timeline — the conversation is the timeline's, the surface draws the desk's state on the session
(`agentState`), never a reply. It follows the floor, pins, keeps a tab per desk; docked in
`.chat-with-pane` on a desktop (it does not take focus — it often opens on its own), a bottom sheet
under the dialogs on a handheld. ONE `useSession('main')` on MainPage is shared through
`context/SessionContext`; a surface presses three ways — a gate or pick is a TURN, a field is a HAND
EDIT (`session.edit`, naming the revision it was made against), a button is a COMMIT
(`session.commit`; a press first lets a settling edit land). The press mechanics are one hook,
`customHooks/useSurfacePress` (the marked accounts, one press at a time, the note, the stale refusal,
a `before` and an `again` step, and `edit`, which says a refusal); the note line is
`SidePane/SurfaceNote` and the frame the `.desk-surface` shell (SidePane.scss). What a press MEANS
stays in each surface: Mentor's `cmps/MentorSurface` (8b), Atlas's `cmps/PortfolioSurface` (8c — the
review bar, the AVOID ask, the adopt grid), Argus's `cmps/ScannerSurface` and Prometheus's
`cmps/AnalystSurface` (8d — the lens, the radar cut's Prometheus read handed back as a hand edit,
the coverage draft). New work onto Argus's table goes through one step on MainPage, `onArgusTable`
(asked over Argus's work, then a fresh table). The pipeline conveyor is gone: desks hand work on
through the server's chain. Every surface has Discard for unsaved work (`SidePane/DiscardButton`).

KEPT TABS (8e). Pythia's and Aether's panels — still their own chats — and the order ticket are pane
tabs that stay MOUNTED while hidden: each renders once, through a portal, into a host node of its
own, which `KeptSlot` moves into the pane while its tab shows; closing the pane parks them, and only
a tab's own ✕ ends one. An admin opens Pythia and Aether from a row under the chat's header. The
contract and the record: `../botmarket-backend/docs/design/unified-chat-plan.md` §10.2–10.6. Driven by
`../botmarket-backend/scripts/drive-{mentor,portfolio,scanner-analyst}-surface.mjs` and
`drive-pane-tabs.mjs`.

## Sessions, and what is left of threads

A conversation lives in the SESSION (`/api/sessions`): the live one is the chat; "New session" files it in History
under the user's first words (one they never spoke in is not kept), and a commit resolves it — the desk's conversation
is sealed onto the entity it produced (`agent_contexts`), reopened with it on the next edit. History lists the rest:
read one, delete it, or write in it to pick it back up (`POST /api/sessions/:id/resume`; the live one is filed).

Draft THREADS (`services/threads/`) are Pythia's and Aether's alone now — their panels save, link and discard them. Every
other desk's old threads were moved onto their entities by the phase-9 migration (`scripts/migrate-unified-chat.mjs`).

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
