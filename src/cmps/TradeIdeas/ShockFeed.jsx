import { useState } from 'react'
import PropTypes from 'prop-types'
import { OpportunityRow, SignalRow } from './ShockFeedCard.jsx'
import './ShockFeed.scss'

// Group a flat list of (ticker, channel, news_article) docs into one row per ticker.
//
// Two-pass deduplication:
//   1. Collapse (ticker, channel_id) duplicates — multiple news articles can each fire
//      a signal for the same ticker+channel pair. Keep the highest-confidence hit per pair.
//   2. Group the deduplicated channels by ticker, taking the broadest lag range and the
//      direction from whichever channel has the highest confidence.
function groupByTicker(items) {
    // Pass 1 — deduplicate per (ticker, channel_id)
    const chMap = new Map()
    for (const item of items) {
        const key      = `${item.ticker}:${item.channel_id}`
        const existing = chMap.get(key)
        if (!existing || item.confidence_llm > existing.confidence_llm) {
            chMap.set(key, item)
        }
    }

    // Pass 2 — group by ticker
    const tickerMap = new Map()
    for (const item of chMap.values()) {
        const t = item.ticker
        if (!tickerMap.has(t)) {
            tickerMap.set(t, {
                ticker:           t,
                ticker_direction: item.ticker_direction,
                lag_weeks_min:    item.lag_weeks_min,
                lag_weeks_max:    item.lag_weeks_max,
                confidence_llm:   item.confidence_llm,
                agent:            item.agent,
                channels:         [],
            })
        }
        const g = tickerMap.get(t)
        g.channels.push(item)
        g.lag_weeks_min = Math.min(g.lag_weeks_min, item.lag_weeks_min)
        g.lag_weeks_max = Math.max(g.lag_weeks_max, item.lag_weeks_max)
        if (item.confidence_llm > g.confidence_llm) {
            g.confidence_llm   = item.confidence_llm
            g.ticker_direction = item.ticker_direction
            g.agent            = item.agent
        }
    }
    for (const g of tickerMap.values()) {
        g.channels.sort((a, b) => b.confidence_llm - a.confidence_llm)
    }
    return [...tickerMap.values()].sort((a, b) => b.confidence_llm - a.confidence_llm)
}

export function ShockFeed({ signals, opportunities, loading, onBuild }) {
    const [tab, setTab] = useState('opportunities')
    const showOpps = tab === 'opportunities'

    if (loading) return <p className="trade-ideas-list__empty">Loading shocks…</p>

    const groupedOpps    = groupByTicker(opportunities)
    const groupedSignals = groupByTicker(signals)

    const isEmpty  = showOpps ? groupedOpps.length === 0 : groupedSignals.length === 0
    const emptyMsg = showOpps
        ? 'No confirmed opportunities yet — Aether needs a FRED release day to validate predictions.'
        : 'No provisional signals yet — check back after the next news ingest.'

    return (
        <div className="shock-feed">
            <div className="shock-feed__tabs">
                <button
                    className={`shock-feed__tab${showOpps ? ' shock-feed__tab--active' : ''}`}
                    onClick={() => setTab('opportunities')}
                >
                    Opportunities
                    {groupedOpps.length > 0 && (
                        <span className="shock-feed__tab-count">{groupedOpps.length}</span>
                    )}
                </button>
                <button
                    className={`shock-feed__tab${!showOpps ? ' shock-feed__tab--active' : ''}`}
                    onClick={() => setTab('signals')}
                >
                    Signals
                    {groupedSignals.length > 0 && (
                        <span className="shock-feed__tab-count">{groupedSignals.length}</span>
                    )}
                </button>
            </div>

            {isEmpty ? (
                <p className="trade-ideas-list__empty">{emptyMsg}</p>
            ) : (
                <div key={tab} className="shock-feed__body">
                    {showOpps
                        ? groupedOpps.map(g => (
                            <OpportunityRow key={g.ticker} group={g} onBuild={onBuild} />
                        ))
                        : groupedSignals.map(g => (
                            <SignalRow key={g.ticker} group={g} />
                        ))
                    }
                </div>
            )}
        </div>
    )
}

ShockFeed.propTypes = {
    signals:       PropTypes.array,
    opportunities: PropTypes.array,
    loading:       PropTypes.bool,
    onBuild:       PropTypes.func,
}
ShockFeed.defaultProps = { signals: [], opportunities: [] }
