import { useState } from 'react'
import PropTypes from 'prop-types'
import { TradeIdeaRow } from './TradeIdeaRow.jsx'
import { TradeIdeaDialog } from './TradeIdeaDialog.jsx'
import './TradeIdeas.scss'

export function TradeIdeasList({ ideas, buildingIdea, onDelete, onCancelBuild, onStatusChange, onUpdate, onSymbolClick, onEdit }) {
    const [activeIdea, setActiveIdea] = useState(null)

    function handleOpen(idea) {
        setActiveIdea(idea)
    }

    function handleClose() {
        setActiveIdea(null)
    }

    function handleEdit(idea) {
        setActiveIdea(null)
        if (onEdit) onEdit(idea)
    }

    const hasRows = buildingIdea || ideas.length > 0

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
                            {/* Live building row — always pinned at top */}
                            {buildingIdea && (
                                <TradeIdeaRow
                                    key="__building__"
                                    idea={buildingIdea}
                                    onDelete={onCancelBuild}
                                    onStatusChange={() => {}}
                                    onOpen={() => {}}
                                />
                            )}
                            {ideas.map(idea => (
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
