# Docs

The backend repo holds the domain: what an entity is, what each desk may do, every rule about money
(`../../botmarket-backend/README.md` · `APP_SPEC.md` · `CODE_MAP.md` · `docs/`). This folder holds
only what is the frontend's own — how the surfaces are wired, and the one mechanism that lives on
this side of the wire.

| Doc | Covers |
|---|---|
| [architecture.md](./architecture.md) | How the app is wired: MainPage as the conductor, the three columns, what every desk panel is made of, the three doorways and the one reopen rule, the entity mirror, the workspace, real-time and cards, pop-outs, threads |
| [hand-offs.md](./hand-offs.md) | **The conveyor between desks.** Artifacts keyed by kind, per-desk contracts, the hop that decides who comes next, the doors and why `clear` exists, what waits at each desk, and what does NOT travel this way |
| `../archive/README.md` | The frozen Kairos UI — imported by nothing |

Design records for what is built here live in the backend's `docs/design/`
([pipeline-service.md](../../botmarket-backend/docs/design/pipeline-service.md),
[talos-per-candle.md](../../botmarket-backend/docs/design/talos-per-candle.md) for the setup
pop-out) — one record per design, in the repo where the design was argued.

**The rule for this folder** is the backend's: a doc that describes something that shipped is a
record, not a plan, and must say which. When two docs cover one subject, merge them.
