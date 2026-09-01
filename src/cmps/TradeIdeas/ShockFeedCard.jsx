import PropTypes from 'prop-types'
import { RowHost } from '../Floor/RowHost.jsx'
import './ShockFeed.scss'

// Compact floor-row renderers for the Shocks desk — matches the Coverage row style.
// OpportunityRow: ticker-level, FRED-confirmed.
// SignalRow:      channel-level, provisional (news-driven, pre-validation).

const DIR_LABEL  = { up: 'long', down: 'short', neutral: 'neutral' }
const DIR_RATING = { up: 'buy',  down: 'sell' }

export function OpportunityRow({ opportunity: opp, onBuild }) {
    const lagStr    = opp.lag_weeks_min === opp.lag_weeks_max
        ? `${opp.lag_weeks_min}w`
        : `${opp.lag_weeks_min}-${opp.lag_weeks_max}w`
    const dirLabel  = DIR_LABEL[opp.ticker_direction]  ?? opp.ticker_direction
    const dirRating = DIR_RATING[opp.ticker_direction] ?? 'hold'

    const buildBtn = onBuild ? (
        <button
            className="shock-feed__build-btn"
            onClick={e => { e.stopPropagation(); onBuild(opp) }}
            title={opp.agent === 'atlas' ? 'Build portfolio with Atlas' : 'Build trade with Mentor'}
        >
            Build
        </button>
    ) : null

    return (
        <div className="floor-sub">
            <RowHost actions={buildBtn}>
                <button className="floor-row floor-row--static">
                    <span className="floor-row__sym">{opp.ticker}</span>
                    {dirLabel && (
                        <span className={`floor-row__rating floor-row__rating--${dirRating}`}>
                            {dirLabel}
                        </span>
                    )}
                    <span className="floor-row__kind">
                        {opp.channel_id?.replace(/_/g, ' ')}
                    </span>
                    <span className="floor-row__status">{lagStr}</span>
                </button>
            </RowHost>
        </div>
    )
}
OpportunityRow.propTypes = {
    opportunity: PropTypes.object.isRequired,
    onBuild:     PropTypes.func,
}

export function SignalRow({ signal }) {
    const lagStr    = signal.lag_weeks_min === signal.lag_weeks_max
        ? `${signal.lag_weeks_min}w`
        : `${signal.lag_weeks_min}-${signal.lag_weeks_max}w`
    const dirRating = DIR_RATING[signal.direction] ?? 'hold'
    const dirLabel  = DIR_LABEL[signal.direction]  ?? signal.direction

    // Signals are channel-level — no ticker. Channel name occupies the elastic `kind` column;
    // magnitude rides in the status slot so the layout mirrors opportunity rows.
    return (
        <div className="floor-sub">
            <button className="floor-row floor-row--static">
                <span className="floor-row__kind">
                    {signal.channel_id?.replace(/_/g, ' ')}
                </span>
                {dirLabel && (
                    <span className={`floor-row__rating floor-row__rating--${dirRating}`}>
                        {dirLabel}
                    </span>
                )}
                <span className="floor-row__status">{signal.magnitude} · {lagStr}</span>
            </button>
        </div>
    )
}
SignalRow.propTypes = { signal: PropTypes.object.isRequired }
