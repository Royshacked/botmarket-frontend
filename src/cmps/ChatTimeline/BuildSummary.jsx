import { useState } from 'react'
import PropTypes from 'prop-types'
import { ChatBubble } from '../ChatBubble.jsx'
import { MentorTradeChart } from '../MentorSurface/MentorTradeChart.jsx'
import { tradeChartSetup } from '../MentorSurface/mentorSurface.utils.js'
import { lastStep } from '../SidePane/buildStatus.js'
import { STALE_MIN, ROLE, ageMinutes, confirmAction } from './buildSummary.utils.js'

// THE BUILD'S SUMMARY above the prompt box (docs/design/modes-and-builders.md M9/M14/M15, step 6 — Roy, 2026-11-20): a
// build is ready → the bar says so → "Watch summary" opens what was built — the builder's reasoning, the live trade chart
// (never an image) — and Confirm / Change / Dismiss. Confirm saves it (and arms a trade, as the old go did); a summary
// older than STALE_MIN is rechecked first. Change sends it back to the background with the user's words; Dismiss throws
// it away (the queued build, if any, starts). A failed build's bar offers Retry.

export function BuildBar({ agent, build, open, onOpen, onRetry, onDrop, onChange, busy = false }) {
    const [changing, setChanging] = useState(false)
    const [text, setText] = useState('')
    if (build.status === 'failed') {
        return (
            <div className="build-bar build-bar--failed" role="status">
                <span className="build-bar__text">{build.title} did not finish{build.failedBy === 'restart' ? ' — the app restarted' : ''}.</span>
                <button type="button" className="build-bar__btn" onClick={onRetry} disabled={busy}>Retry</button>
                <button type="button" className="build-bar__btn" onClick={onDrop} disabled={busy}>Dismiss</button>
            </div>
        )
    }
    // DECLINED (step 10): the builder's verdict is that there is no trade — said, with Change or Dismiss.
    if (build.status === 'declined') {
        return (
            <div className="build-bar build-bar--declined" role="status">
                <span className="build-bar__text">{agent === 'analyst' ? `${build.title}: the analyst passed — ${build.reason}` : `No trade on ${build.title.replace(/ trade$/, '')} — ${build.reason}`}</span>
                {changing ? (
                    <span className="build-bar__change">
                        <input value={text} onChange={e => setText(e.target.value)} placeholder={agent === 'analyst' ? "e.g. use the Street's FY2027 EPS" : 'e.g. build the long on the pullback anyway'} aria-label="The change" maxLength={1000} />
                        <button type="button" className="build-bar__btn" onClick={() => { onChange?.(text.trim()); setChanging(false); setText('') }} disabled={!text.trim() || busy}>Rebuild</button>
                    </span>
                ) : (
                    <button type="button" className="build-bar__btn" onClick={() => setChanging(true)} disabled={busy}>Change</button>
                )}
                <button type="button" className="build-bar__btn" onClick={onDrop} disabled={busy}>Dismiss</button>
            </div>
        )
    }
    return (
        <div className="build-bar" role="status">
            <span className="build-bar__text">{build.title} is ready — built by the {ROLE[agent]}.</span>
            <button type="button" className="build-bar__btn" onClick={onOpen} aria-expanded={open}>{open ? 'Hide summary' : 'Watch summary'}</button>
        </div>
    )
}
BuildBar.propTypes = {
    agent: PropTypes.string.isRequired, build: PropTypes.object.isRequired, open: PropTypes.bool,
    onOpen: PropTypes.func, onRetry: PropTypes.func, onDrop: PropTypes.func, onChange: PropTypes.func, busy: PropTypes.bool,
}

