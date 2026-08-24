import { useEffect, useRef } from 'react'

// ── one hand-off, one opening turn ────────────────────────────────────────────
// A desk is often opened WITH something already said: a calendar row hands Mentor its catalyst,
// Axl hands Prometheus the ticker the user just named. Every one of those is the same mechanism —
// a keyed one-shot seed, `{ key, message }`, sent as the panel's next turn — so it lives here once
// rather than as a copy of the same useEffect in each panel.
//
// Keyed, not value-watched: one hand-off is one turn however often the panel re-renders, and the
// same message can be handed over again later (a new key) without the panel deciding it's a repeat.
// SENT, not staged in the input: the words are the user's, the hand-off just says them for them.
// It lands in whatever conversation is open — a panel that must start clean resets before seeding.
//
// @param {?object} seed  { key, message } — null/undefined, or a message-less seed, does nothing
// @param {function} send the panel's own send (identity may change every render; captured by ref)
export function useSeedTurn(seed, send) {
    const sendRef = useRef(send)
    sendRef.current = send

    useEffect(() => {
        if (seed?.message) sendRef.current?.(seed.message)
    }, [seed?.key])   // eslint-disable-line react-hooks/exhaustive-deps
}
