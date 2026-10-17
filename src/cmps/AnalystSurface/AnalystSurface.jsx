import { useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { LaterButton } from '../LaterButton.jsx'
import { PriceTarget } from '../PriceTarget/PriceTarget.jsx'
import { useSurfacePress } from '../../customHooks/useSurfacePress.js'
import '../PortfolioPanel/PortfolioPanel.scss'
import '../AnalystPanel/AnalystPanel.scss'
import './AnalystSurface.scss'

// ── Prometheus's surface (unified-chat plan phase 8d) ────────────────────────
//
// What AnalystPanel drew beside its own chat, drawn from PROMETHEUS'S STATE ON THE SESSION instead: the drafted
// coverage and the Initiate / Update / Later bar. A research RUN (a sleeve's queue, the hand back to Atlas) is the
// chain's — its "next name" is a decision card in the timeline — so nothing here paces it.
//
// ONLY A STANDING DRAFT IS SAVED (backend analyst.actions): the draft is also the conversation's subject, so a turn
// without a <coverage> block keeps it on the table and withdraws only the right to save it. House coverage is an admin
// write — a trader reads the draft, an admin saves it.

/**
 * The drafted coverage — the variant-perception thesis, our PT vs the Street (the gap = the edge), the rating, and the
 * monitorable kill-criteria. The header is always visible; the body folds so the bar below is never pushed off.
 */
export function CoverageDraft({ coverage }) {
    const [open, setOpen] = useState(true)
    const kills = Array.isArray(coverage.kill_criteria) ? coverage.kill_criteria : []
    return (
        <div className="analyst-panel__draft">
            <button type="button" className="analyst-panel__draft-head analyst-panel__draft-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                <span className="analyst-panel__asset">{coverage.symbol}</span>
                {coverage.rating && <span className={`analyst-panel__rating analyst-panel__rating--${coverage.rating}`}>{coverage.rating.replace('_', ' ')}</span>}
                <PriceTarget priceTarget={coverage.price_target} gap={coverage.gap} gapSource />
                <span className="analyst-panel__draft-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
                <>
                    {coverage.thesis && <div className="analyst-panel__thesis">{coverage.thesis}</div>}
                    {kills.length > 0 && (
                        <div className="analyst-panel__kills">
                            <span className="analyst-panel__kills-label">kill-criteria</span>
                            <ul>{kills.map((k, i) => <li key={i}>{typeof k === 'string' ? k : JSON.stringify(k)}</li>)}</ul>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
CoverageDraft.propTypes = { coverage: PropTypes.object.isRequired }

/** A refused save that the analyst can act on explains itself (the rating contradicts the target — `detail`). */
const refusalText = (out) => (out.extra?.detail ? `${out.message} — ${out.extra.detail}` : out.message)

export function AnalystSurface({ session, deskProps = {} }) {
    const { isAdmin } = useAuth()
    const { coverage = [], onSaved } = deskProps
    const { pressing, note, press } = useSurfacePress(session, 'analyst', deskProps, { brand: 'Prometheus' })
    const state   = session?.agentState?.analyst ?? null
    const turning = !!session?.live

    const draft     = state?.draft ?? null
    const proposal  = state?.standing === true && draft ? draft : null
    const editingId = state?.editing?.kind === 'coverage' ? state.editing.entityId : null
    const symbol    = draft?.symbol ?? state?.active_symbol ?? null
    // Already in the book → the save revises it (the server's initiateOrRevise decides; this is only the label).
    const inBook    = !!symbol && (coverage ?? []).some(c => String(c.symbol ?? '').toUpperCase() === String(symbol).toUpperCase())

    function commit(action, done) {
        return press(action, { done, refused: refusalText }).then(out => {
            if (out?.ok) onSaved?.({ agent: 'analyst', action, result: out.result })
        })
    }

    const noteLine = note && <p className="analyst-surface__note" data-kind={note.kind} role={note.kind === 'error' ? 'alert' : 'status'}>{note.text}</p>

    if (!proposal && !editingId) {
        return (
            <div className="analyst-surface analyst-surface--empty">
                {noteLine}
                <p className="analyst-surface__lead">
                    {draft
                        ? `Prometheus is working on ${symbol ?? 'a name'} — the draft appears here once it stands.`
                        : 'Buy-side research — a living thesis per name: a variant view, our price target vs the Street, and monitorable kill-criteria. Name a ticker in the chat to start.'}
                </p>
            </div>
        )
    }

    const label = editingId || inBook ? `Update coverage on ${symbol}` : `Initiate coverage on ${symbol}`
    return (
        <div className="portfolio-panel analyst-panel analyst-surface">
            {editingId && <p className="analyst-surface__lead">Revising {symbol ?? 'this thesis'}{proposal ? '' : ' — Prometheus drafts the new view when you ask it to.'}</p>}
            {proposal && <div className="analyst-panel__draft-wrap"><CoverageDraft coverage={proposal} /></div>}
            {noteLine}
            {!turning && (
                <div className="portfolio-panel__action-bubble">
                    {proposal && (isAdmin ? (
                        <button
                            className="portfolio-panel__review-btn portfolio-panel__review-btn--update"
                            onClick={() => commit(editingId ? 'update' : 'generate', (r) => `${r.coverage?.symbol ?? symbol} is ${r.revised ? 'revised' : 'in coverage'}.`)}
                            disabled={pressing}
                        >
                            {pressing ? 'Saving…' : label}
                        </button>
                    ) : (
                        <span className="analyst-panel__ask-hint">House coverage is saved by an admin.</span>
                    ))}
                    {editingId && <LaterButton onClick={() => commit('later')} disabled={pressing} />}
                </div>
            )}
        </div>
    )
}

AnalystSurface.propTypes = {
    session: PropTypes.shape({
        agentState: PropTypes.object,
        live:       PropTypes.object,
        send:       PropTypes.func.isRequired,
        commit:     PropTypes.func.isRequired,
        edit:       PropTypes.func,
    }).isRequired,
    deskProps: PropTypes.shape({
        // The house's coverage book — whether the name is already covered (the button's word).
        coverage: PropTypes.array,
        // After a saved press: the page re-reads the book and settles the research queue.
        onSaved:  PropTypes.func,
    }),
}