export function BuildSummary({ agent, build, session, accounts, mainAccountId, onClose, onError }) {
    const [mode, setMode] = useState(null)          // null | 'change' | 'dismiss'
    const [change, setChange] = useState('')
    const [sending, setSending] = useState(false)
    const state = session.agentState?.[agent] ?? null
    const reasoning = lastStep(session.rows, agent, build)
    const chart = agent === 'mentor' ? tradeChartSetup(state, accounts.length, false) : null
    const age = ageMinutes(build)
    const stale = age != null && age >= STALE_MIN

    async function run(fn, fallback) {
        setSending(true)
        const r = await fn()
        setSending(false)
        if (!r?.ok) onError?.(r?.message ?? fallback)
        else onClose?.()
        return r
    }
    const confirm  = () => run(() => session.commit(agent, confirmAction(agent, state), { accounts, mainAccountId }), 'It could not be saved')
    const recheck  = () => run(() => session.reworkBuild(agent, 'recheck'), 'The recheck did not start')
    const sendBack = () => run(() => session.reworkBuild(agent, 'change', change.trim()), 'The change did not go through')
    const dismiss  = () => run(() => session.commit(agent, 'discard'), 'It could not be dismissed')

    return (
        <section className="build-summary" aria-label={`${build.title} — summary`}>
            <header className="build-summary__head">
                <span className="build-summary__title">{build.title}</span>
                <span className="build-summary__meta">by the {ROLE[agent]}{age != null ? ` · ready ${age ? `${age} min ago` : 'just now'}` : ''}</span>
                <button type="button" className="build-summary__close" onClick={onClose} aria-label="Hide summary">✕</button>
            </header>
            <div className="build-summary__body">
                {reasoning && <div className="build-summary__reasoning"><ChatBubble msg={{ role: 'assistant', content: reasoning }} /></div>}
                {chart && <div className="build-summary__chart"><MentorTradeChart setup={chart} ready /></div>}
                {!reasoning && !chart && <p className="build-summary__note">The work is on the desk&apos;s pane.</p>}
            </div>
            <footer className="build-summary__foot">
                {mode === 'change' && (
                    <div className="build-summary__change">
                        <textarea
                            value={change}
                            onChange={e => setChange(e.target.value)}
                            placeholder="What should change? e.g. a tighter stop, only scenario A"
                            aria-label="The change"
                            rows={2}
                            maxLength={1000}
                        />
                        <button type="button" className="build-summary__btn build-summary__btn--primary" onClick={sendBack} disabled={!change.trim() || sending}>Rebuild it</button>
                        <button type="button" className="build-summary__btn" onClick={() => setMode(null)}>Cancel</button>
                    </div>
                )}
                {mode === 'dismiss' && (
                    <div className="build-summary__confirm">
                        <span>Throw this build away?</span>
                        <button type="button" className="build-summary__btn build-summary__btn--danger" onClick={dismiss} disabled={sending}>Dismiss it</button>
                        <button type="button" className="build-summary__btn" onClick={() => setMode(null)}>Keep it</button>
                    </div>
                )}
                {!mode && (
                    <div className="build-summary__actions">
                        {stale && <span className="build-summary__stale">Built {age} min ago — prices move.</span>}
                        {stale
                            ? <button type="button" className="build-summary__btn build-summary__btn--primary" onClick={recheck} disabled={sending}>Recheck it</button>
                            : <button type="button" className="build-summary__btn build-summary__btn--primary" onClick={confirm} disabled={sending}>{agent === 'mentor' ? 'Confirm — save and arm' : agent === 'portfolio' && state?.reviewMode ? 'Accept the review' : 'Confirm'}</button>}
                        {stale && <button type="button" className="build-summary__btn" onClick={confirm} disabled={sending}>Confirm as is</button>}
                        <button type="button" className="build-summary__btn" onClick={() => setMode('change')} disabled={sending}>Change</button>
                        <button type="button" className="build-summary__btn" onClick={() => setMode('dismiss')} disabled={sending}>Dismiss</button>
                    </div>
                )}
            </footer>
        </section>
    )
}
BuildSummary.propTypes = {
    agent: PropTypes.string.isRequired, build: PropTypes.object.isRequired, session: PropTypes.object.isRequired,
    accounts: PropTypes.array.isRequired, mainAccountId: PropTypes.string, onClose: PropTypes.func, onError: PropTypes.func,
}
