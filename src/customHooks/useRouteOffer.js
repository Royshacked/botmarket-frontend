import { useState } from 'react'

// ── a desk handing the user to another desk, panel side ───────────────────────
// Any desk's `done` payload may carry the routing fields Axl's always has — `route` (a pipeline
// key), `routeSymbol`, `opening` (the receiving desk's first turn, in prose), `edit` (reopen an
// item) — because the user asked, in the chat, to be sent somewhere with a name. The server
// validated them (routing.util). What the panel does with them is the same everywhere: hold the
// offer, show a button (RouteOffer), and hand it to MainPage's one doorway when pressed.
//
// A hook rather than four lines per panel, so a new desk gets the hand-off by calling it and
// rendering the offer — and so the six existing ones cannot drift on what counts as "routes".

/** The routing fields of a done payload, or null when the turn routes nowhere. Pure. */
export function readRoute(data) {
    if (!data || (!data.route && !data.edit)) return null
    return {
        route:       data.route ?? null,
        routeSymbol: data.routeSymbol ?? null,
        opening:     data.opening ?? null,
        edit:        data.edit ?? null,
    }
}

/**
 * @returns {{ offer: ?object, capture: (data) => void, clear: () => void }}
 *   `capture(data)` in every onDone; `clear()` when a new turn starts or the chat is cleared.
 */
export function useRouteOffer() {
    const [offer, setOffer] = useState(null)
    return {
        offer,
        capture: (data) => { const r = readRoute(data); if (r) setOffer(r) },
        clear:   () => setOffer(null),
    }
}
