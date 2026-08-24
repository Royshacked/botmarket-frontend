import { useReducer, useMemo } from 'react'

// ── WHAT IS WAITING AT EACH DESK ──────────────────────────────────────────────
//
// A desk is often opened with something already in hand: a scan Argus is holding, a ticker Axl
// routed, a conversation being reopened for edit. Three slots carry that, per desk:
//
//   seed        — an opening TURN, `{ key, message }`, sent by useSeedTurn. One hand-off, one turn.
//   inbox       — a delivered ARTIFACT the desk unpacks itself (a scan, a mandate, a candidate).
//   chatRestore — a whole CONVERSATION being reopened, with its draft.
//
// It was eleven `useState` declarations scattered through MainPage — `mentorSeed`, `scannerInbox`,
// `portfolioChatRestore` and so on — with 25 setter call sites between them, and the group was
// never designed as a group: one slot was still called `scanInbox` while its siblings were named
// for their desk. A new desk meant four more declarations in a 3,000-line component and finding
// every place its neighbours were cleared.
//
// WHAT THIS IS NOT. The seed MECHANISM is not here and does not belong here — `useSeedTurn` owns
// it (keyed one-shot, sent not staged) and the panels use it directly. This owns only the STORAGE
// and the shape. Nor are the RESET KEYS here: those drive remounts, and folding a remount trigger
// in with the things being handed over is how a desk silently keeps a conversation it should have
// dropped. They stay in MainPage until they can be moved on their own.

/** The desks that can be handed something. A new one is a row here and nothing else. */
export const HANDOFF_DESKS = ['scanner', 'analyst', 'mentor', 'portfolio']

/** The slots each desk has. Not every desk uses every slot; an unused one simply stays null. */
export const HANDOFF_SLOTS = ['seed', 'inbox', 'chatRestore']

/** Empty desks — every slot null. Pure, and the reducer's initial state. */
export function blankHandoffState(desks = HANDOFF_DESKS, slots = HANDOFF_SLOTS) {
    return Object.fromEntries(desks.map(d => [d, Object.fromEntries(slots.map(s => [s, null]))]))
}

/**
 * `{ type:'set', desk, slot, value }` — put something in one slot.
 * `{ type:'clearAll' }`               — drop everything in flight (leaving for the hub).
 *
 * PURE, and exported for its own tests. An unknown desk or slot is IGNORED rather than thrown on:
 * these are driven by hop plans and routing tags that can name a desk this build does not have, and
 * a hand-off arriving for an unknown desk should open nothing, not break the page that received it.
 *
 * A `set` that changes nothing returns the SAME state object, so React skips the re-render — which
 * matters because clearing already-empty slots is the common case on every route away from a desk.
 */
export function handoffReducer(state, action) {
    switch (action?.type) {
        case 'set': {
            const { desk, slot, value = null } = action
            if (!state[desk] || !(slot in (state[desk] ?? {}))) return state
            if (state[desk][slot] === value) return state
            return { ...state, [desk]: { ...state[desk], [slot]: value } }
        }
        case 'clearAll': {
            const empty = blankHandoffState(Object.keys(state), Object.keys(state[Object.keys(state)[0]] ?? {}))
            // Same-object return when everything is already empty, for the same reason as above:
            // handleBackToAxl clears on every exit and most exits have nothing in flight.
            const alreadyEmpty = Object.values(state).every(d => Object.values(d).every(v => v === null))
            return alreadyEmpty ? state : empty
        }
        default:
            return state
    }
}

/** `setMentorSeed`, `setScannerInbox`, … — the setter name a desk+slot pair answers to. */
export const setterName = (desk, slot) =>
    `set${desk[0].toUpperCase()}${desk.slice(1)}${slot[0].toUpperCase()}${slot.slice(1)}`

/**
 * The hand-off state for every desk, plus a setter per desk+slot under the name it has always had.
 *
 * THE SETTERS ARE GENERATED BUT NAMED, deliberately. `services/pipeline/doors.js` reads them off a
 * bag BY NAME (`setters.setScannerInbox`) to build its routing tables, and a hop that cannot find
 * its door opens nothing — silently, with no test catching it, which is exactly what happened when
 * one slot was renamed. Generating the names from the same table the state is built from is what
 * makes that impossible to get half-right.
 *
 * @returns {{ desks: object, setters: object, clearAll: function }}
 */
export function useDeskHandoff() {
    const [desks, dispatch] = useReducer(handoffReducer, undefined, () => blankHandoffState())

    // Stable across renders: these are handed to doors.js and to panels as props, and a fresh
    // identity every render would re-fire every effect keyed on them.
    const setters = useMemo(() => Object.fromEntries(
        HANDOFF_DESKS.flatMap(desk => HANDOFF_SLOTS.map(slot => [
            setterName(desk, slot),
            (value) => dispatch({ type: 'set', desk, slot, value: typeof value === 'undefined' ? null : value }),
        ])),
    ), [])

    const clearAll = useMemo(() => () => dispatch({ type: 'clearAll' }), [])

    /**
     * A desk's three slots, ready to spread onto its panel: `{...deskProps('mentor')}`.
     *
     * EVERY desk gets all three, including the ones it does not read — ScannerPanel takes no
     * `inbox`, AnalystPanel no `chatRestore`. An undeclared prop on a function component is simply
     * never destructured; none of these panels spreads its props onto a DOM node, so there is
     * nothing to leak. Handing over the same shape every time is what makes a new desk free.
     *
     * THE PROP NAMES ARE THE SLOT NAMES, and that had to be made true before this was safe:
     * ScannerPanel took its seed as `scanSeed`, so a uniform spread would have handed it a `seed`
     * it never reads and silently dropped every scan hand-off. It reads `seed` now, like the rest.
     */
    const deskProps = useMemo(() => (desk) => desks[desk] ?? blankHandoffState()[HANDOFF_DESKS[0]], [desks])

    return { desks, setters, clearAll, deskProps }
}
