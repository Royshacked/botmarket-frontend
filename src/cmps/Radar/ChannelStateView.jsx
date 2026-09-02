import { useState } from 'react'
import PropTypes from 'prop-types'
import './ChannelStateView.scss'

// Aether's channel-state house view — current z-score per pressure channel, grouped by clock speed.
//
// Z-score reads: how many standard deviations above/below the trailing baseline is each channel now.
// A z > +1 means the channel is under active pressure; z < -1 means it is releasing pressure.
// Channels near 0 are quiet. That is the signal, not the direction of the underlying series.
//
// Clock grouping is hardcoded from channels.yaml — the taxonomy is the spec; it doesn't change
// between engine runs, so fetching it each time would save nothing and add a round-trip.
//
// Rendered in the Floor Lists rail under the Calendar group, beside Forecasts (Pythia's house view).
//
// Two modes — toggle shown only when predictedChannelState is available:
//   FRED      — published FRED z-scores from channel_state (default)
//   Predicted — news-adjusted z-scores between FRED releases, with Δ annotation per channel

const CLOCK_GROUPS = [
    {
        key:  'fast',
        label: 'Fast  (hours–days)',
        channels: [
            'energy_cost',
            'policy_rate_expectations',
            'discount_rate',
            'risk_premium',
            'fx_usd',
        ],
    },
    {
        key:  'medium',
        label: 'Medium  (weeks)',
        channels: [
            'geopolitical_risk',
            'credit_access',
            'freight_logistics',
            'consumer_credit',
            'supply_chain_concentration',
            'corporate_capex',
            'regulatory_policy',
            'input_scarcity',
        ],
    },
    {
        key:  'slow',
        label: 'Slow  (quarters)',
        channels: [
            'end_demand',
            'labor_cost',
            'commodity_metals',
            'commodity_agriculture',
            'housing_construction',
            'fiscal_impulse',
        ],
    },
    {
        key:  'provisional',
        label: 'Provisional',
        channels: [
            'demographic_labor',
            'trade_tariffs',
            'tech_diffusion',
        ],
    },
]

const CHANNEL_LABEL = {
    energy_cost:                  'Energy cost',
    policy_rate_expectations:     'Policy rate exp.',
    discount_rate:                'Discount rate',
    risk_premium:                 'Risk premium',
    fx_usd:                       'USD strength',
    geopolitical_risk:            'Geopolitical risk',
    credit_access:                'Credit access',
    freight_logistics:            'Freight / logistics',
    consumer_credit:              'Consumer credit',
    supply_chain_concentration:   'Supply chain conc.',
    corporate_capex:              'Corporate capex',
    regulatory_policy:            'Regulatory policy',
    input_scarcity:               'Input scarcity',
    end_demand:                   'End demand',
    labor_cost:                   'Labour cost',
    commodity_metals:             'Metals',
    commodity_agriculture:        'Agriculture',
    housing_construction:         'Housing / construction',
    fiscal_impulse:               'Fiscal impulse',
    demographic_labor:            'Demographic labour',
    trade_tariffs:                'Trade tariffs',
    tech_diffusion:               'Tech diffusion',
}

// Tone class for z-score colouring. Thresholds: ±1.0 strong, ±0.4 mild, else flat.
function _tone(z) {
    if (z === null || z === undefined || !Number.isFinite(z)) return 'none'
    if (z >  1.0) return 'hi-pos'
    if (z >  0.4) return 'lo-pos'
    if (z < -1.0) return 'hi-neg'
    if (z < -0.4) return 'lo-neg'
    return 'flat'
}

// Bar width: 0–50% either side of centre. Cap at |z| = 2.5 (99th pct) so extreme values
// don't shove the bar off-screen.
function _barWidth(z) {
    if (!Number.isFinite(z)) return 0
    return Math.min(Math.abs(z) / 2.5, 1) * 50
}

