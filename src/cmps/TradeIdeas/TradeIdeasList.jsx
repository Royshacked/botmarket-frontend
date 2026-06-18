import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { TradeIdeaRow } from './TradeIdeaRow.jsx'
import { TradeIdeaDialog } from './TradeIdeaDialog.jsx'
import { ClosePositionDialog } from './ClosePositionDialog.jsx'
import { EditOrdersDialog } from './EditOrdersDialog.jsx'
import { PositionsTable, posKey } from './PositionsTable.jsx'
import { formatCreatedAt, activationStatus, conditionSummary, brokerSymbolLabel } from './tradeIdea.utils.js'
import { StatusIcon } from '../StatusIcon.jsx'
import './TradeIdeas.scss'

// How often to re-fetch open positions while the Positions tab is in view, so
// live P&L keeps ticking. Each poll is one WS reconcile + unrealized-P&L round trip.
const POSITIONS_POLL_MS = 4000

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

function BrokerGroupRow({ group, expanded, onToggle, onDelete, onStatusChange, onOpen, onSymbolClick }) {
    const lead      = group.ideas[0]
    const asset     = lead?.asset
    const brokerSym = brokerSymbolLabel(lead)
    const summary   = conditionSummary(lead)
    const allWaiting = group.ideas.every(i => i.status === 'waiting')

    function handleActivateAll(e) {
        e.stopPropagation()
        group.ideas.forEach(idea => { if (idea.status === 'waiting') onStatusChange(idea.id, activationStatus(idea)) })
    }
    function handleDeleteAll(e) {
        e.stopPropagation()
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
                    <button className="idea-row__delete" onClick={handleDeleteAll} title="Delete all broker legs of this idea">×</button>
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

function PortfolioGroupRow({ group, expanded, onToggle, onEdit, onDelete, onDeletePortfolio, onStatusChange, onOpen, onSymbolClick }) {
    const allWaiting = group.ideas.length > 0 && group.ideas.every(i => i.status === 'waiting')

    function handleDeleteAll(e) {
        e.stopPropagation()
        // Deletes every idea in the portfolio and its chat history
        onDeletePortfolio(group.portfolioId)
    }

    function handleActivateAll(e) {
        e.stopPropagation()
        // Activate every waiting idea: 'hit' if it has no entry conditions
        // (fire now, pending confirmation), otherwise 'looking' (monitor watches).
        group.ideas.forEach(idea => {
            if (idea.status === 'waiting') onStatusChange(idea.id, activationStatus(idea))
        })
    }

    function handleDeactivateAll(e) {
        e.stopPropagation()
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
                            title="Set all ideas in this portfolio back to waiting"
                        >active</button>
                    )}
                    <span className="idea-row__actions">
                        <button
                            className="idea-row__edit-btn"
                            onClick={e => { e.stopPropagation(); onEdit(group.portfolioId) }}
                            title="Edit portfolio in chat"
                        >
                            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M11.5 1.5L14.5 4.5L5.5 13.5H2.5V10.5L11.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                                <path d="M9.5 3.5L12.5 6.5" stroke="currentColor" strokeWidth="1.4"/>
                            </svg>
                        </button>
                        <button
                            className="idea-row__delete idea-row__delete--bin"
                            onClick={handleDeleteAll}
                            title="Delete all ideas in this portfolio"
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
                    <td colSpan={4}>
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
                                {group.ideas.map(idea => (
                                    <TradeIdeaRow
                                        key={idea.id}
                                        idea={idea}
                                        onDelete={onDelete}
                                        onStatusChange={onStatusChange}
                                        onOpen={onOpen}
                                        onSymbolClick={onSymbolClick}
                                        isPortfolioChild
                                    />
                                ))}
                            </tbody>
                        </table>
                    </td>
                </tr>
            )}
        </>
    )
}

