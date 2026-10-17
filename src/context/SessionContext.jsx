import { createContext, useContext } from 'react'

// ── The live session, shared (unified-chat plan phase 8b) ────────────────────
//
// ONE useSession per scope, owned by MainPage: the timeline draws it, the side pane's surfaces press it, and the
// doorways (a pencil, a calendar row, a card) speak through it. Two hooks would be two socket subscriptions and two
// copies of the revisions — a press from the pane would name a revision the timeline's copy had moved past.
//
// Optional on purpose: a ChatTimeline rendered without a provider (its own tests, an admin scope) runs its own.

export const SessionContext = createContext(null)

/** The shared session for `scope`, or null when none is provided for it. */
export function useSharedSession(scope = 'main') {
    const session = useContext(SessionContext)
    return session && session.scope === scope ? session : null
}
