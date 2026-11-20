// A builder's QUESTION CARD (docs/design/modes-and-builders.md step 4; backend services/desks/questions.js): the pure half —
// the open card in a session, the answers being filled in, whether every question is answered, the account options, and an
// answered card in words. The server checks the answers again; this only decides what the screen shows.

/** The account as the picker names it (AccountSelector's own words): a paper/manual account's name, else broker + login. */
export function accountLabel(a) {
    if (!a) return ''
    const virtual = a.broker === 'paper' || a.broker === 'manual'
    if (virtual) return a.name ?? (a.broker === 'manual' ? 'Manual' : 'Paper')
    return [a.broker, a.login].filter(Boolean).join(' ')
}

/** The workspace's accounts as an account question's options. */
export function accountOptions(accounts) {
    return (accounts ?? []).filter(a => a?.id).map(a => ({
        id: String(a.id), label: accountLabel(a),
        description: Number.isFinite(a.balance) ? `${a.currency ?? '$'} ${Math.round(a.balance).toLocaleString('en-US')}` : null,
    }))
}

/** The OPEN card of a builder in the session's rows — the last one, while it is open. Null when none. */
export function openCard(rows, agent) {
    for (let i = (rows ?? []).length - 1; i >= 0; i--) {
        const r = rows[i]
        if (r.kind === 'questions' && r.agent === agent) return r.ref?.state === 'open' ? r : null
    }
    return null
}

/**
 * The answers a card starts with: the recommended option where there is one, last time's number where it is offered, the
 * account(s) already marked. `marked`: the ids the venue picker has marked; `main` its main one.
 */
export function initialAnswers(questions, { marked = [], main = null, accounts = [] } = {}) {
    const ids = new Set(accounts.map(a => String(a.id)))
    const out = {}
    for (const q of questions ?? []) {
        if (q.kind === 'account') {
            const pick = marked.map(String).filter(id => ids.has(id))
            const ordered = main && pick.includes(String(main)) ? [String(main), ...pick.filter(id => id !== String(main))] : pick
            const chosen = q.multiSelect ? ordered : ordered.slice(0, 1)
            const only = !chosen.length && accounts.length === 1 ? [String(accounts[0].id)] : chosen
            if (only.length) out[q.id] = { accountIds: only }
            continue
        }
        const rec = q.options.find(o => /\(recommended\)$/i.test(o.label)) ?? q.options.find(o => /^As last time/.test(o.label)) ?? null
        if (rec) out[q.id] = { choice: q.multiSelect ? [rec.label] : rec.label }
    }
    return out
}

/** Is this question answered? An option, Other text, or an account. */
export function isAnswered(q, a) {
    if (!a) return false
    if (q.kind === 'account') return (a.accountIds ?? []).length > 0
    const picked = Array.isArray(a.choice) ? a.choice.length > 0 : !!a.choice
    return picked || !!String(a.other ?? '').trim()
}

/** Every question answered? */
export function allAnswered(questions, answers) {
    return (questions ?? []).every(q => isAnswered(q, answers?.[q.id]))
}

/** An answered card in words — one line per question, for the row it leaves in the chat. */
export function answeredLines(card) {
    const qs = card?.ref?.questions ?? []
    const as = card?.ref?.answers ?? {}
    return qs.map(q => {
        const a = as[q.id] ?? {}
        const value = q.kind === 'account' ? (a.accountLabel ?? 'the account picked')
            : [Array.isArray(a.choice) ? a.choice.join(', ') : a.choice, a.other].filter(Boolean).join(' — ')
        return { id: q.id, header: q.header, value }
    })
}
