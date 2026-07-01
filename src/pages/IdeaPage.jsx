import { useState, useEffect } from 'react'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote'
import { IdeaDetail } from '../cmps/TradeIdeas/IdeaDetail.jsx'
import { formatCreatedAtFull } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { StatusIcon } from '../cmps/StatusIcon.jsx'
import { usePositions } from '../customHooks/usePositions.js'
import './IdeaPage.scss'

// How often to re-fetch positions so live P&L keeps ticking in the popped-out window.
const POSITIONS_POLL_MS = 4000

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
    const id              = window.location.pathname.split('/').at(-1)
    const [idea, setIdea] = useState(null)
    const [err,  setErr]  = useState(null)
    const { positions, refresh: refreshPositions, closePosition } = usePositions()

    // Keep P&L live while the window is open (usePositions only loads once on mount).
    useEffect(() => {
        const t = setInterval(() => refreshPositions(), POSITIONS_POLL_MS)
        return () => clearInterval(t)
    }, [refreshPositions])

    useEffect(() => {
        // Fastest path: data injected directly onto window by the opener
        if (window.__ideaData?.id === id) {
            setIdea(window.__ideaData)
            delete window.__ideaData
            return
        }
        // Second path: serialised to localStorage by the opener before window.open
        const cached = localStorage.getItem(`popup-idea-${id}`)
        if (cached) {
            try {
                setIdea(JSON.parse(cached))
                localStorage.removeItem(`popup-idea-${id}`)
                return
            } catch { /* bad cache — fall through to API */ }
        }
        // Fallback: fetch from API
        tradeIdeasService.getIdea(id)
            .then(setIdea)
            .catch(() => setErr('Failed to load idea'))
    }, [id])

    const centreStyle = { position: 'fixed', inset: 0, background: '#0b1120', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }
    if (err)   return <div style={centreStyle}>{err}</div>
    if (!idea) return <div style={centreStyle}>Loading…</div>

    const rootStyle = {
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-primary, #0b1120)',
        color: 'var(--text-primary, #e2e8f0)',
        overflow: 'hidden',
    }

    return (
        <div className="idea-page" style={rootStyle}>
            <div className="idea-page__header">
                <span className="idea-page__title">
                    <span className="idea-page__asset">{idea.asset || '—'}</span>
                    {idea.direction && (
                        <span className={`idea-page__direction direction--${idea.direction}`}>
                            {idea.direction}
                        </span>
                    )}
                    {idea.quantity != null && <span className="idea-page__meta">{idea.quantity} shares</span>}
                    {idea.type     != null && <span className="idea-page__meta">{idea.type}</span>}
                    {idea.savedAt  != null && <span className="idea-page__meta">{formatCreatedAtFull(idea.savedAt)}</span>}
                </span>
                {idea.status && (
                    <span className={`idea-page__status status--${idea.status}`}>
                        <StatusIcon status={idea.status} />
                    </span>
                )}
            </div>

            <DevInvalidationPanel
                invalidation={idea.invalidation}
                status={idea.invalidation_status}
                reason={idea.invalidation_reason}
                edge={idea.invalidation_edge}
                armed={idea.invalidation_armed}
            />

            <IdeaDetail
                idea={idea}
                positions={positions}
                closePosition={closePosition}
                onPositionsChanged={refreshPositions}
            />
        </div>
    )
}
