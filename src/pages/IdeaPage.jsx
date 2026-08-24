import { useState } from 'react'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote'
import { IdeaDetail } from '../cmps/TradeIdeas/IdeaDetail.jsx'
import { formatCreatedAtFull } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { EntityPopupShell } from '../cmps/EntityCard/EntityPopupShell.jsx'
import { useEntityPopup } from '../customHooks/useEntityPopup.js'
import { usePositions } from '../customHooks/usePositions.js'
import './IdeaPage.scss'

function DevInvalidationPanel({ invalidation, status, reason, edge, armed }) {
    const [open, setOpen] = useState(false)
    const range = invalidation?.range
    if (!range) return null
    // Pre-entry lifecycle: 'waiting' (distant entry, envelope disarmed) → 'armed'
    // (price reached the zone, envelope live). A drift/fire latches the status.
    const phase = armed ? 'armed' : 'waiting'
    return (
        <div className="idea-page__dev-invalidation">
            <button className="idea-page__dev-invalidation-toggle" onClick={() => setOpen(o => !o)}>
                <span>[DEV] Invalidation</span>
                {status
                    ? <span className={`idea-page__dev-invalidation-status idea-page__dev-invalidation-status--${status}`}>{status}</span>
                    : <span className={`idea-page__dev-invalidation-status idea-page__dev-invalidation-status--${phase}`}>{phase}</span>}
                <span className="idea-page__dev-invalidation-caret">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div className="idea-page__dev-invalidation-body">
                    <div className="idea-page__dev-invalidation-section">
                        <span className="idea-page__dev-invalidation-label">Entry range</span>
                        <ul>
                            <li>
                                Lower: {range.lower ?? '—'}
                                {range.lowerAnchor && <span className="idea-page__dev-invalidation-anchor"> — {range.lowerAnchor}</span>}
                            </li>
                            <li>
                                Upper: {range.upper ?? '—'}
                                {range.upperAnchor && <span className="idea-page__dev-invalidation-anchor"> — {range.upperAnchor}</span>}
                            </li>
                        </ul>
                    </div>
                    {range.approach != null && (
                        <div className="idea-page__dev-invalidation-section">
                            <span className="idea-page__dev-invalidation-label">Approach (away pivot)</span>
                            <ul>
                                <li>
                                    {range.approach}
                                    {range.approachAnchor && <span className="idea-page__dev-invalidation-anchor"> — {range.approachAnchor}</span>}
                                </li>
                            </ul>
                        </div>
                    )}
                    {(status === 'fired' || status === 'drifting') && (
                        <div className="idea-page__dev-invalidation-section">
                            <span className="idea-page__dev-invalidation-label">{status === 'drifting' ? 'Drifting' : 'Fired'}{edge ? ` (${edge} edge)` : ''}</span>
                            {reason && <p>{reason}</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export function IdeaPage() {
    // Hand-off, hydration and the API fallback all live in the shared hook.
    const { id, entity: idea, error } = useEntityPopup('idea', tradeIdeasService.getIdea, { notFound: 'Idea not found' })
    const { positions, refresh: refreshPositions, closePosition } = usePositions()

    async function handleDelete() {
        try { await tradeIdeasService.deleteIdea(id); window.close() }
        catch (e) { console.error('[idea-page] delete failed', e) }   // e.g. delete-locked (live position)
    }

    return (
        <EntityPopupShell
            error={error}
            loading={!idea}
            asset={idea?.asset}
            direction={idea?.direction}
            status={idea?.status}
            meta={idea ? [
                idea.quantity != null ? `${idea.quantity} shares` : null,
                idea.type ?? null,
                idea.savedAt != null ? formatCreatedAtFull(idea.savedAt) : null,
            ] : []}
            above={idea && (
                <DevInvalidationPanel
                    invalidation={idea.invalidation}
                    status={idea.invalidation_status}
                    reason={idea.invalidation_reason}
                    edge={idea.invalidation_edge}
                    armed={idea.invalidation_armed}
                />
            )}
        >
            {idea && (
                <IdeaDetail
                    idea={idea}
                    positions={positions}
                    closePosition={closePosition}
                    onPositionsChanged={refreshPositions}
                    onDelete={handleDelete}
                />
            )}
        </EntityPopupShell>
    )
}
