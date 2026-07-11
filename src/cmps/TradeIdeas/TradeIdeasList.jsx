import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { TradeIdeaRow } from './TradeIdeaRow.jsx'
import { ClosePositionDialog } from './ClosePositionDialog.jsx'
import { EditOrdersDialog } from './EditOrdersDialog.jsx'
import { ActivatePortfolioDialog } from './ActivatePortfolioDialog.jsx'
import { PositionsTable, posKey } from './PositionsTable.jsx'
import { formatCreatedAt, activationStatus, conditionSummary, brokerSymbolLabel, isDeleteLocked, isManualIdea, openIdeaPopup, formatPnl, ideaPnl, portfolioPnl } from './tradeIdea.utils.js'
import { eventBus, MANUAL_PORTFOLIO_ACTIVATE, MANUAL_PORTFOLIO_EXIT, REVIEW_RESOLVED } from '../../services/event-bus.service'
import { portfolioService } from '../../services/portfolio/portfolio.service.remote.js'
import { StatusIcon } from '../StatusIcon.jsx'
import { BrandTitle } from '../BrandTitle.jsx'
import { IdeaCard, BrokerGroupCard, PortfolioCard, BuildingPortfolioCard, PositionsCards } from './TradeIdeaCards.jsx'
import { CallCard } from './CallCard.jsx'
import { useDesign } from '../../customHooks/useDesign.js'
import './TradeIdeas.scss'

