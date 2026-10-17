import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ── A side-pane surface's presses, once (unified-chat plan phase 8c CR) ─────
//
// Every desk surface presses the same way: the marked accounts ride every turn and commit, one press at a time, a
// note says what happened, a STALE refusal says the desk moved on (the replay redraws), and a refusal says the
// server's words. That mechanism lives here — share the pipe; what each press MEANS (which action, what its result
// says, the AVOID ask) stays in the surface.
//
// NOTES: `{ kind: 'error'|'done', text, sticky? }`. A refusal's note is sticky — it stays until the next press or
// turn, through the frames that follow it (a stale press's replay, a refusal that narrowed the table). Any other error
// note clears when the desk's revision moves: what it was about has changed.

/**
 * @param {object} session   the shared useSession
 * @param {string} agent     the desk's agent key
 * @param {object} deskProps the pane's props (availableAccounts, selectedAccounts, accounts?, mainAccountId)
 * @param {{ brand: string }} opts  the desk's name, for the stale note
 */
export function useSurfacePress(session, agent, deskProps = {}, { brand }) {
    const { availableAccounts = [], selectedAccounts = [], mainAccountId = null } = deskProps
    // The marked accounts, memoised by the page (a fresh array per render would rebuild every callback that reads it).
    const accounts = useMemo(
        () => deskProps.accounts ?? availableAccounts.filter(a => selectedAccounts.includes(a.id)),
        [deskProps.accounts, availableAccounts, selectedAccounts],
    )
    const rev = session?.agentRev?.[agent] ?? 0

    const [pressing, setPressing] = useState(false)
    const [note, setNote] = useState(null)
    const busy = useRef(false)

    useEffect(() => { setNote(n => (n?.kind === 'error' && !n.sticky ? null : n)) }, [rev])

    /** A turn to this desk, with the marked accounts. `extra`: what the turn carries besides (Mentor's ops). */
    const talk = useCallback((text, extra = {}) => {
        setNote(null)
        return session.send(text, { agent, ...extra, accounts, mainAccountId })
    }, [session, agent, accounts, mainAccountId])

    /**
     * A commit. → the outcome, or null when it did not go out (a press already running, `before` said no, `again`
     * declined).
     * @param {string} action
     * @param {{ args?: object, before?: () => Promise<boolean>, again?: (out) => Promise<object|false|null>|object|false|null,
     *           done?: (result) => string|null, refused?: (out) => string|null }} [o]
     *   before   runs first (Mentor: let a settling hand edit land); false stops the press, its own note said why
     *   again    a refusal that asks the user something (the AVOID ask): extra args to press once more, false to stop
     *   done     the success note; refused  the refusal note (default: the server's words)
     */
    const press = useCallback(async (action, { args = {}, before, again, done, refused } = {}) => {
        if (busy.current) return null
        busy.current = true
        setPressing(true)
        setNote(null)
        try {
            if (before && !(await before())) return null
            const base = { accounts, mainAccountId, ...args }
            let out = await session.commit(agent, action, base)
            if (!out.ok && again) {
                const more = await again(out)
                if (more === false) return null
                if (more) out = await session.commit(agent, action, { ...base, ...more })
            }
            if (!out.ok) {
                setNote(out.reason === 'stale_state'
                    ? { kind: 'error', sticky: true, text: `${brand} moved on while you were looking — check the plan and press again.` }
                    : { kind: 'error', sticky: true, text: refused?.(out) ?? out.message })
                return out
            }
            const text = done?.(out.result)
            if (text) setNote({ kind: 'done', text })
            return out
        } finally {
            busy.current = false
            setPressing(false)
        }
    }, [session, agent, accounts, mainAccountId, brand])

    return { accounts, mainAccountId, rev, pressing, note, setNote, talk, press }
}
