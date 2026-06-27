import { useState, useEffect } from 'react'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote'
import { IdeaDetail } from '../cmps/TradeIdeas/IdeaDetail.jsx'
import { formatCreatedAtFull } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { StatusIcon } from '../cmps/StatusIcon.jsx'
import { usePositions } from '../customHooks/usePositions.js'
import './IdeaPage.scss'

// How often to re-fetch positions so live P&L keeps ticking in the popped-out window.
const POSITIONS_POLL_MS = 4000

function DevThesisPanel({ thesis, thesisStatus, thesisStatusReason }) {
    const [open, setOpen] = useState(false)
    if (!thesis) return null
    const entry = thesis.entry ?? {}
    const tp    = thesis.tp    ?? {}
    return (
        <div className="idea-page__dev-thesis">
            <button className="idea-page__dev-thesis-toggle" onClick={() => setOpen(o => !o)}>
                <span>[DEV] Thesis</span>
                {thesisStatus && <span className={`idea-page__dev-thesis-status idea-page__dev-thesis-status--${thesisStatus}`}>{thesisStatus}</span>}
                <span className="idea-page__dev-thesis-caret">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div className="idea-page__dev-thesis-body">
                    {entry.reasoning && (
                        <div className="idea-page__dev-thesis-section">
                            <span className="idea-page__dev-thesis-label">Entry reasoning</span>
                            <p>{entry.reasoning}</p>
                        </div>
                    )}
                    {Array.isArray(entry.key_assumptions) && entry.key_assumptions.length > 0 && (
                        <div className="idea-page__dev-thesis-section">
                            <span className="idea-page__dev-thesis-label">Key assumptions</span>
                            <ul>{entry.key_assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                        </div>
                    )}
                    {Array.isArray(entry.stress_triggers) && entry.stress_triggers.length > 0 && (
                        <div className="idea-page__dev-thesis-section">
                            <span className="idea-page__dev-thesis-label">Stress triggers</span>
                            <ul>{entry.stress_triggers.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </div>
                    )}
                    {tp.reasoning && (
                        <div className="idea-page__dev-thesis-section">
                            <span className="idea-page__dev-thesis-label">TP reasoning</span>
                            <p>{tp.reasoning}</p>
                        </div>
                    )}
                    {Array.isArray(tp.stress_triggers) && tp.stress_triggers.length > 0 && (
                        <div className="idea-page__dev-thesis-section">
                            <span className="idea-page__dev-thesis-label">TP stress triggers</span>
                            <ul>{tp.stress_triggers.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </div>
                    )}
                    {thesisStatusReason && (
                        <div className="idea-page__dev-thesis-section">
                            <span className="idea-page__dev-thesis-label">Monitor reason</span>
                            <p>{thesisStatusReason}</p>
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

            <DevThesisPanel
                thesis={idea.thesis}
                thesisStatus={idea.thesis_status}
                thesisStatusReason={idea.thesis_status_reason}
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
