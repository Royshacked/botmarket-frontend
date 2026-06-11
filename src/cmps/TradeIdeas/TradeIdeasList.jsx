import { useState } from 'react'
import PropTypes from 'prop-types'
import { TradeIdeaRow } from './TradeIdeaRow.jsx'
import { TradeIdeaDialog } from './TradeIdeaDialog.jsx'
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

function PortfolioGroupRow({ group, expanded, onToggle, onEdit, onDelete, onStatusChange, onOpen, onSymbolClick, onEditIdea }) {
    function handleDeleteAll(e) {
        e.stopPropagation()
        group.ideas.forEach(idea => onDelete(idea.id))
    }

    return (
        <>
            <tr className="portfolio-group-row" onClick={() => !expanded && onToggle()}>
                <td colSpan={4} className="portfolio-group-row__header">
                    <div className="portfolio-group-row__header-inner">
                        <span className="portfolio-group-row__name">{group.name}</span>
                        <span className="portfolio-group-row__count">{group.ideas.length} ideas</span>
                        {expanded && (
                            <button
                                className="portfolio-group-row__collapse"
                                onClick={e => { e.stopPropagation(); onToggle() }}
                                title="Collapse"
                            >▲</button>
                        )}
                    </div>
                </td>
                <td className="portfolio-group-row__controls">
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
            </tr>
            {expanded && group.ideas.map(idea => (
                <TradeIdeaRow
                    key={idea.id}
                    idea={idea}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                    onOpen={onOpen}
                    onSymbolClick={onSymbolClick}
                    onEdit={onEditIdea}
                    isPortfolioChild
                />
            ))}
        </>
    )
}

export function TradeIdeasList({ ideas, buildingIdea, onDelete, onCancelBuild, onStatusChange, onUpdate, onSymbolClick, onEdit, onEditPortfolio }) {
    const [activeIdea,     setActiveIdea]     = useState(null)
    const [expandedGroups, setExpandedGroups] = useState(new Set())
    const [activeFilter,   setActiveFilter]   = useState('ideas')

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
                    !hasPortfolios ? (
                        <p className="trade-ideas-list__empty">No portfolios yet</p>
                    ) : (
                        <table className="ideas-table">
                            <thead>
                                <tr>
                                    <th className="col-asset">Asset</th>
                                    <th className="col-dir">Dir</th>
                                    <th className="col-type">Type</th>
                                    <th className="col-notes">Trade Summary</th>
                                    <th className="col-status">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map(group => (
                                    <PortfolioGroupRow
                                        key={group.portfolioId}
                                        group={group}
                                        expanded={expandedGroups.has(group.portfolioId)}
                                        onToggle={() => toggleGroup(group.portfolioId)}
                                        onEdit={onEditPortfolio}
                                        onDelete={onDelete}
                                        onStatusChange={onStatusChange}
                                        onOpen={handleOpen}
                                        onSymbolClick={onSymbolClick}
                                        onEditIdea={onEdit}
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
            />
        </section>
    )
}

TradeIdeasList.propTypes = {
    ideas:            PropTypes.array.isRequired,
    buildingIdea:     PropTypes.object,
    onDelete:         PropTypes.func.isRequired,
    onCancelBuild:    PropTypes.func.isRequired,
    onStatusChange:   PropTypes.func.isRequired,
    onEdit:           PropTypes.func,
    onEditPortfolio:  PropTypes.func,
}
