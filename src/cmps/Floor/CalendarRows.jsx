import PropTypes from 'prop-types'
import { groupByDay } from './floor.utils.js'

// The dated feeds — earnings, Fed, IPO — as Floor rows.
//
// They were three TABS of one Calendar section in the left column; they are three DESKS in the
// right one now, each opening to the full column (2026-08-19). What that move made obvious is
// that the tabs were never the point: the day grouping and the date rule are the same mechanism
// for all three, and only the row differs. So the mechanism lives here once and each desk asks
// for it by kind, rather than three near-copies drifting apart in three desk bodies.
//
// The house forecast is NOT here. It is a board, not a dated list — it renders SectorView, and
// forcing it through groupByDay was only ever an artefact of sharing a tab strip with these three.

const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function fmtDay(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return iso
    const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    return `${wd} ${MONTHS[m - 1]} ${d}`
}

const EARN_WHEN = { bmo: 'Pre', amc: 'Post', dmh: 'Mid' }

/**
 * @param {'earnings'|'fed'|'ipo'} kind
 * @param {object[]} items
 * @param {Function} [onSelect]  row click — earnings and IPO hand the event back to build a setup
 *                               around it. Fed rows are not doorways: there is no ticker to trade.
 */
export function CalendarRows({ kind, items = [], loading = false, onSelect }) {
    if (loading && !items.length) return <p className="floor-empty">Loading…</p>
    if (!items.length) return <p className="floor-empty">Nothing scheduled.</p>

    return groupByDay(items).map(g => (
        <div key={g.date} className="floor-cal__day">
            <div className="floor-cal__date">{fmtDay(g.date)}</div>
            {g.items.map((e, i) => {
                if (kind === 'fed') {
                    return (
                        <div key={i} className="floor-cal__row" title={e.desc || ''}>
                            <span className="floor-cal__time">{e.time || ''}</span>
                            <span className="floor-cal__label">{e.event}</span>
                            <span className={`floor-cal__impact floor-cal__impact--${e.impact}`}>{e.impact}</span>
                        </div>
                    )
                }
                return (
                    <button
                        key={`${e.symbol || 'row'}-${i}`}
                        className="floor-cal__row floor-cal__row--btn"
                        onClick={() => onSelect?.(e)}
                        title={e.symbol ? `Build a setup around ${e.symbol}` : undefined}
                    >
                        <span className="floor-cal__sym">{e.symbol ?? '—'}</span>
                        <span className="floor-cal__label">{e.name ?? ''}</span>
                        {kind === 'earnings'
                            ? <span className="floor-cal__when">{EARN_WHEN[(e.time || '').toLowerCase()] ?? ''}</span>
                            : <span className="floor-cal__when">{e.price ? `$${e.price}` : ''}</span>}
                    </button>
                )
            })}
        </div>
    ))
}

CalendarRows.propTypes = {
    kind:     PropTypes.oneOf(['earnings', 'fed', 'ipo']).isRequired,
    items:    PropTypes.array,
    loading:  PropTypes.bool,
    onSelect: PropTypes.func,
}
