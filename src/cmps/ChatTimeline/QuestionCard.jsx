import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { accountOptions, initialAnswers, isAnswered, allAnswered } from './questionCard.utils.js'

// A BUILDER'S QUESTION CARD above the prompt box (docs/design/modes-and-builders.md M5/M6, step 4 — Roy, 2026-11-20:
// "like in Claude cli"): every question the build needs, at once — the options, "Other" where it is allowed, the account
// from this workspace's accounts — and one submit. Typing in the chat instead sets it aside (the server's rule).
const PLACEHOLDER = { name: 'Or type a ticker', size: 'e.g. $10,000', risk: 'e.g. $100, or 0.75% of the account', rr: 'e.g. 2.5' }

export function QuestionCard({ card, role, accounts, marked = [], main = null, onSubmit, busy = false }) {
    const questions = card.ref.questions
    const [answers, setAnswers] = useState(() => initialAnswers(questions, { marked, main, accounts }))
    const [sending, setSending] = useState(false)
    const [error, setError] = useState(null)
    const accountChoices = useMemo(() => accountOptions(accounts), [accounts])
    const ready = allAnswered(questions, answers)

    const set = (id, next) => setAnswers(a => ({ ...a, [id]: { ...(a[id] ?? {}), ...next } }))
    function toggle(q, label) {
        const a = answers[q.id] ?? {}
        // One answer per single-choice question: an option clears the Other text (the drive sent both, 2026-11-20).
        if (!q.multiSelect) return set(q.id, { choice: a.choice === label ? null : label, other: '' })
        const cur = Array.isArray(a.choice) ? a.choice : []
        set(q.id, { choice: cur.includes(label) ? cur.filter(c => c !== label) : [...cur, label] })
    }
    function toggleAccount(q, id) {
        const cur = answers[q.id]?.accountIds ?? []
        const next = q.multiSelect ? (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]) : [id]
        set(q.id, { accountIds: next })
    }

    async function submit() {
        if (!ready || sending) return
        setSending(true)
        setError(null)
        // The account(s) as the venue picker holds them — the turn binds to these — and their words for the builder.
        const out = {}
        let picked = []
        for (const q of questions) {
            const a = answers[q.id] ?? {}
            if (q.kind === 'account') {
                picked = accounts.filter(x => (a.accountIds ?? []).includes(String(x.id)))
                out[q.id] = { accountIds: a.accountIds, accountLabel: accountChoices.filter(o => a.accountIds.includes(o.id)).map(o => o.label).join(', ') }
            } else {
                out[q.id] = { choice: a.choice ?? null, ...(String(a.other ?? '').trim() ? { other: String(a.other).trim() } : {}) }
            }
        }
        const r = await onSubmit(out, picked)
        if (!r?.ok) setError(r?.message ?? 'Those answers did not go through')
        setSending(false)
    }

    return (
        <section className="question-card" aria-label={`The ${role}'s questions`}>
            <header className="question-card__head">
                <span className="question-card__title">{card.content}</span>
                <span className="question-card__role">{role}</span>
            </header>
            <div className="question-card__body">
                {questions.map(q => {
                    const a = answers[q.id] ?? {}
                    const done = isAnswered(q, a)
                    const choices = q.kind === 'account' ? accountChoices : q.options
                    return (
                        <fieldset key={q.id} className={`question-card__q${done ? ' is-done' : ''}`}>
                            <legend className="question-card__legend">
                                <span className="question-card__chip">{q.header}</span>
                                <span className="question-card__question">{q.question}</span>
                            </legend>
                            {q.kind === 'account' && !choices.length && (
                                <p className="question-card__note">No accounts in this workspace — connect or add one first.</p>
                            )}
                            <div className="question-card__options" role={q.multiSelect ? 'group' : 'radiogroup'}>
                                {choices.map(o => {
                                    const on = q.kind === 'account' ? (a.accountIds ?? []).includes(o.id)
                                        : q.multiSelect ? (a.choice ?? []).includes(o.label) : a.choice === o.label
                                    return (
                                        <button
                                            key={o.id ?? o.label}
                                            type="button"
                                            role={q.multiSelect ? 'checkbox' : 'radio'}
                                            aria-checked={on}
                                            className={`question-card__option${on ? ' is-on' : ''}`}
                                            onClick={() => (q.kind === 'account' ? toggleAccount(q, o.id) : toggle(q, o.label))}
                                        >
                                            <span className="question-card__option-label">{o.label}</span>
                                            {o.description && <span className="question-card__option-hint">{o.description}</span>}
                                        </button>
                                    )
                                })}
                            </div>
                            {q.other && (
                                <input
                                    className="question-card__other"
                                    type="text"
                                    value={a.other ?? ''}
                                    onChange={e => set(q.id, q.multiSelect || !e.target.value.trim() ? { other: e.target.value } : { other: e.target.value, choice: null })}
                                    placeholder={PLACEHOLDER[q.id] ?? 'Other — type it'}
                                    aria-label={`${q.header}: other`}
                                    maxLength={400}
                                />
                            )}
                        </fieldset>
                    )
                })}
            </div>
            <footer className="question-card__foot">
                {error && <span className="question-card__error">{error}</span>}
                <span className="question-card__hint">{ready ? 'Ready.' : 'Answer each question — or just type in the chat instead.'}</span>
                <button type="button" className="question-card__submit" onClick={submit} disabled={!ready || sending || busy}>
                    {sending ? 'Sending…' : 'Build it'}
                </button>
            </footer>
        </section>
    )
}

QuestionCard.propTypes = {
    card:     PropTypes.shape({ seq: PropTypes.number, content: PropTypes.string, ref: PropTypes.object }).isRequired,
    role:     PropTypes.string.isRequired,
    accounts: PropTypes.array.isRequired,
    marked:   PropTypes.array,
    main:     PropTypes.string,
    onSubmit: PropTypes.func.isRequired,
    busy:     PropTypes.bool,
}
