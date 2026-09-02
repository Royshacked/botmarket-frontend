import PropTypes from 'prop-types'
import { RowHost } from '../Floor/RowHost.jsx'
import './ShockFeed.scss'

// Compact floor-row renderers for the Shocks desk.
// Each row is ONE ticker — multiple channels/events that affect the same ticker
// are merged into a single row with an expandable detail drawer.
// When channels disagree across economic dimensions (e.g. energy_cost says SHORT
// but a supply-access deal says LONG), the row shows "mixed" and the drawer splits
// the breakdown by timeframe (near-term ≤4w vs medium-term >4w).

const TICK_RATING = { long: 'buy', short: 'sell', mixed: 'hold' }

// Human-readable label per dimension key
const DIM_LABEL = {
    price_effect:  'price effect',
    input_cost:    'input cost',
    supply_access: 'supply access',
    revenue:       'revenue',
    financing:     'financing',
    risk:          'risk',
    competitive:   'competitive',
    fx:            'FX',
    tech:          'tech',
    other:         'other',
}

const Chev = ({ open }) => (
    <svg
        className={`floor-row__chev${open ? ' floor-row__chev--open' : ''}`}
        viewBox="0 0 16 16" fill="none" aria-hidden="true"
    >
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
)
Chev.propTypes = { open: PropTypes.bool }

// ── Shared helpers ────────────────────────────────────────────────────────────

function _lagStr(min, max) {
    return min === max ? `${min}w` : `${min}-${max}w`
}

// Per-channel detail block — shared by both row types
function ChannelBlock({ ch }) {
    const isEvent = ch.source_type === 'event'
    const label = isEvent
        ? (ch.event_type ?? 'EVENT')
        : ch.channel_id?.replace(/_/g, ' ')
    const dimLabel = ch.dimension ? (DIM_LABEL[ch.dimension] ?? ch.dimension) : null

    return (
        <div className="floor-detail__block">
            <span className="floor-detail__label">
                {isEvent && <span className="shock-feed__event-badge">EVENT</span>}
                {label}
                {dimLabel && ` · ${dimLabel}`}
                {' · '}{ch.ticker_direction}
                {' · '}{_lagStr(ch.lag_weeks_min, ch.lag_weeks_max)}
                {' · conf '}{(ch.confidence_llm ?? 0).toFixed(2)}
                {ch.source_count > 1 && ` · ${ch.source_count} sources`}
                {ch.dollar_amount && ` · $${ch.dollar_amount.toFixed(1)}B`}
            </span>
            {ch.company_context     && <p className="floor-detail__company">{ch.company_context}</p>}
            {ch.direction_rationale && <p className="floor-detail__direction">{ch.direction_rationale}</p>}
            {ch.lag_explanation     && <p className="floor-detail__lag">{ch.lag_explanation}</p>}
            {ch.why       && <p className="floor-detail__prose">{ch.why}</p>}
            {ch.when      && <p className="floor-detail__prose">{ch.when}</p>}
            {ch.evidence  && !ch.why && <p className="floor-detail__prose">{ch.evidence}</p>}
            {ch.thesis    && <p className="floor-detail__prose">{ch.thesis}</p>}
            {ch.risk_note && <p className="floor-detail__prose shock-feed__risk">{ch.risk_note}</p>}
        </div>
    )
}
ChannelBlock.propTypes = { ch: PropTypes.object.isRequired }

// Mixed-verdict summary shown at the top of the detail drawer
function MixedSummary({ group }) {
    if (!group.mixed) return null
    const { near_term: near, medium_term: mid } = group
    if (!near && !mid) return null   // all signals span the 4w boundary — no clean split
    return (
        <div className="floor-detail__block shock-feed__mixed-summary">
            {near && (
                <span className={`shock-feed__timeframe shock-feed__timeframe--${TICK_RATING[near.direction] ?? 'hold'}`}>
                    0–4w · {near.direction} · {DIM_LABEL[near.dim] ?? near.dim}
                </span>
            )}
            {near && mid && <span className="shock-feed__timeframe-sep"> / </span>}
            {mid && (
                <span className={`shock-feed__timeframe shock-feed__timeframe--${TICK_RATING[mid.direction] ?? 'hold'}`}>
                    4+w · {mid.direction} · {DIM_LABEL[mid.dim] ?? mid.dim}
                </span>
            )}
        </div>
    )
}
MixedSummary.propTypes = { group: PropTypes.object.isRequired }

