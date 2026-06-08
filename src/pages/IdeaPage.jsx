import { useState, useEffect } from 'react'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote'
import { TradingViewChart }  from '../cmps/TradingViewChart/TradingViewChart.jsx'
import { getTree, ConditionTreeView } from '../cmps/TradeIdeas/TradeIdeaDialog.jsx'
import './IdeaPage.scss'

const STATUS_LABEL = {
    waiting: 'Waiting',
    looking: 'Watching',
    hit:     'Entry triggered',
    long:    'Long ●',
    short:   'Short ●',
    closed:  'Closed',
}

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
            } catch {}
        }
        // Fallback: fetch from API
        tradeIdeasService.getIdea(id)
            .then(setIdea)
            .catch(() => setErr('Failed to load idea'))
    }, [id])

    const centreStyle = { position: 'fixed', inset: 0, background: '#0b1120', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }
    if (err)   return <div style={centreStyle}>{err}</div>
    if (!idea) return <div style={centreStyle}>Loading…</div>

    const entryTree = getTree(idea, 'entry_condition_tree', 'entry_conditions', 'entry_logic')
    const stopTree  = getTree(idea, 'stop_condition_tree',  'stop_conditions',  'stop_logic')
    const tpTree    = getTree(idea, 'tp_condition_tree',    'tp_conditions',    'tp_logic')

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
                </span>
                {idea.status && (
                    <span className={`idea-page__status status--${idea.status}`}>
                        {STATUS_LABEL[idea.status] ?? idea.status}
                    </span>
                )}
            </div>

            <div className="idea-page__chart">
                <TradingViewChart symbol={idea.asset || 'AAPL'} />
            </div>

            <div className="idea-page__conditions">
                <div className="idea-page__field">
                    <span className="idea-page__label">Entry</span>
                    <ConditionTreeView node={entryTree} />
                </div>

                <div className="idea-page__field">
                    <span className="idea-page__label">Stop loss</span>
                    <ConditionTreeView node={stopTree} />
                </div>

                {tpTree && (
                    <div className="idea-page__field">
                        <span className="idea-page__label">Take profit</span>
                        <ConditionTreeView node={tpTree} />
                    </div>
                )}

                {Array.isArray(idea.additional_entries) && idea.additional_entries.length > 0 && (
                    <div className="idea-page__field">
                        <span className="idea-page__label">Scale-in entries</span>
                        {idea.additional_entries.map((ae, i) => {
                            const tree = ae.condition_tree ?? (
                                Array.isArray(ae.conditions) && ae.conditions.length > 0
                                    ? { operator: ae.logic ?? 'AND', children: ae.conditions }
                                    : null
                            )
                            return (
                                <div key={i} className="idea-page__ae">
                                    <span className="idea-page__ae-qty">
                                        +{ae.quantity ?? '?'}{ae.triggeredAt ? ' ✅' : ''}
                                    </span>
                                    <ConditionTreeView node={tree} />
                                </div>
                            )
                        })}
                    </div>
                )}

                {idea.notes && (
                    <div className="idea-page__field">
                        <span className="idea-page__label">Notes</span>
                        <p className="idea-page__notes">{idea.notes}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
