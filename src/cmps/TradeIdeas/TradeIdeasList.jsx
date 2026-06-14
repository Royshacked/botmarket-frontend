import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { TradeIdeaRow } from './TradeIdeaRow.jsx'
import { TradeIdeaDialog } from './TradeIdeaDialog.jsx'
import { formatCreatedAt, activationStatus } from './tradeIdea.utils.js'
import './TradeIdeas.scss'

function _separateIdeas(ideas) {
    const standalone = []
    const groupMap   = new Map()

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
        } else {
            standalone.push(idea)
        }
    }

    const groups = [...groupMap.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    standalone.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    return { standalone, groups }
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

    return (
        <>
            <tr className="portfolio-group-row" onClick={onToggle}>
                <td className="portfolio-group-row__name">
                    <span className="portfolio-group-row__caret">{expanded ? '▾' : '▸'}</span>
                    {group.name}
                </td>
                <td className="portfolio-group-row__count">{group.ideas.length}</td>
                <td className="portfolio-group-row__created">{formatCreatedAt(group.savedAt) || '—'}</td>
                <td className="portfolio-group-row__edit">
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
                        className="idea-row__delete"
                        onClick={handleDeleteAll}
                        title="Delete all ideas in this portfolio"
                    >×</button>
                </td>
                <td className="portfolio-group-row__status">
                    {allWaiting ? (
                        <button
                            className="idea-row__status-toggle status--waiting"
                            onClick={handleActivateAll}
                            title="Activate all ideas in this portfolio"
                        >waiting</button>
                    ) : (
                        <span className="idea-row__status-badge portfolio-group-row__status-active">active</span>
                    )}
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

export function TradeIdeasList({ ideas, chatTab, buildingIdea, buildingPortfolio, onDelete, onCancelBuild, onStatusChange, onUpdate, onSymbolClick, onEdit, onEditPortfolio, onDeletePortfolio, onPlaceOrder }) {
    const [activeIdea,     setActiveIdea]     = useState(null)
    const [expandedGroups, setExpandedGroups] = useState(new Set())
    const [activeFilter,   setActiveFilter]   = useState('ideas')

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

    function handleOpen(idea)  { setActiveIdea(idea) }
    function handleClose()     { setActiveIdea(null) }
    function handleEdit(idea)  { setActiveIdea(null); if (onEdit) onEdit(idea) }

    function toggleGroup(portfolioId) {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(portfolioId)) next.delete(portfolioId)
            else next.add(portfolioId)
            return next
        })
    }

    const { standalone, groups } = _separateIdeas(ideas)

    const showIdeas      = activeFilter === 'ideas'
    const hasIdeasRows   = buildingIdea || standalone.length > 0
    const hasPortfolios  = groups.length > 0

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
                                {standalone.map(idea => (
                                    <TradeIdeaRow
                                        key={idea.id}
                                        idea={idea}
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
                ) : (
                    (!hasPortfolios && !buildingPortfolio) ? (
                        <p className="trade-ideas-list__empty">No portfolios yet</p>
                    ) : (
                        <table className="portfolios-table">
                            <thead>
                                <tr>
                                    <th className="col-pf-name">Portfolio</th>
                                    <th className="col-pf-count"># Assets</th>
                                    <th className="col-pf-created">Created</th>
                                    <th className="col-pf-edit">Edit</th>
                                    <th className="col-pf-status">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {buildingPortfolio && (
                                    <tr className="portfolio-group-row portfolio-group-row--building">
                                        <td className="portfolio-group-row__name">{buildingPortfolio.name}</td>
                                        <td className="portfolio-group-row__count">{buildingPortfolio.ideasCount}</td>
                                        <td className="portfolio-group-row__created">—</td>
                                        <td className="portfolio-group-row__edit" />
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
                                {groups.map(group => (
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
                onClose={handleClose}
                onEdit={handleEdit}
                onDelete={onDelete}
                onPlaceOrder={onPlaceOrder}
            />
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
}
