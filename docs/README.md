# Docs

The backend repo holds the domain: what an entity is, what each desk may do, every rule about money
(`../../botmarket-backend/README.md` · `APP_SPEC.md` · `CODE_MAP.md` · `docs/`). This folder holds
only what is the frontend's own — how the surfaces are wired, and the one mechanism that lives on
this side of the wire.

| Doc | Covers |
|---|---|
| [architecture.md](./architecture.md) | How the app is wired: MainPage as the conductor, the three columns, the session timeline and the side pane's desk surfaces, the doorways and the one read rule, the entity mirror, the workspace, real-time and cards, pop-outs, the detail panel a list row's reading opens in, sessions and History |
| [hand-offs.md](./hand-offs.md) | **SUPERSEDED** — the client-side conveyor between desks, kept as the record; hand-offs now run on the server (the session's chain) |
| `../archive/README.md` | The frozen Kairos UI — imported by nothing |

Design records for what is built here live in the backend's `docs/design/`
([pipeline-service.md](../../botmarket-backend/docs/design/pipeline-service.md),
[talos-per-candle.md](../../botmarket-backend/docs/design/talos-per-candle.md) for the setup
pop-out) — one record per design, in the repo where the design was argued.

**The rule for this folder** is the backend's: a doc that describes something that shipped is a
record, not a plan, and must say which. When two docs cover one subject, merge them.