// ── Opportunity row (ticker-level, FRED-confirmed + event-sourced) ────────────

export function OpportunityRow({ group, onBuild, open, folded, onToggle }) {
    const primary    = group.channels[0]
    const nCh        = group.channels.length
    const dirLabel   = group.mixed ? 'mixed' : group.ticker_direction
    const rating     = TICK_RATING[dirLabel] ?? 'hold'
    const companyName = primary?.company_name ?? null

    const buildBtn = onBuild ? (
        <button
            className="shock-feed__build-btn"
            onClick={e => { e.stopPropagation(); onBuild(primary) }}
            title={group.agent === 'atlas' ? 'Build portfolio with Atlas' : 'Build trade with Mentor'}
        >
            Build
        </button>
    ) : null

    return (
        <div className={`floor-sub${open ? ' floor-sub--open' : folded ? ' floor-sub--folded' : ''}`}>
            <RowHost actions={buildBtn}>
                <button
                    className="floor-row"
                    onClick={onToggle}
                    aria-expanded={open}
                >
                    <Chev open={open} />
                    <span className="floor-row__sym">
                        {group.ticker}
                        {companyName && <span className="floor-row__company-name">{companyName}</span>}
                    </span>
                    <span className={`floor-row__rating floor-row__rating--${rating}`}>
                        {dirLabel}
                    </span>
                    <span className="floor-row__kind floor-row__kind--dim">
                        {nCh === 1 ? primary.channel_id?.replace(/_/g, ' ') : ''}
                    </span>
                    {nCh > 1 && <span className="floor-row__count">({nCh} signals)</span>}
                    <span className="floor-row__status">
                        {_lagStr(group.lag_weeks_min, group.lag_weeks_max)}
                    </span>
                </button>
            </RowHost>

            {open && (
                <div className="floor-sub__body">
                    <div className="floor-detail">
                        <MixedSummary group={group} />
                        {group.channels.map((ch, i) => (
                            <ChannelBlock key={`${ch.channel_id}:${i}`} ch={ch} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
OpportunityRow.propTypes = {
    group:    PropTypes.object.isRequired,
    onBuild:  PropTypes.func,
    open:     PropTypes.bool,
    folded:   PropTypes.bool,
    onToggle: PropTypes.func,
}

// ── Signal row (ticker-level, provisional — news-driven, not FRED-confirmed) ──

export function SignalRow({ group, open, folded, onToggle }) {
    const primary     = group.channels[0]
    const nCh         = group.channels.length
    const dirLabel    = group.mixed ? 'mixed' : group.ticker_direction
    const rating      = TICK_RATING[dirLabel] ?? 'hold'
    const companyName = primary?.company_name ?? null

    return (
        <div className={`floor-sub${open ? ' floor-sub--open' : folded ? ' floor-sub--folded' : ''}`}>
            <button
                className="floor-row"
                onClick={onToggle}
                aria-expanded={open}
            >
                <Chev open={open} />
                <span className="floor-row__sym">
                    {group.ticker}
                    {companyName && <span className="floor-row__company-name">{companyName}</span>}
                </span>
                <span className={`floor-row__rating floor-row__rating--${rating}`}>
                    {dirLabel}
                </span>
                <span className="floor-row__kind floor-row__kind--dim">
                    {nCh === 1 ? primary.channel_id?.replace(/_/g, ' ') : ''}
                </span>
                {nCh > 1 && <span className="floor-row__count">({nCh} signals)</span>}
                <span className="floor-row__status">
                    {_lagStr(group.lag_weeks_min, group.lag_weeks_max)}
                </span>
            </button>

            {open && (
                <div className="floor-sub__body">
                    <div className="floor-detail">
                        <MixedSummary group={group} />
                        {group.channels.map((ch, i) => (
                            <ChannelBlock key={`${ch.channel_id}:${i}`} ch={ch} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
SignalRow.propTypes = {
    group:    PropTypes.object.isRequired,
    open:     PropTypes.bool,
    folded:   PropTypes.bool,
    onToggle: PropTypes.func,
}