export function TradeIdeasList({ ideas, chatTab, buildingIdea, buildingPortfolio, onDelete, onCancelBuild, onStatusChange, onSymbolClick, onEdit, onEditPortfolio, onDeletePortfolio, onPlaceOrder, positions = [], positionsLoading = false, onRefreshPositions, onClosePosition }) {
    const [activeIdea,     setActiveIdea]     = useState(null)
    const [expandedGroups, setExpandedGroups] = useState(new Set())
    const [activeFilter,   setActiveFilter]   = useState('ideas')
    const [closingId,      setClosingId]      = useState(null)
    const [pendingClose,   setPendingClose]   = useState(null)
    const [editOrdersPos,  setEditOrdersPos]  = useState(null)

    // Follow the chat tab: idea mode shows ideas, portfolio mode shows portfolios.
    // The user can still override via the filter buttons until the tab changes again.
    useEffect(() => {
        if (chatTab === 'portfolio')  setActiveFilter('portfolios')
        else if (chatTab === 'idea')  setActiveFilter('ideas')
    }, [chatTab])

    // When a portfolio starts taking shape in chat, move the list to the
    // portfolios slot so the building row is visible (mirrors single-idea build).
    const isBuildingPortfolio = !!buildingPortfolio
    useEffect(() => {
        if (isBuildingPortfolio) setActiveFilter('portfolios')
    }, [isBuildingPortfolio])

    // While the Positions tab is in view, poll so live P&L keeps ticking. Stops
    // when the user leaves the tab or the component unmounts.
    useEffect(() => {
        if (activeFilter !== 'positions' || !onRefreshPositions) return
        const id = setInterval(() => onRefreshPositions(), POSITIONS_POLL_MS)
        return () => clearInterval(id)
    }, [activeFilter, onRefreshPositions])

    function handleOpen(idea)  { setActiveIdea(idea) }
    function handleClose()     { setActiveIdea(null) }
    function handleEdit(idea)  { setActiveIdea(null); if (onEdit) onEdit(idea) }

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

    const { standalone, groups, brokerGroups } = _separateIdeas(ideas)

    // Interleave standalone ideas and multi-broker groups by recency so a forked
    // idea sorts where its creation time puts it (one row, expandable).
    const ideaRows = [
        ...standalone.map(i => ({ kind: 'idea', savedAt: i.savedAt || 0, item: i })),
        ...brokerGroups.map(g => ({ kind: 'group', savedAt: g.savedAt || 0, item: g })),
    ].sort((a, b) => b.savedAt - a.savedAt)

    // While editing a portfolio, its building row stands in for the saved one — hide
    // the saved group so we don't show a duplicate (building row + original row).
    const editingPortfolioId = buildingPortfolio?.portfolioId ?? null
    const visibleGroups = editingPortfolioId
        ? groups.filter(g => g.portfolioId !== editingPortfolioId)
        : groups

    const showIdeas      = activeFilter === 'ideas'
    const showPositions  = activeFilter === 'positions'
    const hasIdeasRows   = buildingIdea || ideaRows.length > 0
    const hasPortfolios  = visibleGroups.length > 0

    return (
        <section className="trade-ideas-list full">
            <div className="trade-ideas-list__header">
                <svg className="trade-ideas-list__header-icon" viewBox="0 0 10 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 0L0 10h4.5L3 18l7-10H5.5L6 0z"/>
                </svg>
                <span className="trade-ideas-list__header-title">Tradvices</span>
                <div className="trade-ideas-list__filters">
                    <button
                        className={`trade-ideas-list__filter${activeFilter === 'ideas' ? ' active' : ''}`}
                        onClick={() => setActiveFilter('ideas')}
                    >Ideas</button>
                    <button
                        className={`trade-ideas-list__filter trade-ideas-list__filter--portfolio${activeFilter === 'portfolios' ? ' active' : ''}`}
                        onClick={() => setActiveFilter('portfolios')}
                    >Portfolios</button>
                    <button
                        className={`trade-ideas-list__filter trade-ideas-list__filter--positions${activeFilter === 'positions' ? ' active' : ''}`}
                        onClick={selectPositions}
                    >Positions{positions.length > 0 ? ` (${positions.length})` : ''}</button>
                </div>
            </div>

            <div className="trade-ideas-list__scroll">
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
                                {buildingIdea && (
                                    <TradeIdeaRow
                                        key="__building__"
                                        idea={buildingIdea}
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
                ) : showPositions ? (
                    positions.length === 0 ? (
                        <p className="trade-ideas-list__empty">{positionsLoading ? 'Loading positions…' : 'No open positions'}</p>
                    ) : (
                        <PositionsTable
                            positions={positions}
                            closingId={closingId}
                            onClose={setPendingClose}
                            onEditOrders={setEditOrdersPos}
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
                                    <th className="col-pf-status">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {buildingPortfolio && (
                                    <tr className="portfolio-group-row portfolio-group-row--building">
                                        <td className="portfolio-group-row__name">{buildingPortfolio.name}</td>
                                        <td className="portfolio-group-row__count">{buildingPortfolio.ideasCount}</td>
                                        <td className="portfolio-group-row__created">—</td>
                                        <td className="portfolio-group-row__status">
                                            <svg className="idea-row__building-bot" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" title="Building…" aria-hidden="true">
                                                {/* Antenna */}
                                                <line x1="10" y1="5" x2="10" y2="2"   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                                <circle cx="10" cy="1.5" r="1"         fill="currentColor"/>
                                                {/* Head */}
                                                <rect x="2" y="5" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                                                {/* Eyes */}
                                                <circle cx="7"  cy="10" r="1.8"        fill="currentColor"/>
                                                <circle cx="13" cy="10" r="1.8"        fill="currentColor"/>
                                                {/* Mouth */}
                                                <rect x="6.5" y="13" width="7" height="1.5" rx="0.75" fill="currentColor"/>
                                            </svg>
                                        </td>
                                    </tr>
                                )}
                                {visibleGroups.map(group => (
                                    <PortfolioGroupRow
                                        key={group.portfolioId}
                                        group={group}
                                        expanded={expandedGroups.has(group.portfolioId)}
                                        onToggle={() => toggleGroup(group.portfolioId)}
                                        onEdit={onEditPortfolio}
                                        onDelete={onDelete}
                                        onDeletePortfolio={onDeletePortfolio}
                                        onStatusChange={onStatusChange}
                                        onOpen={handleOpen}
                                        onSymbolClick={onSymbolClick}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )
                )}
            </div>

            <TradeIdeaDialog
                idea={activeIdea}
                positions={positions}
                onClose={handleClose}
                onEdit={handleEdit}
                onDelete={onDelete}
                onPlaceOrder={onPlaceOrder}
            />

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
    onDelete:         PropTypes.func.isRequired,
    onCancelBuild:    PropTypes.func.isRequired,
    onStatusChange:   PropTypes.func.isRequired,
    onEdit:           PropTypes.func,
    onEditPortfolio:  PropTypes.func,
    onDeletePortfolio: PropTypes.func,
    onPlaceOrder:     PropTypes.func,
    positions:        PropTypes.array,
    positionsLoading: PropTypes.bool,
    onRefreshPositions: PropTypes.func,
    onClosePosition:  PropTypes.func,
}
