import { useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { strategyService } from '../../services/strategy/strategy.service.remote.js'
import { useStrategyRun } from '../../customHooks/useStrategyRun.js'
import { VERDICT_LABEL, CAUSE_WORD, ORDER_LABEL, linkMoveLine, groupByOrder } from './assessmentWords.js'

// Pythia's THEMES — "Themes" on the Forecasts tab (backend docs/design/pythia-assessment.md §3, step 3).
// A theme is a value chain of GICS sub-industries in order — direct, suppliers, suppliers' suppliers — each
// with why it belongs, and, once approved and assessed, Pythia's verdict over the whole chain with each
// link's move. PYTHIA PROPOSES, THE ADMIN APPROVES (Roy, 2026-10-10): a trader sees approved themes only;
// an admin also sees the proposals waiting and approves, retires, asks for proposals and assesses.

function ThemeRow({ theme, isAdmin }) {
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(null)
    const [note, setNote] = useState(null)
    const a = theme.assessment
    const moves = new Map((a?.moved?.links ?? []).map(l => [l.code, l]))
    // A theme's Assess run survives a remount in the service's in-flight set (see strategy.service.remote).
    const assessing = useStrategyRun(`theme:${theme.id}`) || busy === 'Assess'
    const locked = Boolean(busy) || assessing
    async function act(label, fn) {
        if (locked) return
        setBusy(label)
        setNote(null)
        try {
            const r = await fn()
            setNote(r?.cost_usd != null ? `${label}: done · cost $${r.cost_usd.toFixed(4)}` : `${label}: done`)
        } catch (err) {
            setNote(`${label} failed — ${strategyService.runError(err)}`)
        } finally {
            setBusy(null)
        }
    }
    return (
        <div className={`industry-view__row${open ? ' industry-view__row--open' : ''}`}>
            <button type="button" className="industry-view__line" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                <span className="industry-view__head">
                    <span className="industry-view__name" title={theme.name}>
                        {theme.name}
                        {theme.status !== 'approved' && <i className={`themes-view__status themes-view__status--${theme.status}`}>{theme.status}</i>}
                    </span>
                    <span className="industry-view__conclusion" title={theme.thesis}>{a?.thesis ?? theme.thesis}</span>
                </span>
                <span className="screen-view__chips">
                    {a?.moved?.hype && <span className="assessment-view__hype" title="A direct link is up 100%+ in two years and 100%+ over the market — a crash risk flag">hype</span>}
                    {a && <span className={`assessment-view__verdict assessment-view__verdict--${a.verdict}`}>{VERDICT_LABEL[a.verdict] ?? a.verdict}</span>}
                    <span className="screen-view__horizon">{(theme.links ?? []).length} links</span>
                </span>
            </button>
            {open && (
                <div className="industry-view__detail">
                    <p className="industry-view__summary">{theme.thesis}</p>
                    {a && (
                        <p>
                            <span className="industry-view__label">Pythia&apos;s view</span>{' '}
                            <b>{VERDICT_LABEL[a.verdict]}</b> ({a.horizon}, confidence {a.confidence}) — {a.thesis}
                            {a.cause && <> · <i>moved by {CAUSE_WORD[a.cause.kind] ?? a.cause.kind}</i></>}
                        </p>
                    )}
                    {groupByOrder(theme.links).map(([order, links]) => (
                        <div key={order} className="industry-view__answer">
                            <span className="industry-view__answer-q">{order} · {ORDER_LABEL[order]}</span>
                            <ul className="themes-view__links">
                                {links.map(l => (
                                    <li key={l.code}>
                                        <b>{l.name}</b> — {l.why}
                                        {moves.get(l.code) && <span className="themes-view__move"> · {linkMoveLine(moves.get(l.code))}</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    {(theme.basket?.length ?? 0) > 0 && (
                        <p className="industry-view__meta">Named companies: {theme.basket.map(b => b.symbol).join(', ')}</p>
                    )}
                    <p className="industry-view__meta">Words its filings and news use: {(theme.terms ?? []).join(', ')}</p>
                    {isAdmin && (
                        <div className="assessment-view__assess">
                            {theme.status === 'proposed' && <button type="button" disabled={locked} onClick={() => act('Approve', () => strategyService.setThemeStatus(theme.id, 'approved'))}>Approve</button>}
                            {theme.status !== 'retired' && <button type="button" disabled={locked} onClick={() => act('Retire', () => strategyService.setThemeStatus(theme.id, 'retired'))}>Retire</button>}
                            {theme.status === 'retired' && <button type="button" disabled={locked} onClick={() => act('Approve', () => strategyService.setThemeStatus(theme.id, 'approved'))}>Re-approve</button>}
                            {theme.status === 'approved' && <button type="button" disabled={locked} onClick={() => act('Assess', () => strategyService.assessTheme(theme.id))}>{assessing ? 'Assessing…' : 'Assess now'}</button>}
                            <span role="status" aria-live="polite" className={note ? 'assessment-view__result' : undefined}>{note}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
ThemeRow.propTypes = { theme: PropTypes.object.isRequired, isAdmin: PropTypes.bool.isRequired }

function ProposeThemes() {
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState(null)
    const running = useStrategyRun('propose_themes') || busy
    async function run() {
        if (running) return
        setBusy(true)
        setNote(null)
        try {
            const r = await strategyService.proposeThemes()
            setNote(`${r.proposed?.length ?? 0} proposed, ${r.refused?.length ?? 0} refused, ${r.skipped?.length ?? 0} already approved · cost $${(r.cost_usd ?? 0).toFixed(4)}`)
        } catch (err) {
            setNote(`Failed — ${strategyService.runError(err)}`)
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className="assessment-view__assess">
            <button type="button" onClick={run} disabled={running}>{running ? 'Pythia is looking…' : 'Propose themes'}</button>
            <span role="status" aria-live="polite" className={note ? 'assessment-view__result' : undefined}>{note}</span>
        </div>
    )
}

export function ThemesView({ themes = [] }) {
    const isAdmin = Boolean(useAuth()?.isAdmin)
    const order = { approved: 0, proposed: 1, retired: 2 }
    const sorted = [...themes].sort((x, y) => ((order[x.status] ?? 3) - (order[y.status] ?? 3)) || String(x.name ?? '').localeCompare(String(y.name ?? '')))
    const waiting = themes.filter(t => t.status === 'proposed').length
    return (
        <div className="themes-view">
            <div className="industry-view__summary-bar">
                <span><b>{themes.filter(t => t.status === 'approved').length}</b> on the house list</span>
                {isAdmin && waiting > 0 && <span className="industry-view__flagged">{waiting} proposed, waiting for approval</span>}
                <span className="industry-view__legend">value chains across industries — Pythia proposes, an admin approves</span>
            </div>
            {isAdmin && <ProposeThemes />}
            {sorted.map(t => <ThemeRow key={t.id} theme={t} isAdmin={isAdmin} />)}
            {!themes.length && <p className="news-feed__empty">No themes yet.{isAdmin ? ' Ask Pythia to propose some.' : ''}</p>}
        </div>
    )
}

ThemesView.propTypes = { themes: PropTypes.array }
