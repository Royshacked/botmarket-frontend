import PropTypes from 'prop-types'
import waiting from '../assets/icons/status/waiting.svg'
import looking from '../assets/icons/status/looking.svg'
import hit     from '../assets/icons/status/hit.svg'
import long    from '../assets/icons/status/long.svg'
import short   from '../assets/icons/status/short.svg'
import resting from '../assets/icons/status/resting.svg'
import closed  from '../assets/icons/status/closed.svg'
import './StatusIcon.scss'

const ICONS = { waiting, looking, hit, long, short, resting, closed }

/**
 * Renders the status as an icon-only badge. The status word is preserved in the
 * `title`/`alt` for accessibility and hover. Statuses without an icon (e.g.
 * 'building') gracefully fall back to their text label so nothing disappears.
 */
export function StatusIcon({ status, size = 16, className = '' }) {
    const src = ICONS[status]
    if (!src) return <span className={`status-icon-fallback ${className}`.trim()}>{status}</span>

    return (
        <img
            src={src}
            width={size}
            height={size}
            alt={status}
            title={status}
            draggable={false}
            className={`status-icon status-icon--${status} ${className}`.trim()}
        />
    )
}

StatusIcon.propTypes = {
    status:    PropTypes.string,
    size:      PropTypes.number,
    className: PropTypes.string,
}
