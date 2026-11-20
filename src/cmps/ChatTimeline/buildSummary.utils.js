// The build's summary, the pure half (BuildSummary.jsx; modes-and-builders.md step 6).

export const STALE_MIN = 30
export const CONFIRM = { mentor: 'generateArmed', portfolio: 'generate', analyst: 'generate' }

/** The desk action Confirm presses: a trade is saved and armed; a book's REVIEW is accepted; a new book or coverage saved. */
export function confirmAction(agent, state) {
    if (agent === 'portfolio' && state?.reviewMode) return 'accept'
    return CONFIRM[agent] ?? 'generate'
}
export const ROLE = { mentor: 'trader', portfolio: 'portfolio manager', analyst: 'analyst' }

/** The build the bar is about: a ready one first, else a failed one. Pure. */
export function barBuild(agentState) {
    for (const status of ['ready', 'failed']) {
        for (const agent of ['mentor', 'portfolio', 'analyst']) {
            const b = agentState?.[agent]?.build
            if (b?.status === status) return { agent, build: b }
        }
    }
    return null
}

/** Minutes since the build was ready (null when unknown). Pure but for the clock. */
export function ageMinutes(build, now = Date.now()) {
    const at = build?.readyAt ?? null
    return Number.isFinite(at) ? Math.max(0, Math.round((now - at) / 60_000)) : null
}

