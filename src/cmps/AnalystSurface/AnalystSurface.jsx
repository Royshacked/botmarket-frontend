import { useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { LaterButton } from '../LaterButton.jsx'
import { PriceTarget } from '../PriceTarget/PriceTarget.jsx'
import { useSurfacePress } from '../../customHooks/useSurfacePress.js'
import { SurfaceNote } from '../SidePane/SurfaceNote.jsx'
import { ChatActions } from '../SidePane/ChatActions.jsx'
import { DiscardButton } from '../SidePane/DiscardButton.jsx'
import '../PortfolioPanel/PortfolioPanel.scss'
import '../AnalystPanel/AnalystPanel.scss'

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
    const upper     = (s) => String(s ?? '').toUpperCase()
    // The name of the thesis being revised is the EDIT's, not the draft's (phase 8d CR): a draft about another company
    // mid-revision is new work — Initiate saves it (backend analyst.actions, `elsewhere`), Later keeps it.
    const revising  = editingId ? (state?.editingSymbol ?? null) : null
    const symbol    = proposal?.symbol ?? draft?.symbol ?? state?.active_symbol ?? null
    const another   = !!revising && !!proposal?.symbol && upper(proposal.symbol) !== upper(revising)
    // Already in the book → the save revises it (the server's initiateOrRevise decides; this is only the label).
    const inBook    = !!symbol && (coverage ?? []).some(c => upper(c.symbol) === upper(symbol))

    function commit(action, done) {
        return press(action, { done, refused: refusalText }).then(out => {
            if (out?.ok && action !== 'later') onSaved?.({ agent: 'analyst', action, result: out.result })
        })
    }

    if (!proposal && !editingId) {
        return (
            <div className="desk-surface analyst-surface">
                <SurfaceNote note={note} />
                <p className="desk-surface__lead">
                    {!draft
                        ? 'Buy-side research — a living thesis per name: a variant view, our price target vs the Street, and monitorable kill-criteria. Name a ticker in the chat to start.'
                        : turning
                            ? `Prometheus is working on ${symbol ?? 'a name'} — the draft appears here once it stands.`
                            // A turn that ended without a <coverage> block withdrew the draft's right to be saved (a pass,
                            // a question) — said, rather than "working" over a desk that has stopped.
                            : `Prometheus's last answer on ${symbol ?? 'this name'} put up no draft to save — ask it for one when you are ready.`}
                </p>
                {draft && !turning && <DiscardButton what={`the ${symbol ?? ''} draft`} onDiscard={() => press('discard', { done: () => 'Discarded — Prometheus\'s table is clear.' })} disabled={pressing} />}
            </div>
        )
    }

    const name   = symbol ?? 'this name'
    const action = editingId && !another ? 'update' : 'generate'
    const label  = action === 'update' || inBook ? `Update coverage on ${name}` : `Initiate coverage on ${name}`
    return (
        <div className="portfolio-panel analyst-panel desk-surface analyst-surface">
            {editingId && (
                <p className="desk-surface__lead">
                    Revising {revising ?? symbol ?? 'this thesis'}
                    {another
                        ? ` — Prometheus's draft is about ${proposal.symbol}, another company: saving it starts its own coverage, and Later keeps it.`
                        : proposal ? '' : ' — Prometheus drafts the new view when you ask it to.'}
                </p>
            )}
            {proposal && <div className="analyst-panel__draft-wrap"><CoverageDraft coverage={proposal} /></div>}
            <SurfaceNote note={note} />
            {/* EDITING, the bar is always there (Roy, 2026-10-18): Update dark until Prometheus has a draft standing and
                while it answers. */}
            {(editingId || !turning) && (
                <ChatActions><div className="portfolio-panel__action-bubble desk-surface__bar">
                    {(proposal || editingId) && (isAdmin ? (
                        <button
                            className="portfolio-panel__review-btn portfolio-panel__review-btn--update"
                            onClick={() => commit(action, (r) => `${r.coverage?.symbol ?? name} is ${r.revised ? 'revised' : 'in coverage'}.`)}
                            disabled={pressing || turning || !proposal?.symbol}
                        >
                            {pressing ? 'Saving…' : label}
                        </button>
                    ) : (
                        <span className="analyst-panel__ask-hint">House coverage is saved by an admin.</span>
                    ))}
                    {editingId && <LaterButton onClick={() => commit('later')} disabled={pressing || turning} />}
                    {editingId && turning && <span className="analyst-panel__ask-hint">Prometheus is answering…</span>}
                    {!editingId && <DiscardButton what={`the ${symbol ?? ''} draft`} onDiscard={() => press('discard', { done: () => 'Discarded — Prometheus\'s table is clear.' })} disabled={pressing} />}
                </div></ChatActions>
            )}
        </div>
    )
}

// What this pane is, said once under its tabs (SidePane — Roy, 2026-10-19: the pane was not clear to a user).
AnalystSurface.paneHint = 'Prometheus’s draft coverage: the thesis and price target. It fills in while you talk; the button at the bottom saves it.'

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
