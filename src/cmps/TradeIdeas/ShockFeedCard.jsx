import { useState } from 'react'
import PropTypes from 'prop-types'
import { RowHost } from '../Floor/RowHost.jsx'
import './ShockFeed.scss'

// Compact floor-row renderers for the Shocks desk.
// Each row is ONE ticker — multiple channels that affect the same ticker are merged
// into a single row with an expandable detail drawer listing the per-channel breakdown.

const DIR_LABEL  = { long: 'long', short: 'short', neutral: 'neutral', up: 'long', down: 'short' }
const DIR_RATING = { long: 'sell', short: 'sell', up: 'buy', down: 'sell' }

// Correct rating class: long → buy colour, short → sell colour.
const TICK_RATING = { long: 'buy', short: 'sell' }

const Chev = ({ open }) => (
    <svg
        className={`floor-row__chev${open ? ' floor-row__chev--open' : ''}`}
        viewBox="0 0 16 16" fill="none" aria-hidden="true"
    >
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
)
Chev.propTypes = { open: PropTypes.bool }

// ── Opportunity row (ticker-level, FRED-confirmed) ────────────────────────────

export function OpportunityRow({ group, onBuild }) {
    const [open, setOpen] = useState(false)
    const hasMulti = group.channels.length > 1

    const lagStr    = group.lag_weeks_min === group.lag_weeks_max
        ? `${group.lag_weeks_min}w`
        : `${group.lag_weeks_min}-${group.lag_weeks_max}w`
    const dirLabel  = group.ticker_direction
    const dirRating = TICK_RATING[group.ticker_direction] ?? 'hold'

    const primary  = group.channels[0]
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
        <div className="floor-sub">
            <RowHost actions={buildBtn}>
                <button
                    className={`floor-row${hasMulti ? '' : ' floor-row--static'}`}
                    onClick={hasMulti ? () => setOpen(o => !o) : undefined}
                    aria-expanded={hasMulti ? open : undefined}
                >
                    {hasMulti && <Chev open={open} />}
                    <span className="floor-row__sym">{group.ticker}</span>
                    {dirLabel && (
                        <span className={`floor-row__rating floor-row__rating--${dirRating}`}>
                            {dirLabel}
                        </span>
                    )}
                    <span className="floor-row__kind">
                        {hasMulti
                            ? `${group.channels.length} channels`
                            : primary.channel_id?.replace(/_/g, ' ')}
                    </span>
                    <span className="floor-row__status">{lagStr}</span>
                </button>
            </RowHost>

            {open && (
                <div className="floor-detail">
                    {group.channels.map(ch => {
                        const chLag = ch.lag_weeks_min === ch.lag_weeks_max
                            ? `${ch.lag_weeks_min}w`
                            : `${ch.lag_weeks_min}-${ch.lag_weeks_max}w`
                        return (
                            <div key={ch.channel_id} className="floor-detail__block">
                                <span className="floor-detail__label">
                                    {ch.channel_id?.replace(/_/g, ' ')}
                                    {' · '}{ch.ticker_direction}
                                    {' · '}{chLag}
                                    {' · conf '}{(ch.confidence_llm ?? 0).toFixed(2)}
                                    {ch.source_count > 1 && ` · ${ch.source_count} sources`}
                                </span>
                                {ch.why       && <p className="floor-detail__prose">{ch.why}</p>}
                                {ch.when      && <p className="floor-detail__prose">{ch.when}</p>}
                                {ch.risk_note && <p className="floor-detail__prose shock-feed__risk">{ch.risk_note}</p>}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
OpportunityRow.propTypes = {
    group:   PropTypes.object.isRequired,
    onBuild: PropTypes.func,
}

// ── Signal row (ticker-level, provisional — news-driven, not FRED-confirmed) ──

export function SignalRow({ group }) {
    const [open, setOpen] = useState(false)
    const hasMulti = group.channels.length > 1

    const lagStr    = group.lag_weeks_min === group.lag_weeks_max
        ? `${group.lag_weeks_min}w`
        : `${group.lag_weeks_min}-${group.lag_weeks_max}w`
    const dirLabel  = group.ticker_direction
    const dirRating = TICK_RATING[group.ticker_direction] ?? 'hold'
    const primary   = group.channels[0]

    return (
        <div className="floor-sub">
            <button
                className={`floor-row${hasMulti ? '' : ' floor-row--static'}`}
                onClick={hasMulti ? () => setOpen(o => !o) : undefined}
                aria-expanded={hasMulti ? open : undefined}
            >
                {hasMulti && <Chev open={open} />}
                <span className="floor-row__sym">{group.ticker}</span>
                {dirLabel && (
                    <span className={`floor-row__rating floor-row__rating--${dirRating}`}>
                        {dirLabel}
                    </span>
                )}
                <span className="floor-row__kind">
                    {hasMulti
                        ? `${group.channels.length} channels`
                        : primary.channel_id?.replace(/_/g, ' ')}
                </span>
                <span className="floor-row__status">{lagStr}</span>
            </button>

            {open && (
                <div className="floor-detail">
                    {group.channels.map(ch => {
                        const chLag = ch.lag_weeks_min === ch.lag_weeks_max
                            ? `${ch.lag_weeks_min}w`
                            : `${ch.lag_weeks_min}-${ch.lag_weeks_max}w`
                        return (
                            <div key={ch.channel_id} className="floor-detail__block">
                                <span className="floor-detail__label">
                                    {ch.channel_id?.replace(/_/g, ' ')}
                                    {' · '}{ch.ticker_direction}
                                    {' · '}{chLag}
                                    {' · conf '}{(ch.confidence_llm ?? 0).toFixed(2)}
                                    {ch.source_count > 1 && ` · ${ch.source_count} sources`}
                                </span>
                                {ch.thesis && <p className="floor-detail__prose">{ch.thesis}</p>}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
SignalRow.propTypes = { group: PropTypes.object.isRequired }
