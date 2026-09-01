import { useState } from 'react'
import PropTypes from 'prop-types'
import { OpportunityRow, SignalRow } from './ShockFeedCard.jsx'
import './ShockFeed.scss'

// Collapse multiple signals for the same (ticker, channel_id) into one conclusion
// using a weighted directional vote across news sources.
//
// net = Σ(conf × +1 for long, -1 for short)
// direction  = sign(net)
// confidence = |net| / n   — agreement of n sources; disagreement deflates it
// lag        = confidence-weighted average midpoint of all sources' lag ranges
//              (all signals for the same channel share the same clock-based lag range,
//              so this is effectively the channel's canonical window)
function aggregateChannel(signals) {
    const n = signals.length
    if (n === 1) return { ...signals[0], source_count: 1 }

    let net  = 0
    let wLag = 0
    let wSum = 0

    for (const sig of signals) {
        const sign = sig.ticker_direction === 'long' ? 1 : sig.ticker_direction === 'short' ? -1 : 0
        net  += sig.confidence_llm * sign
        const mid = (sig.lag_weeks_min + sig.lag_weeks_max) / 2
        wLag += sig.confidence_llm * mid
        wSum += sig.confidence_llm
    }

    const direction  = net >= 0 ? 'long' : 'short'
    const confidence = Math.round(Math.min(Math.abs(net) / n, 0.90) * 100) / 100

    // Representative signal — highest single-source confidence, used for thesis/why text
    const rep = signals.reduce((best, s) => s.confidence_llm > best.confidence_llm ? s : best, signals[0])

    return {
        ...rep,
        ticker_direction: direction,
        confidence_llm:   confidence,
        source_count:     n,
    }
}

// Two-pass grouping:
//   Pass 1 — aggregate all (ticker, channel_id) duplicates into one conclusion per channel
//   Pass 2 — group the per-channel conclusions by ticker
function groupByTicker(items) {
    // Pass 1
    const chMap = new Map()
    for (const item of items) {
        const key = `${item.ticker}:${item.channel_id}`
        if (!chMap.has(key)) chMap.set(key, [])
        chMap.get(key).push(item)
    }
    const aggregated = [...chMap.values()].map(aggregateChannel)

    // Pass 2
    const tickerMap = new Map()
    for (const item of aggregated) {
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
