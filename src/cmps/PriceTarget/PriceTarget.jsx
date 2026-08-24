import PropTypes from 'prop-types'
import './PriceTarget.scss'

// The Analyst's price target wherever it is listed: the number, the HORIZON it has to arrive by, and
// the gap to the Street. Three surfaces render that same triple — the Prometheus coverage draft
// (AnalystPanel), the coverage book (Radar) and the Floor's coverage rows — and as three copies they
// had already drifted: only two ever showed the horizon, and the gap's direction colour was spelled
// two different ways.
//
// SHARED here is the mechanism — read the pair, sign the percentage, colour it by direction. Each host
// still owns its own judgment and its own look: `label` (the Floor's column already reads as targets,
// so it passes null), `gapSource` (the draft has room to spell out "vs Street"), and all position,
// size and palette, adjusted from the host's own block. Renders nothing without a number.
export function PriceTarget({ priceTarget, gap = null, label = 'PT', gapSource = false }) {
    const value = priceTarget?.value
    if (value == null) return null
    const pct = gap?.pct

    return (
        <span className="price-target">
            {label ? `${label} ` : ''}{value}
            {/* The horizon is when the call gets GRADED — the coverage monitor reads a hit against it,
                so a target reached in the first quarter of its own window comes back as "too low"
                rather than as a win. Shown without one, a target reads as open-ended. */}
            {priceTarget.horizon && <span className="price-target__horizon"> / {priceTarget.horizon}</span>}
            {pct != null && (
                <span className={`price-target__gap price-target__gap--${pct >= 0 ? 'up' : 'down'}`}>
                    {' '}{pct >= 0 ? '+' : ''}{pct}%{gapSource ? ' vs Street' : ''}
                </span>
            )}
        </span>
    )
}

PriceTarget.propTypes = {
    priceTarget: PropTypes.shape({
        value:   PropTypes.number,
        horizon: PropTypes.string,
        basis:   PropTypes.string,
    }),
    // The whole Street distribution rides on the coverage doc; only the mean-relative `pct` is shown
    // here — `pctile` is the honest read of a variant view but needs more room than a row affords.
    gap:       PropTypes.shape({ pct: PropTypes.number }),
    label:     PropTypes.string,
    gapSource: PropTypes.bool,
}
