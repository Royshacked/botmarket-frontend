import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { AccountSelector } from '../AccountSelector/AccountSelector.jsx'
import { LaterButton } from '../LaterButton.jsx'
import { SuggestionChips } from '../SuggestionChips.jsx'
import { AdoptBookGrid } from '../AdoptBook/AdoptBookGrid.jsx'
import { adoptService } from '../../services/adopt/adopt.service.remote'
import { eventBus, REVIEW_RESOLVED } from '../../services/event-bus.service'
import {
    REVIEW_REQUEST, OPENINGS, ADOPT_OPENING, bookIdeas, buildSummary, planStatus, accountsMoved, bookPending,
    avoidQuestion, sleeveLine, pressReport, refusalText, describeChange,
} from './portfolioSurface.utils.js'
import '../PortfolioPanel/PortfolioPanel.scss'
import './PortfolioSurface.scss'

// ── Atlas's surface (unified-chat plan phase 8c) ─────────────────────────────
//
// What PortfolioPanel drew beside its own chat, drawn from ATLAS'S STATE ON THE SESSION instead: the book's thesis,
// the build summary, the house's limits on the plan, what the turn sent off to be researched, the review bar, the
// Generate / Update bar — and the adopt grid, reachable again (Axl's adopt marks Atlas `adopt`). The conversation is
// the timeline's.
//
// THE PRESSES (backend plan §10.2): the Review button and the opening chips are TURNS; Generate / Update / Accept /
// Dismiss / Later are COMMITS — the server saves the plan and the proposal it holds, never a copy from here; adopt
// mode is a HAND EDIT (the server stages the draft). The AVOID ask is one round trip: refused with the names → asked
// → pressed again with the OK (or, on a proposal, without those changes).

