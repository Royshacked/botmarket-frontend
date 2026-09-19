# Hand-offs — the conveyor between desks

How one desk's output becomes another desk's opening, without either desk knowing the other exists.
Built 2026-08-04 → 08-19 (`src/services/pipeline/`); the design and its migration order are the
backend's [design/pipeline-service.md](../../botmarket-backend/docs/design/pipeline-service.md),
kept there as the record. This is the mechanism as it runs. Written 2026-09-19.

The one line: **a desk declares what it emits and what it accepts; the pipeline decides who comes
next; MainPage applies the plan. Nothing anywhere names the pair.**

## Why

A pipeline's *shape* was always declarative — `DESKS` in `agentMeta.jsx` lists each desk's steps and
the crumb renders from it. The *hops* were not: every arrow between two desks was a hand-written
handler in MainPage, each hand-rolling the same four moves (compose a seed sentence, remount the
right panel, clear the other hops' state, switch the tab) and each owning its own slot of state. The
real cost of a new pipeline was not the steps; it was the arrows, and they grew N². Worse, the
sender had to know the receiver, which is exactly the coupling that makes a pipeline impossible to
reorder.

## The four pieces

### 1. The artifact — `artifact.js`

Everything that crosses between desks travels in one envelope, **keyed by `kind` — WHAT it is — and
never by where it goes:**

| kind | from → to | carries |
|---|---|---|
| `scan_request` | Mentor → Argus | find me one name: a bias and a horizon |
| `mandate` | Atlas → Argus | screen this sleeve under this school |
| `candidate_list` | Argus → Mentor \| Prometheus | names, ranked, each with its analysis and a recommended lens |
| `coverage_set` | Prometheus → Atlas | what came back with a thesis |

`from` is kept as PROVENANCE, not routing ("researching for the Technology sleeve Atlas asked for");
nothing reads it to decide anything. `status` is `filled | empty | partial`, and **an empty artifact
is a result, not an absence**: a sleeve that screened to nothing is a decision for the desk
downstream — widen it, drop it, reallocate its weight — and one it cannot make if the empty is
quietly filtered out on the way. Each envelope carries a `key` (a counter rides beside `Date.now()`,
because two hops can be planned in one tick when a run advances automatically) so the panels seed on
a key, not a value.

### 2. The contract — `contracts.js` + `cmps/<Desk>Panel/<desk>.contract.js`

Each desk declares itself, beside its panel, because what an agent accepts and how it opens on it is
the agent's own business:

```js
export const mentorContract = {
    agent:   'mentor',
    accepts: [KIND.CANDIDATE_LIST],
    emits:   [],                 // a finished setup goes to Talos, and a monitor is not a desk
    mount:   'continues',        // never remounted on a hand-off: the panel holds the user's thinking
    deliver: 'artifact',         // the envelope whole — the lens must reach the prompt as data
}
```

`accepts` / `emits` are kinds. `mount` is `continues | fresh` — whether the receiving panel keeps its
conversation or starts clean. `deliver` is `artifact | seed` — whether the desk takes the envelope
whole (an INBOX) or opens on a sentence someone wrote for it (a SEED); a desk with a `brief` composes
that sentence in the contract, one without composes it in its panel where the seed it must agree with
is built — two openers for one hand-off is one of them going stale. **A desk with no contract accepts
nothing**, which is right: the conveyor must not route to a desk that has not said what it takes.
Declaring a contract for a desk with no hops looks like ceremony until it grows a second step — then
nothing here changes (proved in `deskSteps.test.jsx`).

### 3. The hop — `hop.js`

Pure: it decides, the caller applies. `findReceiver(steps, fromIndex, kind)` walks the pipeline's own
steps for one whose agent accepts the kind — **forward first, then backward**, because a pipeline
carries two different things in opposite directions: a RESULT moves on (Argus's list → the next
step), a REQUEST goes back (Mentor has no name yet → Argus, the step before it). Preferring forward
keeps a result from falling back into a desk that already ran; allowing backward lets a desk ask
upstream without anyone hard-coding the pair. Nearest match in each direction wins.

`planHop({ steps, fromIndex, artifact, mode })` → `{ agent, deliver, mount, seed? }` or null.
`planEntry({ steps, agent, artifact })` is entering a pipeline mid-way, named by agent.
`producesOne(steps, tab)` and `hasDownstream(steps, fromIndex)` answer the two questions a panel's
buttons ask.

### 4. The doors — `doors.js`

WHERE a delivered artifact lands: an inbox setter per desk that takes the envelope whole
(`scanner · analyst · mentor`), a seed setter per desk that opens on a sentence (`scanner ·
portfolio`). Mentor and Prometheus are seeded only from OUTSIDE a chain — a calendar row, an Axl
route — so they are deliberately absent from the seed table (a hop must not be able to open them) and
cleared anyway.

**`clear()` drops every door at once, and exists because of a live bug.** An effect keyed on an
artifact also runs on MOUNT, so a delivered artifact left in the sender's state is not inert: the
next time that panel remounts, the hand-off replays itself into a conversation nobody asked for. Seen
2026-08-16 — a finished AVGO setup, and half an hour later Argus's sentence sent itself to Mentor
again, opening a fresh draft off any pipeline and badging a desk the user had never been to. The
version that cleared doors by name named three of the five; the two it forgot were the two that
misfired.

## What is waiting at each desk — `useDeskHandoff`

Three slots per desk, one hook, replacing eleven `useState`s and 25 setter sites in MainPage that
were never designed as a group (one was still called `scanInbox` beside siblings named for their
desk, and a reducer keyed by desk cannot be built on keys that disagree on the desk's name —
`f4ec5a0`):

| slot | what | consumed by |
|---|---|---|
| `seed` | an opening TURN, `{ key, message }` | `useSeedTurn` — sent as the panel's next turn, once per key |
| `inbox` | a delivered ARTIFACT the desk unpacks itself | the panel's hand-off effect, keyed on the artifact |
| `chatRestore` | a whole CONVERSATION being reopened, with its draft | the panel's restore effect |

The seed *mechanism* is not here — `useSeedTurn` owns it, once, rather than a copy of the same
`useEffect` in each panel.

## Walking the chain

The user's position in a pipeline is DERIVED from the open tab (`pipelineNav.js`), so every
hand-off — the conveyor's, the hub's, a desk's route, any added later — keeps the crumb and the back
button honest without stamping a step number. Atlas stands at two different steps of the portfolio
desk (Mandate, Allocate), which is the ambiguity that file resolves. `scanOrigin.js` answers, the
same way everywhere it is asked, which desk asked for a scan — the user, a portfolio sleeve, or a
build hand-off — and therefore whether it saves to the scans list and whether the artifact it hands
on carries a `ref` (persisted) or only its items (inline for the run).

## What does NOT travel this way

- **A user's ask** ("send NVDA to Prometheus") crosses as a sentence, not an artifact — the
  `<route>` + `<open>` grammar every desk shares, validated by the server, offered by `RouteOffer`
  and landed on MainPage's one doorway ([architecture.md](./architecture.md), *Doorways*). It carries
  no fields because a sentence cannot be mistaken for a settled parameter.
- **Sleeve sourcing** (Atlas → Argus → Prometheus → Atlas, headless) runs on the server; the
  frontend sees a `sleeve_sourced` card and a *Resume build* button
  (`../../botmarket-backend/docs/desks/atlas-themis.md`).
- **The single pick** from Argus's hand-off mode rides the `<kairos_pick>` wire tag — it kept the
  name of the desk it was written for; the receiver is Mentor (`findReceiver` decides, the client
  never reads the name).

## Decided and deferred

From the design record's §8–§9, as they stand: desk resume survives a reload (built 2026-08-11);
entering a pipeline mid-way is `planEntry` (built); the run itself is not persisted — a finished run
removes its thread links, so "one `threadId` links them all" is not merely unbuilt, the current finish
path would have to change first; a name added after the hop needs nothing new if Argus already ranked
it, and a Prometheus request if not.
