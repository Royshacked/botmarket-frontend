// A BUILD IN THE BACKGROUND, as the screen says it (docs/design/modes-and-builders.md step 5b; backend desks/builds.js).
// Pure: the build of a builder, its words, the latest step it took (its last reply — a build's replies are the pane's,
// not the chat's), and which builds just changed (the pane opens; a ready one is announced).

export const BUILDERS = Object.freeze(['mentor', 'portfolio', 'analyst'])

const ROLE = { mentor: 'trader', portfolio: 'portfolio manager', analyst: 'analyst' }

/** The status in words. */
export function buildWords(agent, build) {
    if (!build) return null
    const who = `The ${ROLE[agent] ?? 'desk'}`
    switch (build.status) {
        case 'queued':   return `${build.title} — queued: it starts when the build ahead of it is done.`
        case 'building': return `${who} is building ${build.title} in the background. The chat is free meanwhile.`
        case 'awaiting': return `${who} needs you on ${build.title} — answer in the chat.`
        case 'ready':    return `${build.title} is ready. Review it here, then Generate.`
        case 'failed':   return `${build.title} did not finish — ask in the chat to try again.`
        default:         return null
    }
}

/** The builder's latest step: its last reply that belongs to the build (ref.build), or null. */
export function lastStep(rows, agent, build) {
    if (!build) return null
    for (let i = (rows ?? []).length - 1; i >= 0; i--) {
        const r = rows[i]
        if (r.agent === agent && r.role === 'assistant' && (r.ref?.build === build.id || r.ref?.fromBuild === build.id)) return r.content
    }
    return null
}

/** The builds by agent → `${id}|${status}` — what a change is detected on. */
export function buildKeys(agentState) {
    const out = {}
    for (const a of BUILDERS) { const b = agentState?.[a]?.build; if (b) out[a] = `${b.id}|${b.status}` }
    return out
}

/** Which builds started and which became ready between two snapshots (buildKeys). */
export function buildChanges(prev, next, agentState) {
    const started = [], ready = []
    for (const [a, key] of Object.entries(next)) {
        if (prev[a] === key) continue
        const status = agentState?.[a]?.build?.status
        if (status === 'building' || status === 'awaiting') started.push(a)
        if (status === 'ready') ready.push(a)
    }
    return { started, ready }
}