export function PortfolioSurface({ session, deskProps = {} }) {
    const { availableAccounts = [], selectedAccounts = [], setSelectedAccounts, mainAccountId = null, setMainAccountId, ideas = [], onSaved, onAdopted } = deskProps
    const accounts = useMemo(
        () => deskProps.accounts ?? availableAccounts.filter(a => selectedAccounts.includes(a.id)),
        [deskProps.accounts, availableAccounts, selectedAccounts],
    )
    const state = session?.agentState?.portfolio ?? null
    const rev   = session?.agentRev?.portfolio ?? 0
    const turning = !!session?.live

    const portfolioId  = state?.portfolioId ?? null
    const reviewMode   = state?.reviewMode === true
    const plan         = state?.pendingPlan ?? null
    const proposal     = state?.reviewUpdate?.changes?.length ? state.reviewUpdate : null
    const thesis       = state?.thesis ?? null
    const adoptDraftId = state?.adoptDraftId ?? null
    const adopting     = state?.adopt === true || !!adoptDraftId
    const notices      = state?.notices ?? {}

    const book = useMemo(() => bookIdeas(ideas, portfolioId), [ideas, portfolioId])
    const assetOf = (id) => book.find(i => i.id === id)?.asset ?? id ?? '—'
    const summary = buildSummary(plan, book)
    const { ready: planReady, hasSize } = planStatus(plan)
    const accountIds = accounts.map(a => a.id)

    const [pressing, setPressing]   = useState(false)
    const [note, setNote]           = useState(null)   // { kind: 'error'|'done', text, stale? }
    const [confirmDismiss, setConfirmDismiss] = useState(false)
    const [thesisOpen, setThesisOpen] = useState(true)

    // Atlas's table moved on — a note about the last one no longer applies (a stale one stays: its redraw is the point).
    useEffect(() => { setNote(n => (n?.kind === 'error' && !n.stale ? null : n)) }, [plan, proposal, portfolioId])
    useEffect(() => { setConfirmDismiss(false) }, [portfolioId, reviewMode])

    const talk = useCallback((text) => {
        setNote(null)
        return session.send(text, { agent: 'portfolio', accounts, mainAccountId })
    }, [session, accounts, mainAccountId])

    // ── adopt mode: the server stages the draft once; the grid reads it, re-read after every turn (a paste in the
    // chat is parsed into it server-side) ──
    const [adoptDraft, setAdoptDraft] = useState(null)
    const askedStage = useRef(false)
    useEffect(() => {
        // Out of adopt mode: a later adopt (Axl again) asks again.
        if (state?.adopt !== true) { askedStage.current = false; return }
        if (adoptDraftId || askedStage.current) return
        askedStage.current = true
        session.edit('portfolio', { adopt: 'start' }).then(out => {
            if (!out.ok) { askedStage.current = false; setNote({ kind: 'error', text: out.message }) }
        })
    }, [state?.adopt, adoptDraftId, session])
    useEffect(() => {
        if (!adoptDraftId) { setAdoptDraft(null); return }
        let live = true
        adoptService.refresh(adoptDraftId, {}).then(d => { if (live) setAdoptDraft(d) }).catch(() => {})
        return () => { live = false }
    }, [adoptDraftId, rev])

    async function endAdopt() {
        const out = await session.edit('portfolio', { adopt: 'end' })
        if (!out.ok) setNote({ kind: 'error', text: out.message })
        return out.ok
    }

    async function startAdopt() {
        askedStage.current = true
        const out = await session.edit('portfolio', { adopt: 'start' })
        if (!out.ok) { setNote({ kind: 'error', text: out.message }); return }
        talk(ADOPT_OPENING)
    }

    // ── the commits ──
    async function commit(action, { proposalPress = false } = {}) {
        if (pressing) return
        setPressing(true)
        setNote(null)
        const name = summary.name
        const wasReview = reviewMode
        const pending = bookPending(book)
        let args = { accounts, mainAccountId }
        let out = await session.commit('portfolio', action, args)
        if (!out.ok && out.reason === 'avoid_needs_ok' && out.extra?.avoid?.length) {
            if (window.confirm(avoidQuestion(out.extra.avoid, { proposal: proposalPress }))) {
                args = { ...args, avoidOk: out.extra.avoid.map(a => a.asset) }
            } else if (proposalPress) {
                args = { ...args, dropAvoid: true }
            } else {
                setPressing(false)
                setNote({ kind: 'error', text: 'Nothing was saved — the AVOID names were declined.' })
                return
            }
            out = await session.commit('portfolio', action, args)
        }
        setPressing(false)
        if (!out.ok) {
            if (out.reason === 'stale_state') { setNote({ kind: 'error', stale: true, text: 'Atlas moved on while you were looking — check the plan and press again.' }); return }
            setNote({ kind: 'error', text: refusalText(out) })
            return
        }
        const text = pressReport(action, out.result, { name, pending })
        if (text) setNote({ kind: 'done', text })
        const id = out.result?.portfolio?.portfolioId ?? portfolioId
        // A review resolved (accepted, dismissed, or an edit opened from it saved) clears the list's red pencil.
        if (wasReview && action !== 'later') eventBus.emit(REVIEW_RESOLVED, { portfolioId: id })
        onSaved?.({ action, result: out.result, portfolioId: id })
    }

    const has = adopting || portfolioId || plan || proposal || notices.screenRequests?.length || notices.coverageRequest
    if (!state || !has) {
        return (
            <div className="portfolio-surface portfolio-surface--empty">
                {note?.kind === 'done' && <p className="portfolio-surface__note portfolio-surface__note--done" role="status">{note.text}</p>}
                {note?.kind === 'error' && <p className="portfolio-surface__note portfolio-surface__note--error" role="alert">{note.text}</p>}
                <p className="portfolio-surface__lead">Nothing on Atlas&apos;s table. Tell Atlas about a portfolio in the chat, or start here:</p>
                <SuggestionChips
                    variant="intro"
                    disabled={turning}
                    onPick={(t) => talk(t)}
                    suggestions={[
                        ...OPENINGS,
                        { label: 'Adopt a book I hold at my bank', title: 'Paste your holdings — Atlas manages the book from here', action: true, onPick: startAdopt },
                    ]}
                />
            </div>
        )
    }

    const sleeves = sleeveLine(notices.screenRequests)
    const editing = !!portfolioId
    const canGenerate = planReady && accounts.length > 0
    const canUpdate = planReady || accountsMoved(book, accountIds, mainAccountId)
    const later = <LaterButton className="portfolio-panel__generate portfolio-panel__generate--cancel" onClick={() => commit('later')} disabled={pressing} />

    return (
        <div className="portfolio-panel portfolio-surface">
            {setSelectedAccounts && !adopting && (
                <div className="portfolio-surface__accounts">
                    <AccountSelector
                        accounts={availableAccounts}
                        selectedIds={selectedAccounts}
                        onChange={setSelectedAccounts}
                        mainAccountId={mainAccountId}
                        onMainChange={setMainAccountId}
                    />
                </div>
            )}

            {adopting && (
                adoptDraft ? (
                    <AdoptBookGrid
                        draft={adoptDraft}
                        onDraftChange={setAdoptDraft}
                        onAdopted={async ({ portfolioId: adopted, legs }) => {
                            await endAdopt()
                            setNote({ kind: 'done', text: `Adopted ${legs} holding${legs === 1 ? '' : 's'}.` })
                            onAdopted?.(adopted)
                        }}
                        onCancel={endAdopt}
                    />
                ) : (
                    <p className="portfolio-surface__lead">Opening the adoption…</p>
                )
            )}

            {editing && thesis && (thesis.strategy || thesis.targetExposures?.length > 0) && (
                <div className="portfolio-surface__thesis">
                    <button type="button" className="portfolio-surface__thesis-toggle" onClick={() => setThesisOpen(o => !o)} aria-expanded={thesisOpen}>
                        <span className="portfolio-surface__caret" aria-hidden="true">{thesisOpen ? '▾' : '▸'}</span>
                        Portfolio thesis{thesis.version != null ? ` · v${thesis.version}` : ''}
                    </button>
                    {thesisOpen && (<>
                        {thesis.strategy && <p className="portfolio-surface__thesis-text">{thesis.strategy}</p>}
                        {thesis.targetExposures?.length > 0 && (
                            <div className="portfolio-surface__exposures">
                                {thesis.targetExposures.map((e, i) => (
                                    <span key={i} className="portfolio-surface__exposure">
                                        {e.label}{e.target != null ? ` ${Math.round(e.target * 100)}%` : ''}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>)}
                </div>
            )}

            {summary.items.length > 0 && (
                <div className="portfolio-panel__build-summary">
                    <div className="portfolio-panel__build-summary-header">
                        <span className="portfolio-panel__build-summary-title">{editing ? 'editing —' : 'your portfolio —'}</span>
                        {summary.name && <span className="portfolio-panel__build-summary-name">{summary.name}</span>}
                        <span className="portfolio-panel__build-summary-count">
                            {summary.items.length} {summary.items.length === 1 ? 'idea' : 'ideas'}
                        </span>
                    </div>
                    <div className="portfolio-panel__build-summary-items">
                        {summary.items.map(item => (
                            <span key={item.asset} className="portfolio-panel__build-summary-item">
                                <span className="portfolio-panel__build-summary-asset">{item.asset}</span>
                                {item.quantity != null && <span className="portfolio-panel__build-summary-qty">×{item.quantity}</span>}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {(plan?.limits?.notes?.length ?? 0) > 0 && (
                <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant portfolio-panel__bubble--warning" role="note">
                    The house&apos;s limits on this plan:
                    <ul>{plan.limits.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </div>
            )}
            {plan && !planReady && !turning && (
                <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant portfolio-panel__bubble--warning">
                    {hasSize
                        ? '⚠️ Couldn’t fetch live prices to compute share quantities. Send Atlas a message to have it size the plan again.'
                        : '⚠️ This plan needs a position size before it can be saved. Tell Atlas the capital to deploy, or a quantity per asset.'}
                </div>
            )}

            {!turning && sleeves && (
                <div className="portfolio-panel__action-bubble portfolio-panel__coverage-notice">
                    <span className="portfolio-panel__coverage-notice-icon" aria-hidden="true">🔬</span>
                    <span>{sleeves}</span>
                </div>
            )}
            {!turning && notices.coverageRequest?.symbol && (
                <div className="portfolio-panel__action-bubble portfolio-panel__coverage-notice">
                    <span className="portfolio-panel__coverage-notice-icon" aria-hidden="true">🔬</span>
                    <span><strong>{notices.coverageRequest.symbol}</strong> queued for research — check back once coverage is ready.</span>
                </div>
            )}

            {/* What Accept will do, said before it is pressed — a proposal can close and trim live positions. */}
            {!turning && proposal && (
                <div className="portfolio-surface__proposal">
                    <span className="portfolio-surface__proposal-title">Atlas proposes{proposal.thesis ? ' (and a new thesis)' : ''}:</span>
                    <ul>{proposal.changes.map((c, i) => <li key={i}>{describeChange(c, assetOf)}</li>)}</ul>
                </div>
            )}

            {note && <p className={`portfolio-surface__note portfolio-surface__note--${note.kind}`} role={note.kind === 'error' ? 'alert' : 'status'}>{note.text}</p>}

            {!turning && !adopting && (
                <div className="portfolio-panel__action-bubble">
                    {confirmDismiss ? (
                        <div className="portfolio-panel__dismiss-confirm">
                            <span>Dismiss this review? The next review comes round on its schedule.</span>
                            <div className="portfolio-panel__dismiss-confirm-btns">
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" onClick={() => { setConfirmDismiss(false); commit('dismiss') }} disabled={pressing}>Confirm</button>
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--later" onClick={() => setConfirmDismiss(false)}>Cancel</button>
                            </div>
                        </div>
                    ) : reviewMode ? (
                        state.reviewed ? (
                            <>
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={() => commit('accept', { proposalPress: true })} disabled={pressing}>
                                    {pressing ? 'Applying…' : proposal ? `Accept changes (${proposal.changes.length})` : 'Accept — hold as is'}
                                </button>
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" onClick={() => setConfirmDismiss(true)} disabled={pressing}>Dismiss</button>
                                {later}
                            </>
                        ) : (
                            <>
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={() => talk(REVIEW_REQUEST)}>Review</button>
                                {later}
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" onClick={() => setConfirmDismiss(true)}>Dismiss</button>
                            </>
                        )
                    ) : editing ? (
                        <>
                            {proposal ? (
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={() => commit('accept', { proposalPress: true })} disabled={pressing}>
                                    {pressing ? 'Applying…' : `Accept changes (${proposal.changes.length})`}
                                </button>
                            ) : canUpdate ? (
                                <button className="portfolio-panel__generate" onClick={() => commit('update')} disabled={pressing || accounts.length === 0}>
                                    {accounts.length === 0 ? 'Mark an account to update' : 'Update plan'}
                                </button>
                            ) : (
                                <span className="portfolio-surface__hint">Tell Atlas what to change — “Update plan” appears once there is something to save.</span>
                            )}
                            {later}
                        </>
                    ) : planReady ? (
                        <button
                            className="portfolio-panel__generate"
                            onClick={() => commit('generate')}
                            disabled={!canGenerate || pressing}
                            title={canGenerate ? undefined : 'Mark a broker account above to generate this plan'}
                        >
                            {pressing ? 'Saving…' : 'Generate plan'}
                        </button>
                    ) : null}
                </div>
            )}
        </div>
    )
}

PortfolioSurface.propTypes = {
    session: PropTypes.shape({
        agentState: PropTypes.object,
        agentRev:   PropTypes.object,
        live:       PropTypes.object,
        send:       PropTypes.func.isRequired,
        commit:     PropTypes.func.isRequired,
        edit:       PropTypes.func.isRequired,
    }).isRequired,
    deskProps: PropTypes.shape({
        availableAccounts:   PropTypes.array,
        selectedAccounts:    PropTypes.array,
        accounts:            PropTypes.array,
        setSelectedAccounts: PropTypes.func,
        mainAccountId:       PropTypes.string,
        setMainAccountId:    PropTypes.func,
        // The user's ideas — a book's holdings are the ones carrying its portfolioId.
        ideas:               PropTypes.array,
        // After a saved press: the page refreshes what the book changed (the lists, the queue).
        onSaved:             PropTypes.func,
        // After an adoption: the page opens the book that now exists.
        onAdopted:           PropTypes.func,
    }),
}
