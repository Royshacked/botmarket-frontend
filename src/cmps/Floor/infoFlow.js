// INFO AS A DIAGRAM (backend docs/design/one-axl.md §6, step 5, 2026-11-13; Roy: "instead of a lot of words — wherever we
// are, show a schema: hotlist — pick horizon → pick a name → build trade"). Which flow the user is in, its steps, and the
// one they are on — read off what the client already holds (the session's floor, each role's state, its rows, whether the
// Hotlist is open), never guessed. Nothing placeable → null, and Info shows its plain line. Pure.
//
// The doc had the server send `{ flow, step }` with each turn; the client already receives every role's state live, so
// the step is computed here from the same data instead of a second copy and a new payload field.

export const FLOWS = Object.freeze({
    // Talking with Axl, nothing open: one step (Roy, 2026-11-13: "maybe just — ask Axl").
    axl:        { title: 'Talking with Axl',   steps: ['Ask Axl'] },
    hotlist:    { title: 'From the Hotlist',   steps: ['Pick a horizon', 'Pick a name', 'Build the trade', 'Arm it'] },
    trade:      { title: 'Building a trade',   steps: ['Direction', 'Horizon', 'Levels', 'Size', 'Confirm & arm'] },
    portfolio:  { title: 'Building a portfolio', steps: ['Mandate', 'Find names', 'Research', 'Allocate', 'Review'] },
    coverage:   { title: 'Researching a company', steps: ['Name', 'Research', 'Verdict & target'] },
    // Two steps (Roy, 2026-11-13: "Proteus is measuring, then profiling with a chart example — only two steps").
    technicals: { title: 'How a stock trades', steps: ['Measuring', 'Profile & example chart'] },
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
export function infoFlow({ floor = null, agentState = {}, rows = [], hotlistOpen = false, list = null } = {}) {
    const st = agentState ?? {}
    const mentorAt = st.mentor?.draft?.asset ? st.mentor : null
    const at = (key, current) => ({ key, ...FLOWS[key], current: Math.max(0, Math.min(current, FLOWS[key].steps.length - 1)) })

    // INFO DESCRIBES WHAT IS ON SCREEN (Roy, 2026-11-13). An open LIST covers the chat, so Info belongs to the list
    // ("if the user opens one of the lists it covers the chat box — so Info now belongs to the list"): the Hotlist is
    // its own flow from its first step, whatever the chat behind it is building; a list whose Info is not written yet
    // shows its name — never the chat's diagram. The chat's flow comes back when the list closes.
    if (hotlistOpen || list?.key === 'hotlist') return at('hotlist', 0)
    if (list?.label) return { key: `list:${list.key}`, title: list.label, steps: [], current: 0 }
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
        // The newest row addressed to him: the user's question → he is measuring; his answer → the profile and its chart.
        const last = (rows ?? []).filter(r => r?.agent === 'proteus').at(-1)
        return at('technicals', last?.role === 'assistant' ? 1 : 0)
    }
    if (!floor || floor === 'axl') return at('axl', 0)
    return null
}