function _separateIdeas(ideas) {
    const standalone = []
    const groupMap   = new Map()   // portfolioId → portfolio group
    const brokerMap  = new Map()   // groupId → multi-broker group (forked children)

    for (const idea of ideas) {
        if (idea.portfolioId) {
            if (!groupMap.has(idea.portfolioId)) {
                groupMap.set(idea.portfolioId, {
                    portfolioId: idea.portfolioId,
                    name:        idea.portfolioName || 'Portfolio',
                    ideas:       [],
                    savedAt:     idea.savedAt,
                })
            }
            groupMap.get(idea.portfolioId).ideas.push(idea)
        } else if (idea.groupId) {
            if (!brokerMap.has(idea.groupId)) {
                brokerMap.set(idea.groupId, { groupId: idea.groupId, ideas: [], savedAt: idea.savedAt })
            }
            brokerMap.get(idea.groupId).ideas.push(idea)
        } else {
            standalone.push(idea)
        }
    }

    // A group with a single child (shouldn't happen — forking implies ≥2) is just a
    // normal idea; fold it back into standalone so it doesn't render as a group of one.
    const brokerGroups = []
    for (const g of brokerMap.values()) {
        if (g.ideas.length <= 1) standalone.push(...g.ideas)
        else brokerGroups.push(g)
    }

    const groups = [...groupMap.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    standalone.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    brokerGroups.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    return { standalone, groups, brokerGroups }
}

// Portfolio table row in the 'building' state (hammer) — reused for a brand-new portfolio taking
// shape (top row) and for an existing portfolio being edited (substituted for its group in place).
function BuildingPortfolioRow({ portfolio }) {
    return (
        <tr className="portfolio-group-row portfolio-group-row--building">
            <td className="portfolio-group-row__name">{portfolio.name}</td>
            <td className="portfolio-group-row__count">{portfolio.ideasCount}</td>
            <td className="portfolio-group-row__created">—</td>
            <td className="portfolio-group-row__pnl">—</td>
            <td className="portfolio-group-row__status">
                <svg className="idea-row__building-bot" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" title="Building…" aria-hidden="true">
                    {/* hammer — building in progress */}
                    <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/>
                    <path d="m18 15 4-4"/>
                    <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586z"/>
                </svg>
            </td>
        </tr>
    )
}
BuildingPortfolioRow.propTypes = { portfolio: PropTypes.object.isRequired }

function BrokerGroupRow({ group, expanded, onToggle, onDelete, onStatusChange, onOpen, onSymbolClick }) {
    const lead      = group.ideas[0]
    const asset     = lead?.asset
    const brokerSym = brokerSymbolLabel(lead)
    const summary   = conditionSummary(lead)
    const allWaiting = group.ideas.every(i => i.status === 'waiting')
    // Any leg live on the broker → block the group delete (would orphan a position).
    // The user can still delete individual non-live legs from the expanded rows.
    const anyLocked = group.ideas.some(isDeleteLocked)

    function handleActivateAll(e) {
        e.stopPropagation()
        group.ideas.forEach(idea => { if (idea.status === 'waiting') onStatusChange(idea.id, activationStatus(idea)) })
    }
    function handleDeleteAll(e) {
        e.stopPropagation()
        if (anyLocked) return
        group.ideas.forEach(idea => onDelete(idea.id))
    }

    return (
        <>
            <tr className="idea-row idea-row--group" onClick={onToggle}>
                <td className="idea-row__asset idea-row__asset--group">
                    <span className="idea-row__caret">{expanded ? '▾' : '▸'}</span>
                    <span
                        onClick={e => { e.stopPropagation(); if (asset && onSymbolClick) onSymbolClick(asset) }}
                        style={{ cursor: asset ? 'pointer' : 'default' }}
                        title={asset ? `View ${asset} chart` : undefined}
                    >{asset || '—'}</span>
                    {brokerSym && <span className="idea-row__broker-badge">{brokerSym}</span>}
                    <span className="idea-row__broker-count" title={`${group.ideas.length} brokers`}>⑂{group.ideas.length}</span>
                </td>
                <td className={`idea-row__direction direction--${lead?.direction}`}>{lead?.direction ?? '—'}</td>
                <td className="idea-row__type">{lead?.type ?? '—'}</td>
                <td className="idea-row__created">{formatCreatedAt(group.savedAt) || '—'}</td>
                <td className="idea-row__notes">{summary || '—'}</td>
                <td className="idea-row__controls">
                    <button
                        className="idea-row__delete"
                        onClick={handleDeleteAll}
                        disabled={anyLocked}
                        title={anyLocked ? 'A broker leg is live — close the position first to delete' : 'Delete all broker legs of this idea'}
                    >×</button>
                    {allWaiting ? (
                        <button className="idea-row__status-toggle status--waiting" onClick={handleActivateAll} title="Activate all broker legs"><StatusIcon status="waiting" /></button>
                    ) : (
                        <span className="idea-row__status-badge idea-row__status-badge--group" title="Expand to manage each broker">active</span>
                    )}
                </td>
            </tr>
            {expanded && group.ideas.map(idea => (
                <TradeIdeaRow
                    key={idea.id}
                    idea={idea}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                    onOpen={onOpen}
                    onSymbolClick={onSymbolClick}
                    isBrokerChild
                />
            ))}
        </>
    )
}

BrokerGroupRow.propTypes = {
    group:          PropTypes.object.isRequired,
    expanded:       PropTypes.bool,
    onToggle:       PropTypes.func.isRequired,
    onDelete:       PropTypes.func.isRequired,
    onStatusChange: PropTypes.func.isRequired,
    onOpen:         PropTypes.func.isRequired,
    onSymbolClick:  PropTypes.func,
}

function PortfolioGroupRow({ group, expanded, onToggle, onEdit, onDelete, onDeletePortfolio, onStatusChange, onOpen, onSymbolClick, positions = [], isReviewDue = false }) {
    const [showActivatePrompt, setShowActivatePrompt] = useState(false)
    const allWaiting = group.ideas.length > 0 && group.ideas.every(i => i.status === 'waiting')
    // Manual (broker-less) portfolio → activate/exit post FillCards instead of placing orders.
    const isManual = group.ideas.length > 0 && group.ideas.every(isManualIdea)
    const anyOpen  = group.ideas.some(i => i.status === 'long' || i.status === 'short')
    // Live total P&L = sum of the portfolio's open positions (null while nothing is live).
    const pnl      = portfolioPnl(group.ideas, positions)
    const pnlClass = pnl ? (pnl.pnl > 0 ? ' pnl--pos' : pnl.pnl < 0 ? ' pnl--neg' : '') : ''
    // Any idea live on the broker → block the whole-portfolio delete (it deletes every
    // leg + the chat, which would orphan the live position). Close it first.
    const anyLocked = group.ideas.some(isDeleteLocked)

    function handleDeleteAll(e) {
        e.stopPropagation()
        if (anyLocked) return
        // Deletes every idea in the portfolio and its chat history
        onDeletePortfolio(group.portfolioId)
    }

    function handleActivateAll(e) {
        e.stopPropagation()
        // Pre-activation gate: portfolio ideas are naked / immediate entries, so
        // activating fires them all at market at once — the last gate before real
        // exposure. Offer a final Atlas review first (see ActivatePortfolioDialog).
        setShowActivatePrompt(true)
    }

    function activateNow() {
        setShowActivatePrompt(false)
        // Manual: don't flip statuses — post the N-leg entry FillCard; the user reports
        // each real fill there (the backend marks the legs awaiting_manual_fill).
        if (isManual) { eventBus.emit(MANUAL_PORTFOLIO_ACTIVATE, { portfolioId: group.portfolioId }); return }
        // Activate every waiting idea: 'hit' if it has no entry conditions
        // (fire now, pending confirmation), otherwise 'looking' (monitor watches).
        group.ideas.forEach(idea => {
            if (idea.status === 'waiting') onStatusChange(idea.id, activationStatus(idea))
        })
    }

    function reviewBeforeActivate() {
        // Open the portfolio in the Atlas chat in review mode (pre-activation
        // review). handleEditPortfolio resets ideas to 'waiting', so the book stays
        // pending until the user finishes the review and re-activates.
        setShowActivatePrompt(false)
        onEdit(group.portfolioId, { reviewMode: true })
    }

    function handleDeactivateAll(e) {
        e.stopPropagation()
        // Manual: an active book is real tracked state — never silently reset to waiting.
        // Positions live → post the exit FillCard; still awaiting fills → re-post the
        // entry card (e.g. the user dismissed it and wants it back).
        if (isManual) {
            eventBus.emit(anyOpen ? MANUAL_PORTFOLIO_EXIT : MANUAL_PORTFOLIO_ACTIVATE, { portfolioId: group.portfolioId })
            return
        }
        // Deactivate: send every active idea back to 'waiting'.
        group.ideas.forEach(idea => {
            if (idea.status !== 'waiting') onStatusChange(idea.id, 'waiting')
        })
    }

    return (
        <>
            <tr className="portfolio-group-row" onClick={onToggle}>
                <td className="portfolio-group-row__name">
                    <span className="portfolio-group-row__caret">{expanded ? '▾' : '▸'}</span>
                    {group.name}
                </td>
                <td className="portfolio-group-row__count">{group.ideas.length}</td>
                <td className="portfolio-group-row__created">{formatCreatedAt(group.savedAt) || '—'}</td>
                <td className={`portfolio-group-row__pnl${pnlClass}`} title="Live unrealized P&L across this portfolio's open positions">
                    {pnl ? formatPnl(pnl.pnl, pnl.currency) : '—'}
                </td>
                <td className="portfolio-group-row__status">
                    {allWaiting ? (
                        <button
                            className="idea-row__status-toggle status--waiting"
                            onClick={handleActivateAll}
                            title="Activate all ideas in this portfolio"
                        ><StatusIcon status="waiting" /></button>
                    ) : (
                        <button
                            className="idea-row__status-toggle portfolio-group-row__status-active"
                            onClick={handleDeactivateAll}
                            title={isManual ? (anyOpen ? 'Record your exit — enter your exit prices in social chat' : 'Re-post the entry card in social chat') : 'Set all ideas in this portfolio back to waiting'}
                        >{isManual ? (anyOpen ? 'exit' : 'fill') : 'active'}</button>
                    )}
                    <span className="idea-row__actions">
                        <button
                            className={`idea-row__edit-btn${isReviewDue ? ' idea-row__edit-btn--due' : ''}`}
                            onClick={e => { e.stopPropagation(); onEdit(group.portfolioId, isReviewDue ? { reviewMode: true } : undefined) }}
                            title={isReviewDue ? 'Review due — open review in chat' : 'Edit portfolio in chat'}
                        >
                            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M11.5 1.5L14.5 4.5L5.5 13.5H2.5V10.5L11.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                                <path d="M9.5 3.5L12.5 6.5" stroke="currentColor" strokeWidth="1.4"/>
                            </svg>
                        </button>
                        <button
                            className="idea-row__delete idea-row__delete--bin"
                            onClick={handleDeleteAll}
                            disabled={anyLocked}
                            title={anyLocked ? 'A position is live — close it first to delete this portfolio' : 'Delete all ideas in this portfolio'}
                        >
                            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M2.5 4H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                <path d="M6.5 4V2.8C6.5 2.36 6.86 2 7.3 2H8.7C9.14 2 9.5 2.36 9.5 2.8V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                <path d="M3.7 4L4.3 13C4.34 13.56 4.8 14 5.36 14H10.64C11.2 14 11.66 13.56 11.7 13L12.3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M6.5 6.5V11.5M9.5 6.5V11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                        </button>
                    </span>
                </td>
            </tr>
            {expanded && (
                <tr className="portfolio-group-row__expanded">
                    <td colSpan={5}>
                        <table className="ideas-table">
                            <thead>
                                <tr>
                                    <th className="col-asset">Asset</th>
                                    <th className="col-dir">Dir</th>
                                    <th className="col-type">Type</th>
                                    <th className="col-created">Created</th>
                                    <th className="col-notes">Trade Summary</th>
                                    <th className="col-pnl">P&amp;L</th>
                                    <th className="col-status">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {group.ideas.map(idea => (
                                    <TradeIdeaRow
                                        key={idea.id}
                                        idea={idea}
                                        onDelete={onDelete}
                                        onStatusChange={onStatusChange}
                                        onOpen={onOpen}
                                        onSymbolClick={onSymbolClick}
                                        isPortfolioChild
                                        showPnl
                                        pnl={ideaPnl(idea, positions)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </td>
                </tr>
            )}
            {showActivatePrompt && (
                <ActivatePortfolioDialog
                    name={group.name}
                    count={group.ideas.length}
                    manual={isManual}
                    onReview={reviewBeforeActivate}
                    onActivate={activateNow}
                    onClose={() => setShowActivatePrompt(false)}
                />
            )}
        </>
    )
}

export function TradeIdeasList({ ideas, chatTab, buildingIdea, buildingPortfolio, buildingCall, loading = false, onDelete, onCancelBuild, onStatusChange, onSymbolClick, onEdit, onEditPortfolio, onDeletePortfolio, positions = [], positionsLoading = false, onRefreshPositions, onClosePosition, calls = [], onActCall, onDeleteCall, onEditCall, callBusyId = null }) {
    const [expandedGroups, setExpandedGroups] = useState(new Set())
    const [activeFilter,   setActiveFilter]   = useState('ideas')
    const [closingId,      setClosingId]      = useState(null)
    const [pendingClose,   setPendingClose]   = useState(null)
    const [editOrdersPos,  setEditOrdersPos]  = useState(null)
    // Portfolios with a review due now → their edit pencil turns red and routes into
    // review mode. Refetched whenever the ideas list changes (covers activate/rebalance
    // reloads); a resolved review clears on the next reload / portfolio-tab remount.
    const [dueReviewIds, setDueReviewIds] = useState(() => new Set())
    useEffect(() => {
        let alive = true
        const refresh = () => portfolioService.getPendingReviews()
            .then(reviews => { if (alive) setDueReviewIds(new Set((reviews ?? []).map(r => r.portfolioId))) })
            .catch(() => {})
        refresh()
        // A resolved review (dismiss / accept) clears its pencil immediately.
        const off = eventBus.on(REVIEW_RESOLVED, refresh)
        return () => { alive = false; off() }
    }, [ideas])

    // Design trial: the 'cards' design renders the Ideas tab as stacked cards
    // instead of the table (Portfolios / Positions tabs are unchanged).
    const cardMode = useDesign() === 'cards'

    // Follow the chat tab: idea mode shows ideas, portfolio mode shows portfolios.
    // The user can still override via the filter buttons until the tab changes again.
    useEffect(() => {
        if (chatTab === 'portfolio')  setActiveFilter('portfolios')
        else if (chatTab === 'idea')  setActiveFilter('ideas')
        else if (chatTab === 'kairos') setActiveFilter('calls')
    }, [chatTab])

    // When a portfolio starts taking shape in chat, move the list to the
    // portfolios slot so the building row is visible (mirrors single-idea build).
    const isBuildingPortfolio = !!buildingPortfolio
    useEffect(() => {
        if (isBuildingPortfolio) setActiveFilter('portfolios')
    }, [isBuildingPortfolio])

    // A Kairos call taking shape in chat → surface the building row in the Calls slot.
    const isBuildingCall = !!buildingCall
    useEffect(() => {
        if (isBuildingCall) setActiveFilter('calls')
    }, [isBuildingCall])

    // Clicking an idea row opens it straight in its own pop-out window.
    function handleOpen(idea) { openIdeaPopup(idea) }

    // Clicking a position row opens the idea that owns it. A position links to an idea
    // via a brokerOrders entry carrying its positionId — matched on broker + account +
    // positionId (a positionId is only unique within its account). Idea-less positions
    // (e.g. paper trades with no surviving idea) are a no-op.
    function handleOpenPosition(position) {
        const idea = ideas.find(i => (i.brokerOrders ?? []).some(bo =>
            String(bo.positionId ?? '') === String(position.id ?? '') &&
            bo.broker === position.broker &&
            String(bo.accountId ?? '') === String(position.accountId ?? '')
        ))
        if (idea) openIdeaPopup(idea)
    }

    function selectPositions() {
        setActiveFilter('positions')
        if (onRefreshPositions) onRefreshPositions()
    }

    async function confirmClosePosition() {
        const position = pendingClose
        if (!position || !onClosePosition) return
        setClosingId(posKey(position))
        try {
            await onClosePosition(position.broker, position.id, position.accountId)
            setPendingClose(null)
        } catch (err) {
            console.error('[positions] close failed', err)
        } finally {
            setClosingId(null)
        }
    }

    function toggleGroup(portfolioId) {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(portfolioId)) next.delete(portfolioId)
            else next.add(portfolioId)
            return next
        })
    }

    // Editing substitution: when the building draft carries a real (saved) id, swap it into the
    // list IN PLACE — the existing row turns to 'building' — rather than adding a separate top row.
    // Group keys (portfolioId/groupId/savedAt) are carried over so it stays in its group + position.
    const editBuildIdeaId = buildingIdea && buildingIdea.id !== '__building__' ? buildingIdea.id : null
    const ideaInList = editBuildIdeaId != null && ideas.some(i => i.id === editBuildIdeaId)
    const effectiveIdeas = ideaInList
        ? ideas.map(i => i.id === editBuildIdeaId
            ? { ...buildingIdea, portfolioId: i.portfolioId, groupId: i.groupId, portfolioName: i.portfolioName, savedAt: i.savedAt }
            : i)
        : ideas
    // A brand-new build (or an edit whose row isn't in the current view) gets a prepended top row;
    // an edit whose row IS in the list is substituted in place above, so no top row.
    const topBuildingIdea = buildingIdea && !ideaInList ? buildingIdea : null

    const { standalone, groups, brokerGroups } = _separateIdeas(effectiveIdeas)

    // Same in-place substitution for a call being edited (Kairos Calls tab).
    const editBuildCallId = buildingCall && buildingCall.id !== '__building_call__' ? buildingCall.id : null
    const callInList      = editBuildCallId != null && calls.some(c => c.id === editBuildCallId)
    const effectiveCalls  = callInList ? calls.map(c => c.id === editBuildCallId ? buildingCall : c) : calls
    const topBuildingCall = buildingCall && !callInList ? buildingCall : null

    // Interleave standalone ideas and multi-broker groups by recency so a forked
    // idea sorts where its creation time puts it (one row, expandable).
    const ideaRows = [
        ...standalone.map(i => ({ kind: 'idea', savedAt: i.savedAt || 0, item: i })),
        ...brokerGroups.map(g => ({ kind: 'group', savedAt: g.savedAt || 0, item: g })),
    ].sort((a, b) => b.savedAt - a.savedAt)

    // A portfolio being edited turns its existing group row to 'building' IN PLACE (same as ideas /
    // calls) — keep the group, substitute the building row for it in the map below. A brand-new
    // portfolio (no id yet) prepends a building row at the top instead.
    const editPortfolioId = buildingPortfolio?.portfolioId ?? null
    const visibleGroups = groups
    const pfInList = editPortfolioId != null && groups.some(g => g.portfolioId === editPortfolioId)
    const topBuildingPortfolio = buildingPortfolio && !pfInList ? buildingPortfolio : null

    const showIdeas      = activeFilter === 'ideas'
    const showCalls      = activeFilter === 'calls'
    const showPositions  = activeFilter === 'positions'
    const hasIdeasRows   = topBuildingIdea || ideaRows.length > 0
    const hasPortfolios  = visibleGroups.length > 0

    return (
        <section className="trade-ideas-list full">
            <div className="trade-ideas-list__header">
                <svg className="trade-ideas-list__header-icon" viewBox="0 0 10 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 0L0 10h4.5L3 18l7-10H5.5L6 0z"/>
                </svg>
                <span className="trade-ideas-list__header-title"><BrandTitle text="Axl Lists" /></span>
                <div className="trade-ideas-list__filters">
                    <button
                        className={`trade-ideas-list__filter${activeFilter === 'ideas' ? ' active' : ''}`}
                        onClick={() => setActiveFilter('ideas')}
                    >Ideas{ideaRows.length > 0 ? ` (${ideaRows.length})` : ''}</button>
                    <button
                        className={`trade-ideas-list__filter${activeFilter === 'calls' ? ' active' : ''}`}
                        onClick={() => setActiveFilter('calls')}
                    >Calls{calls.length > 0 ? ` (${calls.length})` : ''}</button>
                    <button
                        className={`trade-ideas-list__filter trade-ideas-list__filter--portfolio${activeFilter === 'portfolios' ? ' active' : ''}`}
                        onClick={() => setActiveFilter('portfolios')}
                    >Portfolios{visibleGroups.length > 0 ? ` (${visibleGroups.length})` : ''}</button>
                    <button
                        className={`trade-ideas-list__filter trade-ideas-list__filter--positions${activeFilter === 'positions' ? ' active' : ''}`}
                        onClick={selectPositions}
                    >Positions{positions.length > 0 ? ` (${positions.length})` : ''}</button>
                </div>
            </div>

            <div className="trade-ideas-list__scroll">
                {/* Workspace switch (live/paper/manual) is re-fetching the ideas — the
                    Positions tab has its own loading state, so skip the overlay there. */}
                {loading && !showPositions && (
                    <div className="trade-ideas-list__switching" role="status" aria-live="polite">
                        <span className="trade-ideas-list__switching-spinner" aria-hidden="true" />
                        <span>Updating…</span>
                    </div>
                )}
                {showIdeas ? (
                    !hasIdeasRows ? (
                        <p className="trade-ideas-list__empty">No ideas yet</p>
                    ) : cardMode ? (
                        <div className="ideas-cards">
                            {topBuildingIdea && (
                                <IdeaCard
                                    key="__building__"
                                    idea={topBuildingIdea}
                                    onDelete={onCancelBuild}
                                    onStatusChange={() => {}}
                                    onOpen={() => {}}
                                />
                            )}
                            {ideaRows.map(row => row.kind === 'group' ? (
                                <BrokerGroupCard
                                    key={row.item.groupId}
                                    group={row.item}
                                    expanded={expandedGroups.has(row.item.groupId)}
                                    onToggle={() => toggleGroup(row.item.groupId)}
                                    onDelete={onDelete}
                                    onStatusChange={onStatusChange}
                                    onOpen={handleOpen}
                                    onSymbolClick={onSymbolClick}
                                />
                            ) : (
                                <IdeaCard
                                    key={row.item.id}
                                    idea={row.item}
                                    onDelete={onDelete}
                                    onStatusChange={onStatusChange}
                                    onOpen={handleOpen}
                                    onSymbolClick={onSymbolClick}
                                    onEdit={onEdit}
                                />
                            ))}
                        </div>
                    ) : (
                        <table className="ideas-table">
                            <thead>
                                <tr>
                                    <th className="col-asset">Asset</th>
                                    <th className="col-dir">Dir</th>
                                    <th className="col-type">Type</th>
                                    <th className="col-created">Created</th>
                                    <th className="col-notes">Trade Summary</th>
                                    <th className="col-status">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topBuildingIdea && (
                                    <TradeIdeaRow
                                        key="__building__"
                                        idea={topBuildingIdea}
                                        onDelete={onCancelBuild}
                                        onStatusChange={() => {}}
                                        onOpen={() => {}}
                                    />
                                )}
                                {ideaRows.map(row => row.kind === 'group' ? (
                                    <BrokerGroupRow
                                        key={row.item.groupId}
                                        group={row.item}
                                        expanded={expandedGroups.has(row.item.groupId)}
                                        onToggle={() => toggleGroup(row.item.groupId)}
                                        onDelete={onDelete}
                                        onStatusChange={onStatusChange}
                                        onOpen={handleOpen}
                                        onSymbolClick={onSymbolClick}
                                    />
                                ) : (
                                    <TradeIdeaRow
                                        key={row.item.id}
                                        idea={row.item}
                                        onDelete={onDelete}
                                        onStatusChange={onStatusChange}
                                        onOpen={handleOpen}
                                        onSymbolClick={onSymbolClick}
                                        onEdit={onEdit}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )
                ) : showCalls ? (
                    (!topBuildingCall && effectiveCalls.length === 0) ? (
                        <p className="trade-ideas-list__empty">No calls yet</p>
                    ) : (
                        <div className="ideas-cards">
                            {topBuildingCall && (
                                <CallCard
                                    key="__building_call__"
                                    call={topBuildingCall}
                                    onAct={() => {}}
                                    onSymbolClick={onSymbolClick}
                                />
                            )}
                            {effectiveCalls.map(c => (
                                <CallCard
                                    key={c.id}
                                    call={c}
                                    busy={callBusyId === c.id}
                                    onAct={onActCall}
                                    onDelete={onDeleteCall}
                                    onEdit={onEditCall}
                                    onSymbolClick={onSymbolClick}
                                />
                            ))}
                        </div>
                    )
                ) : showPositions ? (
                    positions.length === 0 ? (
                        <p className="trade-ideas-list__empty">{positionsLoading ? 'Loading positions…' : 'No open positions'}</p>
                    ) : cardMode ? (
                        <PositionsCards
                            positions={positions}
                            closingId={closingId}
                            onClose={setPendingClose}
                            onEditOrders={setEditOrdersPos}
                            onOpen={handleOpenPosition}
                        />
                    ) : (
                        <PositionsTable
                            positions={positions}
                            closingId={closingId}
                            onClose={setPendingClose}
                            onEditOrders={setEditOrdersPos}
                            onOpen={handleOpenPosition}
                        />
                    )
                ) : (
                    (!hasPortfolios && !buildingPortfolio) ? (
                        <p className="trade-ideas-list__empty">No portfolios yet</p>
                    ) : cardMode ? (
                        <div className="ideas-cards">
                            {topBuildingPortfolio && <BuildingPortfolioCard portfolio={topBuildingPortfolio} />}
                            {visibleGroups.map(group => (
                                group.portfolioId === editPortfolioId ? (
                                    <BuildingPortfolioCard key={group.portfolioId} portfolio={buildingPortfolio} />
                                ) : (
                                    <PortfolioCard
                                        key={group.portfolioId}
                                        group={group}
                                        expanded={expandedGroups.has(group.portfolioId)}
                                        onToggle={() => toggleGroup(group.portfolioId)}
                                        onEdit={onEditPortfolio}
                                        isReviewDue={dueReviewIds.has(group.portfolioId)}
                                        onDelete={onDelete}
                                        onDeletePortfolio={onDeletePortfolio}
                                        onStatusChange={onStatusChange}
                                        onOpen={handleOpen}
                                        onSymbolClick={onSymbolClick}
                                        positions={positions}
                                    />
                                )
                            ))}
                        </div>
                    ) : (
                        <table className="portfolios-table">
                            <thead>
                                <tr>
                                    <th className="col-pf-name">Portfolio</th>
                                    <th className="col-pf-count">Assets</th>
                                    <th className="col-pf-created">Created</th>
                                    <th className="col-pf-pnl">P&amp;L</th>
                                    <th className="col-pf-status">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topBuildingPortfolio && <BuildingPortfolioRow portfolio={topBuildingPortfolio} />}
                                {visibleGroups.map(group => (
                                    group.portfolioId === editPortfolioId ? (
                                        <BuildingPortfolioRow key={group.portfolioId} portfolio={buildingPortfolio} />
                                    ) : (
                                        <PortfolioGroupRow
                                            key={group.portfolioId}
                                            group={group}
                                            expanded={expandedGroups.has(group.portfolioId)}
                                            onToggle={() => toggleGroup(group.portfolioId)}
                                            onEdit={onEditPortfolio}
                                            isReviewDue={dueReviewIds.has(group.portfolioId)}
                                            onDelete={onDelete}
                                            onDeletePortfolio={onDeletePortfolio}
                                            onStatusChange={onStatusChange}
                                            onOpen={handleOpen}
                                            onSymbolClick={onSymbolClick}
                                            positions={positions}
                                        />
                                    )
                                ))}
                            </tbody>
                        </table>
                    )
                )}
            </div>

            <ClosePositionDialog
                position={pendingClose}
                closing={!!pendingClose && closingId === posKey(pendingClose)}
                onConfirm={confirmClosePosition}
                onCancel={() => setPendingClose(null)}
            />

            {editOrdersPos && (
                <EditOrdersDialog
                    position={editOrdersPos}
                    onClose={() => setEditOrdersPos(null)}
                    onChanged={onRefreshPositions}
                />
            )}
        </section>
    )
}

TradeIdeasList.propTypes = {
    ideas:            PropTypes.array.isRequired,
    chatTab:          PropTypes.string,
    buildingIdea:     PropTypes.object,
    buildingPortfolio: PropTypes.object,
    buildingCall:     PropTypes.object,
    onDelete:         PropTypes.func.isRequired,
    onCancelBuild:    PropTypes.func.isRequired,
    onStatusChange:   PropTypes.func.isRequired,
    onEdit:           PropTypes.func,
    onEditPortfolio:  PropTypes.func,
    onDeletePortfolio: PropTypes.func,
    positions:        PropTypes.array,
    positionsLoading: PropTypes.bool,
    onRefreshPositions: PropTypes.func,
    onClosePosition:  PropTypes.func,
    calls:            PropTypes.array,
    onActCall:        PropTypes.func,
    onDeleteCall:     PropTypes.func,
    onEditCall:       PropTypes.func,
    callBusyId:       PropTypes.string,
}
