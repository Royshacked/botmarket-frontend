import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { TradeIdeaRow } from './TradeIdeaRow.jsx'
import { EditOrdersDialog } from './EditOrdersDialog.jsx'
import { ActivatePortfolioDialog } from './ActivatePortfolioDialog.jsx'
import { PositionsTable } from './PositionsTable.jsx'
import { usePositionClose } from './usePositionClose.jsx'
import { formatCreatedAt, activationStatus, activatePortfolio, conditionSummary, brokerSymbolLabel, isDeleteLocked, isManualIdea, openIdeaPopup, openCallPopup, openSetupPopup, formatPnl, ideaPnl, portfolioPnl, positionOpenTarget, isPortfolioReview } from './tradeIdea.utils.js'
import { eventBus, MANUAL_PORTFOLIO_ACTIVATE, MANUAL_PORTFOLIO_EXIT, REVIEW_RESOLVED } from '../../services/event-bus.service'
import { portfolioService } from '../../services/portfolio/portfolio.service.remote.js'
import { StatusIcon } from '../StatusIcon.jsx'
import { MinosBadge, HermesBadge, TalosBadge, AtlasBadge, ArgusBadge, AgentGlyph } from '../AxlHub/AgentBadges.jsx'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { SetupCard } from './SetupCard.jsx'
import { EditButton, DeleteButton } from '../EntityCard/EntityCard.jsx'
import { CallCard } from './CallCard.jsx'
import { isArmed } from '../../services/entityStatus.js'
import { Radar } from '../Radar/Radar.jsx'
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
                    <DeleteButton
                        onClick={handleDeleteAll}
                        title="Delete all broker legs of this idea"
                        lockedReason={anyLocked ? 'A broker leg is live — close the position first to delete' : null}
                    />
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
    // One fact, read twice: it makes the manual toggle an EXIT rather than a re-post, and it makes
    // reopening this book a review rather than a re-plan. Shared so the two can't drift apart.
    const anyOpen  = isPortfolioReview(group.ideas)
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
        // What activation MEANS for a book (broker legs vs the manual fill card) lives in
        // activatePortfolio — three surfaces offer this now.
        activatePortfolio(group.ideas, {
            isManual,
            onStatusChange,
            onManualEntry: () => eventBus.emit(MANUAL_PORTFOLIO_ACTIVATE, { portfolioId: group.portfolioId }),
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
                        {/* `due` stays tied to the SCHEDULE — a live book is not perpetually overdue.
                            The title tells the truth about what will open: handleEditPortfolio turns
                            this into a review by itself once a position is live. */}
                        <EditButton
                            onClick={() => onEdit(group.portfolioId, isReviewDue ? { reviewMode: true } : undefined)}
                            due={isReviewDue}
                            title={isReviewDue ? 'Review due — open review in chat'
                                : anyOpen ? 'In position — opens a review in chat'
                                    : 'Edit portfolio in chat'}
                        />
                        <DeleteButton
                            onClick={handleDeleteAll}
                            title="Delete all ideas in this portfolio"
                            lockedReason={anyLocked ? 'A position is live — close it first to delete this portfolio' : null}
                        />
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

/**
 * One tile on the Lists hub. Every section renders through this — a new entity kind adds a SECTION
 * entry (below) and gets its tile, breadcrumb label and count for free.
 */
function HubTile({ label, icon, count, onClick }) {
    return (
        <button className="trade-ideas-list__hub-card" onClick={onClick}>
            <span className="trade-ideas-list__hub-card-icon">{icon}</span>
            <span className="trade-ideas-list__hub-card-body">
                <span className="trade-ideas-list__hub-card-label">{label}</span>
                {count && <span className="trade-ideas-list__hub-card-count">{count}</span>}
            </span>
        </button>
    )
}
HubTile.propTypes = { label: PropTypes.string, icon: PropTypes.node, count: PropTypes.node, onClick: PropTypes.func }

/**
 * The default body for an entity section: a flat list of cards with loading and empty states.
 *
 * Ideas and portfolios opt out (`body` on their SECTION) because they are genuinely different —
 * a sortable table, broker-fork groups, portfolio roll-ups. Everything else is this, so a new kind
 * supplies `items` and a `renderCard` and writes no layout at all.
 */
function CardList({ items, loading, empty, renderCard, lead = null }) {
    if (loading) return <p className="trade-ideas-list__empty">Loading…</p>
    if (!lead && items.length === 0) return <p className="trade-ideas-list__empty">{empty}</p>
    return <div className="ideas-cards">{lead}{items.map(renderCard)}</div>
}
CardList.propTypes = {
    items: PropTypes.array, loading: PropTypes.bool, empty: PropTypes.string,
    renderCard: PropTypes.func, lead: PropTypes.node,
}

export function TradeIdeasList({ ideas, chatTab, buildingIdea, buildingPortfolio, buildingCall, loading = false, onDelete, onCancelBuild, onStatusChange, onSymbolClick, onEdit, onEditPortfolio, onDeletePortfolio, positions = [], positionsLoading = false, onRefreshPositions, onClosePosition, onClosePositions, calls = [], onActCall, onDeleteCall, onEditCall, callBusyId = null, setups = [], setupsLoading = false, onArmSetup, onDisarmSetup, onDeleteSetup, onEditSetup, setupBusyId = null, radar }) {
    const [expandedGroups, setExpandedGroups] = useState(new Set())
    const [activeFilter,   setActiveFilter]   = useState(null)    // null = hub landing
    // The close-at-market flow (confirm → fire → report) is shared with the Floor's book, so it
    // lives in usePositionClose rather than here — see that hook for why.
    const { requestClose, requestCloseGroup, closingId, closingGroupId, closeDialog } =
        usePositionClose({ onClosePosition, onClosePositions })
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

    // Follow the chat tab: idea mode shows ideas, portfolio mode shows portfolios.
    // The user can still override via the filter buttons until the tab changes again.
    useEffect(() => {
        if (chatTab === 'portfolio')   setActiveFilter('portfolios')
        else if (chatTab === 'idea')   setActiveFilter('ideas')
        else if (chatTab === 'kairos') setActiveFilter('calls')
        else if (chatTab === 'mentor') setActiveFilter('setups')
        else if (chatTab === 'axl')    setActiveFilter(null)   // return to hub when back at AxlHub
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

    // Clicking a position row opens the entity that owns it. A call-originated position carries
    // its owning callId (stamped server-side — its execution idea is hidden from the ideas list),
    // so route those to the Call pop-out. Otherwise it links to a visible idea via a brokerOrders
    // entry (matched on broker + account + positionId). Truly owner-less positions (e.g. a paper
    // trade whose idea was deleted) are a no-op.
    function handleOpenPosition(position) {
        const target = positionOpenTarget(position, ideas, calls)
        if (target?.kind === 'call')      openCallPopup(target.call)
        else if (target?.kind === 'idea') openIdeaPopup(target.idea)
    }

    function selectPositions() {
        setActiveFilter('positions')
        if (onRefreshPositions) onRefreshPositions()
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

    const atHub          = activeFilter === null
    const showIdeas      = activeFilter === 'ideas'
    const showPositions  = activeFilter === 'positions'
    const showRadar      = activeFilter === 'radar'
    const hasIdeasRows   = topBuildingIdea || ideaRows.length > 0
    const hasPortfolios  = visibleGroups.length > 0

    // ── The section registry ──────────────────────────────────────────────────
    //
    // ONE entry per entity kind drives its hub tile, breadcrumb label, count and body. Adding a new
    // agent's entity is an entry here — not a `showX` flag, a SECTION_LABELS key, a branch of the
    // count ternary, a render branch and six more props, which is what it used to cost.
    //
    // `body` opts out of the default CardList for the kinds that genuinely differ (a sortable
    // table, broker-fork groups). Everything else supplies `items` + `renderCard` and no layout.
    const SECTIONS = [
        {
            key: 'ideas', label: 'Ideas', icon: <MinosBadge size={30} />,
            count: ideaRows.length, hubCount: ideaRows.length ? `${ideaRows.length} active` : null,
            body: 'custom',
        },
        {
            key: 'calls', label: 'Calls', icon: <HermesBadge size={30} />,
            count: effectiveCalls.length, hubCount: effectiveCalls.length ? `${effectiveCalls.length} active` : null,
            items: effectiveCalls, empty: 'No calls yet',
            lead: topBuildingCall
                ? <CallCard key="__building_call__" call={topBuildingCall} onAct={() => {}} onSymbolClick={onSymbolClick} />
                : null,
            renderCard: (c) => (
                <CallCard
                    key={c.id} call={c} busy={callBusyId === c.id}
                    onAct={onActCall} onDelete={onDeleteCall} onEdit={onEditCall} onSymbolClick={onSymbolClick}
                />
            ),
        },
        {
            key: 'setups', label: 'Setups', icon: <TalosBadge size={30} />, hubOnlyWithRadar: true,
            count: setups.length,
            hubCount: setups.length
                ? `${setups.filter(x => isArmed(x.status)).length} watched · ${setups.length} total`
                : null,
            items: setups, loading: setupsLoading, empty: 'No setups yet — build one with Mentor.',
            // The pencil reopens the BUILD conversation (onEditSetup). It used to be wired to
            // onOpenSetup, which only switched to the Mentor tab and landed on an empty chat.
            renderCard: (su) => (
                <SetupCard
                    key={su.id} setup={su} busy={setupBusyId === su.id}
                    onArm={onArmSetup} onDisarm={onDisarmSetup} onDelete={onDeleteSetup}
                    onOpen={openSetupPopup} onEdit={onEditSetup} onSymbolClick={onSymbolClick}
                />
            ),
        },
        {
            key: 'portfolios', label: 'Portfolios', icon: <AtlasBadge size={30} />,
            count: visibleGroups.length, hubCount: visibleGroups.length ? `${visibleGroups.length} books` : null,
            body: 'custom',
        },
        {
            key: 'positions', label: 'Positions', onSelect: selectPositions,
            icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5.5l6-3 6 3-6 3z"/><path d="M2 8.5l6 3 6-3"/><path d="M2 11.5l6 3 6-3"/></svg>,
            count: positions.length, hubCount: positions.length ? `${positions.length} open` : null,
            body: 'custom',
        },
    ]
    const section = SECTIONS.find(x => x.key === activeFilter) ?? null

    const SECTION_LABELS = Object.fromEntries(SECTIONS.map(x => [x.key, x.label]).concat([['radar', 'Radar']]))
    // radar sub-tab label shown in the breadcrumb when a deep-link card was used
    const radarTabLabel = { scans: 'Scans', earnings: 'Earnings', coverage: 'Coverage', fed: 'Fed', ipo: 'IPO', forecasts: 'Forecasts' }
    const sectionCount = section?.count ?? 0

    return (
        <section className="trade-ideas-list full">
            <div className="trade-ideas-list__header">
                {atHub ? (
                    <span className="trade-ideas-list__header-title">What do you want to see?</span>
                ) : (
                    <>
                        <button
                            className="trade-ideas-list__back"
                            onClick={() => setActiveFilter(null)}
                            aria-label="Back to Axl Lists"
                        >
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="7,2 3,6 7,10"/>
                                <line x1="3" y1="6" x2="11" y2="6"/>
                            </svg>
                            Lists
                        </button>
                        <span className="trade-ideas-list__crumb" aria-hidden="true">/</span>
                        <span className="trade-ideas-list__section">
                            {activeFilter === 'radar' && radar?.tab
                                ? radarTabLabel[radar.tab] ?? 'Radar'
                                : SECTION_LABELS[activeFilter]}
                            {sectionCount > 0 ? ` (${sectionCount})` : ''}
                        </span>
                    </>
                )}
            </div>

            {atHub ? (
                <div className="trade-ideas-list__hub">
                    <div className="trade-ideas-list__hub-grid">
                        {SECTIONS.filter(x => !x.hubOnlyWithRadar || radar).map(x => (
                            <HubTile
                                key={x.key} label={x.label} icon={x.icon} count={x.hubCount}
                                onClick={x.onSelect ?? (() => setActiveFilter(x.key))}
                            />
                        ))}
                        {radar && (<>
                        <button className="trade-ideas-list__hub-card" onClick={() => { setActiveFilter('radar'); radar.onTabChange?.('fed') }}>
                                <span className="trade-ideas-list__hub-card-icon">
                                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/><path d="M5.2 10.8a4 4 0 0 1 0-5.6M10.8 5.2a4 4 0 0 1 0 5.6"/><path d="M3.1 12.9A7 7 0 0 1 3.1 3.1M12.9 3.1a7 7 0 0 1 0 9.8"/></svg>
                                </span>
                                <span className="trade-ideas-list__hub-card-body">
                                    <span className="trade-ideas-list__hub-card-label">Fed</span>
                                    {(radar.fed?.length ?? 0) > 0 && <span className="trade-ideas-list__hub-card-count">{radar.fed.length} events</span>}
                                </span>
                            </button>
                            <button className="trade-ideas-list__hub-card" onClick={() => { setActiveFilter('radar'); radar.onTabChange?.('scans') }}>
                                <span className="trade-ideas-list__hub-card-icon">
                                    <ArgusBadge size={30} />
                                </span>
                                <span className="trade-ideas-list__hub-card-body">
                                    <span className="trade-ideas-list__hub-card-label">Scans</span>
                                    {(radar.scans?.length ?? 0) > 0 && <span className="trade-ideas-list__hub-card-count">{radar.scans.length} lists</span>}
                                </span>
                            </button>
                            <button className="trade-ideas-list__hub-card" onClick={() => { setActiveFilter('radar'); radar.onTabChange?.('earnings') }}>
                                <span className="trade-ideas-list__hub-card-icon">
                                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1.5"/><line x1="2" y1="7" x2="14" y2="7"/><line x1="5" y1="1.5" x2="5" y2="4.5"/><line x1="11" y1="1.5" x2="11" y2="4.5"/></svg>
                                </span>
                                <span className="trade-ideas-list__hub-card-body">
                                    <span className="trade-ideas-list__hub-card-label">Earnings</span>
                                    {(radar.earnings?.length ?? 0) > 0 && <span className="trade-ideas-list__hub-card-count">{radar.earnings.length} upcoming</span>}
                                </span>
                            </button>
                            <button className="trade-ideas-list__hub-card" onClick={() => { setActiveFilter('radar'); radar.onTabChange?.('coverage') }}>
                                <span className="trade-ideas-list__hub-card-icon">
                                    <AgentGlyph agentKey="analyst" icon={AGENTS.analyst.icon} size={30} />
                                </span>
                                <span className="trade-ideas-list__hub-card-body">
                                    <span className="trade-ideas-list__hub-card-label">Coverage</span>
                                    {(radar.coverage?.length ?? 0) > 0 && <span className="trade-ideas-list__hub-card-count">{radar.coverage.length} tracked</span>}
                                </span>
                            </button>
                            <button className="trade-ideas-list__hub-card" onClick={() => { setActiveFilter('radar'); radar.onTabChange?.('forecasts') }}>
                                <span className="trade-ideas-list__hub-card-icon">
                                    <AgentGlyph agentKey="strategy" icon={AGENTS.strategy.icon} size={30} />
                                </span>
                                <span className="trade-ideas-list__hub-card-body">
                                    <span className="trade-ideas-list__hub-card-label">Forecasts</span>
                                    {/* The count is the number of STANCES in force, not a list length —
                                        there is only ever one house view. */}
                                    {(radar.tilt?.tilts?.length ?? 0) > 0 && <span className="trade-ideas-list__hub-card-count">{radar.tilt.tilts.length} sectors</span>}
                                </span>
                            </button>
                        </>)}
                    </div>
                </div>
            ) : (
                <>
                    {showRadar && radar && (
                        <div className="trade-ideas-list__radar">
                            <Radar {...radar} />
                        </div>
                    )}

                    <div className="trade-ideas-list__scroll" style={showRadar ? { display: 'none' } : undefined}>
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
                ) : section?.renderCard ? (
                    <CardList
                        items={section.items}
                        loading={section.loading}
                        empty={section.empty}
                        lead={section.lead}
                        renderCard={section.renderCard}
                    />
                ) : showPositions ? (
                    positions.length === 0 ? (
                        <p className="trade-ideas-list__empty">{positionsLoading ? 'Loading positions…' : 'No open positions'}</p>
                    ) : (
                        <PositionsTable
                            positions={positions}
                            ideas={ideas}
                            closingId={closingId}
                            closingGroupId={closingGroupId}
                            onClose={requestClose}
                            onCloseGroup={requestCloseGroup}
                            onEditOrders={setEditOrdersPos}
                            onOpen={handleOpenPosition}
                        />
                    )
                ) : (
                    (!hasPortfolios && !buildingPortfolio) ? (
                        <p className="trade-ideas-list__empty">No portfolios yet</p>
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
                </>
            )}

            {closeDialog}

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
    onClosePositions: PropTypes.func,
    calls:            PropTypes.array,
    onActCall:        PropTypes.func,
    onDeleteCall:     PropTypes.func,
    onEditCall:       PropTypes.func,
    callBusyId:       PropTypes.string,
    setups:           PropTypes.array,
    setupsLoading:    PropTypes.bool,
    onArmSetup:       PropTypes.func,
    onDisarmSetup:    PropTypes.func,
    onDeleteSetup:    PropTypes.func,
    onEditSetup:      PropTypes.func,
    setupBusyId:      PropTypes.string,
    radar:            PropTypes.object,
}