function _date(iso) {
    if (!iso) return null
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

function ChannelRow({ id, z, delta = null }) {
    const label    = CHANNEL_LABEL[id] ?? id.replace(/_/g, ' ')
    const tone     = _tone(z)
    const width    = _barWidth(z)
    const pos      = z !== null && z !== undefined && z >= 0
    const hasDelta = delta !== null && Number.isFinite(delta) && delta !== 0

    return (
        <div className="ch-view__row">
            <span className="ch-view__name">
                {label}
                {hasDelta && (
                    <span className="ch-view__delta">
                        {' '}Δ{delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                    </span>
                )}
            </span>
            <div className="ch-view__bar-track">
                {/* Bar grows from the centre toward the relevant side */}
                {Number.isFinite(z) && (
                    <span
                        className={`ch-view__bar ch-view__bar--${tone}`}
                        style={{ width: `${width}%`, [pos ? 'left' : 'right']: '50%' }}
                    />
                )}
                <span className="ch-view__midline" />
            </div>
            <span className={`ch-view__z ch-view__z--${tone}`}>
                {z !== null && z !== undefined && Number.isFinite(z)
                    ? `${z >= 0 ? '+' : ''}${z.toFixed(2)}`
                    : '—'}
            </span>
        </div>
    )
}
ChannelRow.propTypes = { id: PropTypes.string.isRequired, z: PropTypes.number, delta: PropTypes.number }

export function ChannelStateView({ channelState = null, predictedChannelState = null, loading = false }) {
    const [view, setView] = useState('fred')
    const showPredicted = view === 'predicted' && predictedChannelState !== null

    if (loading) return <div className="news-feed__loader"><span /><span /><span /></div>

    if (!channelState && !predictedChannelState) {
        return (
            <p className="news-feed__empty">
                Channel state not yet available. The Aether engine writes here after Phase 1 runs.
            </p>
        )
    }

    const channels = showPredicted
        ? (predictedChannelState.channels ?? {})
        : (channelState?.channels ?? {})
    const deltas = showPredicted ? (predictedChannelState.news_delta_applied ?? {}) : {}
    const asOf   = showPredicted
        ? (predictedChannelState.run_date ?? null)
        : _date(channelState?.computed_at)

    return (
        <div className="ch-view">
            <div className="ch-view__header">
                {predictedChannelState && (
                    <div className="ch-view__toggle">
                        <button
                            className={`ch-view__toggle-btn${!showPredicted ? ' ch-view__toggle-btn--active' : ''}`}
                            onClick={() => setView('fred')}
                        >FRED</button>
                        <button
                            className={`ch-view__toggle-btn${showPredicted ? ' ch-view__toggle-btn--active' : ''}`}
                            onClick={() => setView('predicted')}
                        >Predicted</button>
                    </div>
                )}
                {!showPredicted && channelState?.regime_label && (
                    <span className="ch-view__regime">{channelState.regime_label}</span>
                )}
                {asOf && (
                    <span className="ch-view__asof">
                        {showPredicted ? `predicted · ${asOf}` : `computed ${asOf}`}
                    </span>
                )}
            </div>

            {CLOCK_GROUPS.map(group => {
                // Only show a group if at least one of its channels has data
                const withData = group.channels.filter(id => channels[id] !== undefined)
                if (!withData.length) return null
                return (
                    <div key={group.key} className="ch-view__group">
                        <div className="ch-view__group-label">{group.label}</div>
                        {withData.map(id => (
                            <ChannelRow
                                key={id}
                                id={id}
                                z={channels[id] ?? null}
                                delta={showPredicted ? (deltas[id] ?? null) : null}
                            />
                        ))}
                    </div>
                )
            })}

            <p className="ch-view__note">
                {showPredicted
                    ? `news-adjusted z · FRED anchor: ${predictedChannelState.fred_date ?? '—'} · Δ = news delta`
                    : 'z-score vs trailing regime baseline · |z| > 1 = active pressure'}
            </p>
        </div>
    )
}

ChannelStateView.propTypes = {
    channelState:          PropTypes.object,
    predictedChannelState: PropTypes.object,
    loading:               PropTypes.bool,
}
