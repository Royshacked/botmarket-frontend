import { useState, useEffect } from 'react'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote'
import { IdeaDetail } from '../cmps/TradeIdeas/IdeaDetail.jsx'
import { formatCreatedAtFull } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { StatusIcon } from '../cmps/StatusIcon.jsx'
import './IdeaPage.scss'

export function IdeaPage() {
    const id              = window.location.pathname.split('/').at(-1)
    const [idea, setIdea] = useState(null)
    const [err,  setErr]  = useState(null)

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
                        <StatusIcon status={idea.status} size={20} />
                    </span>
                )}
            </div>

            <IdeaDetail idea={idea} positions={[]} />
        </div>
    )
}
