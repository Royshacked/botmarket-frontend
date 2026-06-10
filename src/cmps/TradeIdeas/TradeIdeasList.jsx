import { useState } from 'react'
import PropTypes from 'prop-types'
import { TradeIdeaRow } from './TradeIdeaRow.jsx'
import { TradeIdeaDialog } from './TradeIdeaDialog.jsx'
import './TradeIdeas.scss'

function _groupIdeas(ideas) {
    const groupMap = new Map()
    const rows = []

    for (const idea of ideas) {
        if (idea.portfolioId) {
            if (!groupMap.has(idea.portfolioId)) {
                const group = {
                    type:        'group',
                    portfolioId: idea.portfolioId,
                    name:        idea.portfolioName || 'Portfolio',
                    ideas:       [],
                    savedAt:     idea.savedAt,
                }
                groupMap.set(idea.portfolioId, group)
                rows.push(group)
            }
            groupMap.get(idea.portfolioId).ideas.push(idea)
        } else {
            rows.push({ type: 'idea', idea, savedAt: idea.savedAt })
        }
    }

    return rows.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
}

function PortfolioGroupRow({ group, expanded, onToggle, onDelete, onStatusChange, onOpen, onSymbolClick, onEdit }) {
    function handleDeleteAll(e) {
        e.stopPropagation()
        group.ideas.forEach(idea => onDelete(idea.id))
    }

    return (
        <>
            <tr className="portfolio-group-row" onClick={onToggle}>
                <td colSpan={4} className="portfolio-group-row__header">
                    <div className="portfolio-group-row__header-inner">
                        <span className="portfolio-group-row__toggle">{expanded ? '▾' : '▸'}</span>
                        <span className="portfolio-group-row__name">{group.name}</span>
                        <span className="portfolio-group-row__count">{group.ideas.length} ideas</span>
                    </div>
                </td>
                <td className="portfolio-group-row__controls">
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
                    onEdit={onEdit}
                    isPortfolioChild
                />
            ))}
        </>
    )
}

export function TradeIdeasList({ ideas, buildingIdea, onDelete, onCancelBuild, onStatusChange, onUpdate, onSymbolClick, onEdit }) {
    const [activeIdea,      setActiveIdea]      = useState(null)
    const [expandedGroups,  setExpandedGroups]  = useState(new Set())

    function handleOpen(idea) { setActiveIdea(idea) }
    function handleClose()    { setActiveIdea(null) }

    function handleEdit(idea) {
        setActiveIdea(null)
        if (onEdit) onEdit(idea)
    }

    function toggleGroup(portfolioId) {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(portfolioId)) next.delete(portfolioId)
            else next.add(portfolioId)
            return next
        })
    }

    const rows   = _groupIdeas(ideas)
    const hasRows = buildingIdea || rows.length > 0

    return (
        <section className="trade-ideas-list full">
            <div className="trade-ideas-list__header">
                <svg className="trade-ideas-list__header-icon" viewBox="0 0 10 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 0L0 10h4.5L3 18l7-10H5.5L6 0z"/>
                </svg>
                <span className="trade-ideas-list__header-title">Trade Ideas</span>
            </div>
            <div className="trade-ideas-list__scroll">
                {!hasRows ? (
                    <p className="trade-ideas-list__empty">No trade ideas yet</p>
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
                            {rows.map((row, i) =>
                                row.type === 'group' ? (
                                    <PortfolioGroupRow
                                        key={row.portfolioId}
                                        group={row}
                                        expanded={expandedGroups.has(row.portfolioId)}
                                        onToggle={() => toggleGroup(row.portfolioId)}
                                        onDelete={onDelete}
                                        onStatusChange={onStatusChange}
                                        onOpen={handleOpen}
                                        onSymbolClick={onSymbolClick}
                                        onEdit={onEdit}
                                    />
                                ) : (
                                    <TradeIdeaRow
                                        key={row.idea.id}
                                        idea={row.idea}
                                        onDelete={onDelete}
                                        onStatusChange={onStatusChange}
                                        onOpen={handleOpen}
                                        onSymbolClick={onSymbolClick}
                                        onEdit={onEdit}
                                    />
                                )
                            )}
                        </tbody>
                    </table>
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
    ideas:          PropTypes.array.isRequired,
    buildingIdea:   PropTypes.object,
    onDelete:       PropTypes.func.isRequired,
    onCancelBuild:  PropTypes.func.isRequired,
    onStatusChange: PropTypes.func.isRequired,
    onEdit:         PropTypes.func,
}
