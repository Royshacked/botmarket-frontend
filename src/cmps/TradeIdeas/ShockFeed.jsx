import { useState } from 'react'
import PropTypes from 'prop-types'
import { OpportunityRow, SignalRow } from './ShockFeedCard.jsx'
import './ShockFeed.scss'

// Maps macro channel_id → economic dimension.
// Event channels carry their dimension directly in the document.
const CHANNEL_DIMENSION = {
    // what the channel does to this company's production cost
    energy_cost:                'price_effect',
    commodity_metals:           'price_effect',
    commodity_agriculture:      'price_effect',
    // what it costs to produce / deliver
    freight_logistics:          'input_cost',
    input_scarcity:             'input_cost',
    labor_cost:                 'input_cost',
    supply_chain_concentration: 'input_cost',
    trade_tariffs:              'input_cost',
    demographic_labor:          'input_cost',
    // demand-side revenue
    end_demand:                 'revenue',
    consumer_credit:            'revenue',
    housing_construction:       'revenue',
    fiscal_impulse:             'revenue',
    // cost of capital
    policy_rate_expectations:   'financing',
    discount_rate:              'financing',
    risk_premium:               'financing',
    credit_access:              'financing',
    // macro risk
    geopolitical_risk:          'risk',
    regulatory_policy:          'risk',
    // fx and tech
    fx_usd:                     'fx',
    tech_diffusion:             'tech',
    corporate_capex:            'tech',
}

// Collapse multiple signals for the same (ticker, channel_id) into one conclusion
// using a weighted directional vote across news sources.
//
// net = Σ(conf × +1 for long, -1 for short)
// direction  = sign(net)
// confidence = |net| / n   — agreement of n sources; disagreement deflates it
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

// Three-pass grouping:
//   Pass 1 — tag each item with its economic dimension
//   Pass 2 — aggregate all (ticker, channel_id) duplicates → one conclusion per channel
//   Pass 3 — group by ticker; collect per-dimension summaries; detect cross-dimension conflict
export function groupByTicker(items) {
    // Pass 1 — assign dimension
    const withDim = items.map(item => ({
        ...item,
        dimension: item.dimension ?? CHANNEL_DIMENSION[item.channel_id] ?? 'other',
    }))

    // Pass 2 — aggregate per (ticker, channel_id)
    const chMap = new Map()
    for (const item of withDim) {
        const key = `${item.ticker}:${item.channel_id}`
        if (!chMap.has(key)) chMap.set(key, [])
        chMap.get(key).push(item)
    }
    const aggregated = [...chMap.values()].map(aggregateChannel)

    // Pass 3 — group by ticker + build dimension map
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
                dimensions:       {},   // { dim → { direction, conf, lag_min, lag_max, channels[] } }
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

        // Accumulate dimension entry
        const dim = item.dimension
        if (!g.dimensions[dim]) {
            g.dimensions[dim] = {
                direction: item.ticker_direction,
                conf:      item.confidence_llm,
                lag_min:   item.lag_weeks_min,
                lag_max:   item.lag_weeks_max,
                channels:  [],
            }
        }
        const d = g.dimensions[dim]
        d.channels.push(item)
        if (item.confidence_llm > d.conf) {
            d.conf      = item.confidence_llm
            d.direction = item.ticker_direction
        }
        d.lag_min = Math.min(d.lag_min, item.lag_weeks_min)
        d.lag_max = Math.max(d.lag_max, item.lag_weeks_max)
    }

    // Synthesize per-ticker verdict; detect conflict; build timeframe split
    for (const g of tickerMap.values()) {
        g.channels.sort((a, b) => b.confidence_llm - a.confidence_llm)

        const dimEntries = Object.entries(g.dimensions)

        // Mixed = at least one dim says long AND at least one says short
        const dirs = new Set(dimEntries.map(([, d]) => d.direction))
        g.mixed = dirs.has('long') && dirs.has('short')

        if (g.mixed) {
            // Near-term: dimensions whose window is entirely ≤ 4 weeks
            const near = dimEntries
                .filter(([, d]) => d.lag_max <= 4)
                .sort((a, b) => b[1].conf - a[1].conf)
            // Medium-term: dimensions whose window starts after 4 weeks
            const mid = dimEntries
                .filter(([, d]) => d.lag_min > 4)
                .sort((a, b) => b[1].conf - a[1].conf)
            g.near_term   = near.length ? { dim: near[0][0], ...near[0][1] } : null
            g.medium_term = mid.length  ? { dim: mid[0][0],  ...mid[0][1] }  : null
        }
    }

    return [...tickerMap.values()].sort((a, b) => b.confidence_llm - a.confidence_llm)
}

export function ShockFeed({ signals, opportunities, loading, onBuild }) {
    const [tab, setTab] = useState('opportunities')
    const showOpps = tab === 'opportunities'

    // One item open at a time, per tab — independent so switching tabs preserves each side's state.
    const [openKeyOpp, setOpenKeyOpp] = useState(null)
    const [openKeySig, setOpenKeySig] = useState(null)
    const toggleOpp = key => setOpenKeyOpp(cur => cur === key ? null : key)
    const toggleSig = key => setOpenKeySig(cur => cur === key ? null : key)

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
                        <span className="shock-feed__tab-count">({groupedOpps.length})</span>
                    )}
                </button>
                <button
                    className={`shock-feed__tab${!showOpps ? ' shock-feed__tab--active' : ''}`}
                    onClick={() => setTab('signals')}
                >
                    Signals
                    {groupedSignals.length > 0 && (
                        <span className="shock-feed__tab-count">({groupedSignals.length})</span>
                    )}
                </button>
            </div>

            {isEmpty ? (
                <p className="trade-ideas-list__empty">{emptyMsg}</p>
            ) : (
                <div key={tab} className="shock-feed__body">
                    {showOpps
                        ? groupedOpps.map(g => (
                            <OpportunityRow
                                key={g.ticker}
                                group={g}
                                onBuild={onBuild}
                                open={openKeyOpp === g.ticker}
                                folded={openKeyOpp !== null && openKeyOpp !== g.ticker}
                                onToggle={() => toggleOpp(g.ticker)}
                            />
                        ))
                        : groupedSignals.map(g => (
                            <SignalRow
                                key={g.ticker}
                                group={g}
                                open={openKeySig === g.ticker}
                                folded={openKeySig !== null && openKeySig !== g.ticker}
                                onToggle={() => toggleSig(g.ticker)}
                            />
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
