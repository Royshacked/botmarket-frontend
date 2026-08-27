import PropTypes from 'prop-types'
import './StatusIcon.scss'

// ── Status icons ──────────────────────────────────────────────────────────────
// Inline monoline icons matching the title-icon style used across the app:
// single colour via currentColor, ~1.5 stroke, round caps/joins. The status
// colour comes from .status-icon--{status} in StatusIcon.scss, so each icon reads
// correctly in any context (row badge, card, dialog). Iconography is preserved:
//   waiting → hourglass · looking → radar · hit → bullseye · long/short → trend
//   arrows · resting → resting order ticket on a level · closed → finish flag.

const SHAPES = {
    // hourglass
    waiting: (
        <>
            <path d="M4 2.5h8M4 13.5h8" />
            <path d="M5 2.5c0 4 3 5 3 5.5s-3 1.5-3 5.5" />
            <path d="M11 2.5c0 4-3 5-3 5.5s3 1.5 3 5.5" />
            <path d="M6 13c0-2 2-2.6 2-2.6s2 .6 2 2.6z" fill="currentColor" stroke="none" />
        </>
    ),
    // radar sweep
    looking: (
        <>
            <circle cx="8" cy="8" r="6" />
            <circle cx="8" cy="8" r="3" />
            <line className="radar-sweep" x1="8" y1="8" x2="12.2" y2="3.8" />
            <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
        </>
    ),
    // bullseye + crosshair
    hit: (
        <>
            <circle cx="8" cy="8" r="6" />
            <circle cx="8" cy="8" r="3" />
            <path d="M8 .5V2M8 14v1.5M.5 8H2M14 8h1.5" />
            <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
        </>
    ),
    // trend up
    long: (
        <>
            <path d="M2 11l4-4 3 2 5-5" />
            <path d="M10.5 4H14v3.5" />
        </>
    ),
    // trend down
    short: (
        <>
            <path d="M2 5l4 4 3-2 5 5" />
            <path d="M10.5 12H14V8.5" />
        </>
    ),
    // resting order ticket hanging on a price level
    resting: (
        <>
            <line x1="1.5" y1="11.5" x2="14.5" y2="11.5" strokeDasharray="2.4 2" />
            <rect x="5" y="3" width="6" height="5" rx="1.2" />
            <line x1="8" y1="8" x2="8" y2="11.5" />
            <circle cx="8" cy="11.5" r="1" fill="currentColor" stroke="none" />
        </>
    ),
    // finish (checkered) flag
    closed: (
        <>
            <path d="M3.5 2v12" />
            <path d="M3.5 3h9v6h-9" />
            <rect x="3.5" y="3" width="3" height="3" fill="currentColor" stroke="none" />
            <rect x="9.5" y="3" width="3" height="3" fill="currentColor" stroke="none" />
            <rect x="6.5" y="6" width="3" height="3" fill="currentColor" stroke="none" />
        </>
    ),
}

/**
 * Renders the status as an icon-only badge. The status word is preserved in the
 * accessible label / hover title. Statuses without an icon (e.g. 'building')
 * gracefully fall back to their text label so nothing disappears.
 */
export function StatusIcon({ status, size = 16, className = '' }) {
    const shape = SHAPES[status]
    if (!shape) return <span className={`status-icon-fallback ${className}`.trim()}>{status}</span>

    return (
        <svg
            className={`status-icon status-icon--${status} ${className}`.trim()}
            width={size}
            height={size}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label={status}
            xmlns="http://www.w3.org/2000/svg"
        >
            <title>{status}</title>
            {shape}
        </svg>
    )
}

StatusIcon.propTypes = {
    status:    PropTypes.string,
    size:      PropTypes.number,
    className: PropTypes.string,
}
