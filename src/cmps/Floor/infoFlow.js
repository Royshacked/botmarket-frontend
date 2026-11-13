// INFO AS A DIAGRAM (backend docs/design/one-axl.md §6, step 5, 2026-11-13; Roy: "instead of a lot of words — wherever we
// are, show a schema: hotlist — pick horizon → pick a name → build trade"). Which flow the user is in, its steps, and the
// one they are on — read off what the client already holds (the session's floor, each role's state, its rows, whether the
// Hotlist is open), never guessed. Nothing placeable → null, and Info shows its plain line. Pure.
//
// The doc had the server send `{ flow, step }` with each turn; the client already receives every role's state live, so
// the step is computed here from the same data instead of a second copy and a new payload field.

export const FLOWS = Object.freeze({
    hotlist:    { title: 'From the Hotlist',   steps: ['Pick a horizon', 'Pick a name', 'Build the trade', 'Arm it'] },
    trade:      { title: 'Building a trade',   steps: ['Direction', 'Horizon', 'Levels', 'Size', 'Confirm & arm'] },
    portfolio:  { title: 'Building a portfolio', steps: ['Mandate', 'Find names', 'Research', 'Allocate', 'Review'] },
    coverage:   { title: 'Researching a company', steps: ['Name', 'Research', 'Verdict & target'] },
    technicals: { title: 'How a stock trades', steps: ['Name', 'Measured profile', 'Example chart'] },
})

/** The trader's build record: what is SETTLED on the name being built (the server's ledger, mentorBuild.util). */
function settledOf(mentor) {
    const build = mentor?.draft?.build
    const name = (build?.names ?? []).find(n => n.asset === build?.active) ?? null
    return name?.settled ?? {}
}

/** Where a trade build stands: the first step not yet settled. */
function tradeStep(mentor) {
    const s = settledOf(mentor)
    if (!s.direction) return 0
    if (!s.horizon) return 1
    if (!s.entries) return 2
    if (!s.size) return 3
    return 4
}

/**
 * @param {{ floor?: string|null, agentState?: object, rows?: object[], hotlistOpen?: boolean }} p
 * @returns {{ key: string, title: string, steps: string[], current: number } | null}
 */
export function infoFlow({ floor = null, agentState = {}, rows = [], hotlistOpen = false } = {}) {
    const st = agentState ?? {}
    const mentorAt = st.mentor?.draft?.asset ? st.mentor : null
    const at = (key, current) => ({ key, ...FLOWS[key], current: Math.max(0, Math.min(current, FLOWS[key].steps.length - 1)) })

    // On the Hotlist, the horizon is always picked (a tab is always on): the user is picking a name — or, once the trader
    // has one, building the trade; a trade whose size is settled is one press from armed.
    if (hotlistOpen) {
        if (!mentorAt) return at('hotlist', 1)
        return at('hotlist', tradeStep(mentorAt) >= 4 ? 3 : 2)
    }
    if (floor === 'mentor') return at('trade', mentorAt ? tradeStep(mentorAt) : 0)
    if (floor === 'portfolio') {
        const p = st.portfolio ?? {}
        if (p.reviewMode) return at('portfolio', 4)
        if (p.pendingPlan) return at('portfolio', 3)
        if (p.mandate) return at('portfolio', 1)
        return at('portfolio', 0)
    }
    if (floor === 'analyst') {
        const a = st.analyst ?? {}
        return at('coverage', a.standing ? 2 : a.active_symbol ? 1 : 0)
    }
    if (floor === 'proteus') {
        const answered = (rows ?? []).some(r => r?.agent === 'proteus' && r?.role === 'assistant')
        return at('technicals', answered ? 2 : 0)
    }
    return null
}
