import PropTypes from 'prop-types'
import { PriceChart } from '../PriceChart/PriceChart.jsx'
import { ConditionTreeView, isAllAnd } from './ConditionTree.jsx'
import { PopoutFooter } from './PopoutFooter.jsx'
import { brokerSymbolLabel, deriveIdeaInterval, phaseTree, isSystemStatus } from './tradeIdea.utils.js'

// Shared idea body — chart (left) + conditions (right) + positions (bottom).
// Rendered by both the floating dialog and the popped-out idea window so the two
// stay visually identical.
//
// When `closePosition` is supplied the position cards are interactive — each card
// gets close / edit-orders controls (same as the Positions tab) and this body
// renders the confirm + edit dialogs itself. Without it the cards are read-only.
export function IdeaDetail({ idea, positions = [], closePosition, onPositionsChanged, onDelete }) {
    const entryTree = phaseTree(idea, 'entry')
    const stopTree  = phaseTree(idea, 'stop')
    const tpTree    = phaseTree(idea, 'tp')

    // Per-phase met-state maps persisted by the monitor (leafStateKey → metAt).
    const condStates = idea.conditionStates ?? {}

    // Fallback for entry leaves on ideas that passed entry before per-condition
    // state was persisted (e.g. an already-'hit' idea with no conditionStates).
    // Only safe for all-AND trees — every leaf is then met by definition.
    const entryPassed = idea.entryTriggeredAt != null || isSystemStatus(idea.status)
    const entryStatesEmpty = !condStates.entry || Object.keys(condStates.entry).length === 0
    const entryFallbackMet = entryPassed && entryStatesEmpty && isAllAnd(entryTree)

    // Open positions belonging to this idea — matched by the asset or its broker
    // symbol alias (NQ ↔ US100). "for now" we show the same table as the Positions tab.
    const ideaSymbols   = [idea.asset, brokerSymbolLabel(idea)].filter(Boolean).map(s => String(s).toUpperCase())
    const ideaPositions = positions.filter(p => p.symbol && ideaSymbols.includes(String(p.symbol).toUpperCase()))

    return (
        <>
            <div className="idea-dialog__main">
                <div className="idea-dialog__chart">
                    <PriceChart symbol={idea.asset || 'SPY'} interval={deriveIdeaInterval(idea) || 'D'} />
                </div>

                <div className="idea-dialog__conditions">
                    <div className="idea-dialog__field">
                        <span>Entry conditions</span>
                        <ConditionTreeView node={entryTree} states={condStates.entry} fallbackMet={entryFallbackMet} />
                    </div>

                    <div className="idea-dialog__field">
                        <span>Stop loss</span>
                        <ConditionTreeView node={stopTree} states={condStates.stop} />
                    </div>

                    {tpTree && (
                        <div className="idea-dialog__field">
                            <span>Take profit</span>
                            <ConditionTreeView node={tpTree} states={condStates.tp} />
                        </div>
                    )}

                    {Array.isArray(idea.additional_entries) && idea.additional_entries.length > 0 && (
                        <div className="idea-dialog__field">
                            <span>Additional entries <em>(scale-in)</em></span>
                            {idea.additional_entries.map((ae, i) => {
                                const tree = ae.condition_tree ?? (
                                    Array.isArray(ae.conditions) && ae.conditions.length > 0
                                        ? { operator: ae.logic ?? 'AND', children: ae.conditions }
                                        : null
                                )
                                return (
                                    <div key={i} style={{ marginBottom: 6 }}>
                                        <span className="idea-dialog__ae-qty">
                                            +{ae.quantity ?? '?'}{ae.triggeredAt ? ' ✅' : ''}
                                        </span>
                                        <ConditionTreeView node={tree} />
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {idea.notes && (
                        <div className="idea-dialog__field">
                            <span>Notes</span>
                            <p className="idea-dialog__notes">{idea.notes}</p>
                        </div>
                    )}
                </div>
            </div>

            <PopoutFooter
                positions={ideaPositions}
                closePosition={closePosition}
                onPositionsChanged={onPositionsChanged}
                onDelete={onDelete}
                deleteTitle="Delete idea"
            />
        </>
    )
}

IdeaDetail.propTypes = {
    idea:               PropTypes.object.isRequired,
    positions:          PropTypes.array,
    closePosition:      PropTypes.func,
    onPositionsChanged: PropTypes.func,
    onDelete:           PropTypes.func,
}
