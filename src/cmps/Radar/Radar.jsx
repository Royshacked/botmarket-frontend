import PropTypes from 'prop-types'
import { BrandTitle } from '../BrandTitle.jsx'
import { ScanList } from './ScanList.jsx'
import { CoverageBook } from './CoverageBook.jsx'
import { RadarTicker } from './RadarTicker.jsx'
import './Radar.scss'

// Market-intelligence panel: Scans (scanner candidate lists), calendar events,
// and coverage book — surfaced under one "Axl Radar" brand. Styling is kept under
// the original `news-feed` CSS namespace.
export function Radar({
    tab = 'scans',
    // NB: no onTabChange — the tab BUTTONS live in TradeIdeasList, which calls
    // radar.onTabChange off the props object. Radar itself only renders the active tab.
    scans = [],
    scansLoading = false,
    onCandidateSelect,
    onDeleteScan,
    onEditScan,
    earnings = [],
    earningsFrom = null,
    earningsTo = null,
    earningsLoading = false,
    onEarningSelect,
    fed = [],
    fedLoading = false,
    ipo = [],
    ipoLoading = false,
    onIpoSelect,
    coverage = [],
    coverageLoading = false,
    onEditCoverage,
    onRetireCoverage,
    onDeleteCoverage,
}) {
    return (
        <div className="news-feed">
            <div className="news-feed__header">
                <div className="news-feed__header-top">
                    <svg className="news-feed__title-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        {/* Signal arcs */}
                        <path d="M4 10 Q4 4 10 4 Q16 4 16 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                        <path d="M6.5 10 Q6.5 6.5 10 6.5 Q13.5 6.5 13.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                        {/* Dot */}
                        <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
                        {/* Stand */}
                        <line x1="10" y1="11.5" x2="10" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="7"  y1="16"   x2="13" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span className="news-feed__title"><BrandTitle text="Axl Radar" /></span>
                </div>
            </div>

            {tab === 'scans' ? (
                <div className="news-feed__list">
                    <ScanList
                        scans={scans}
                        loading={scansLoading}
                        onCandidateSelect={onCandidateSelect}
                        onDelete={onDeleteScan}
                        onEditScan={onEditScan}
                    />
                </div>
            ) : tab === 'earnings' ? (
                <div className="news-feed__list">
                    <EarningsList items={earnings} from={earningsFrom} to={earningsTo} loading={earningsLoading} onSelect={onEarningSelect} />
                </div>
            ) : tab === 'fed' ? (
                <div className="news-feed__list">
                    <FedList items={fed} loading={fedLoading} />
                </div>
            ) : tab === 'ipo' ? (
                <div className="news-feed__list">
                    <IpoList items={ipo} loading={ipoLoading} onSelect={onIpoSelect} />
                </div>
            ) : tab === 'coverage' ? (
                <div className="news-feed__list">
                    <CoverageBook coverage={coverage} loading={coverageLoading} onEdit={onEditCoverage} onRetire={onRetireCoverage} onDelete={onDeleteCoverage} />
                </div>
            ) : null}
        </div>
    )
}

// Earnings for the current trading week (today→Fri, or the coming Mon–Fri on a
// weekend), grouped by day so each report's date is clear. Items arrive sorted
// soonest-first, so consecutive same-date rows group together.
function EarningsList({ items, from, to, loading, onSelect }) {
    if (loading) return <div className="news-feed__loader"><span /><span /><span /></div>
    if (!items.length) return <p className="news-feed__empty">No earnings scheduled{from ? ` for ${_fmtRange(from, to)}` : ''}.</p>

    const groups = []
    for (const e of items) {
        const last = groups[groups.length - 1]
        if (last && last.date === e.date) last.items.push(e)
        else groups.push({ date: e.date, items: [e] })
    }

    return (
        <div className="cal-list">
            <div className="earn-table">
                <div className="earn-table__head">
                    <span className="earn-table__th">Ticker</span>
                    <span className="earn-table__th">When</span>
                    <span className="earn-table__th earn-table__th--num">EPS</span>
                    <span className="earn-table__th earn-table__th--num">Rev</span>
                </div>
                {groups.map(g => (
                    <div key={g.date} className="earn-table__group">
                        <div className="earn-table__day">{_fmtFullDate(g.date)}</div>
                        {g.items.map((e, i) => (
                            <div key={e.symbol || i} className="earn-table__row">
                                <RadarTicker
                                    symbol={e.symbol}
                                    name={e.name}
                                    logo={e.logo}
                                    onSelect={() => onSelect?.(e)}
                                    title={e.symbol ? `Build a setup around ${e.symbol}'s earnings` : ''}
                                />
                                <span className={`earn-table__when earn-table__when--${_earnWhenClass(e.time)}`}>
                                    {_earnWhen(e.time)}
                                </span>
                                <span className="earn-table__num">{e.epsEstimated != null ? _fmt(e.epsEstimated) : '—'}</span>
                                <span className="earn-table__num">{e.revenueEstimated != null ? _money(e.revenueEstimated) : '—'}</span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}

// Finnhub reports session codes: bmo=before market open, amc=after market close,
// dmh=during market hours. Surface friendly labels + a class for badge coloring.
const _EARN_WHEN = { bmo: 'Pre', amc: 'Post', dmh: 'Mid' }
function _earnWhen(code) {
    if (!code) return '—'
    return _EARN_WHEN[code.toLowerCase()] || code.toUpperCase()
}
function _earnWhenClass(code) {
    const c = (code || '').toLowerCase()
    if (c === 'bmo') return 'pre'
    if (c === 'amc') return 'post'
    return 'other'
}

// Upcoming US macro / Fed events (FRED + FOMC schedule), grouped by day. Items
// arrive already sorted soonest-first, so we group consecutive same-date rows.
function FedList({ items, loading }) {
    if (loading) return <div className="news-feed__loader"><span /><span /><span /></div>
    if (!items.length) return <p className="news-feed__empty">No upcoming Fed events.</p>

    const groups = []
    for (const e of items) {
        const last = groups[groups.length - 1]
        if (last && last.date === e.date) last.events.push(e)
        else groups.push({ date: e.date, events: [e] })
    }

    return (
        <div className="cal-list">
            {groups.map(g => (
                <div key={g.date} className="fed-group">
                    <div className="cal-list__date-header">{_fmtFullDate(g.date)}</div>
                    {g.events.map((e, i) => (
                        <div
                            key={i}
                            className={`fed-row${e.kind === 'fomc' ? ' fed-row--fomc' : ''}`}
                            title={e.desc || ''}
                        >
                            {e.time && <span className="fed-row__time">{e.time}</span>}
                            <span className="fed-row__event">{e.event}</span>
                            <span className={`fed-row__impact fed-row__impact--${e.impact}`}>{e.impact}</span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}

// Upcoming IPOs (Finnhub), grouped by day. Items arrive sorted soonest-first.
function IpoList({ items, loading, onSelect }) {
    if (loading) return <div className="news-feed__loader"><span /><span /><span /></div>
    if (!items.length) return <p className="news-feed__empty">No upcoming IPOs.</p>

    const groups = []
    for (const e of items) {
        const last = groups[groups.length - 1]
        if (last && last.date === e.date) last.events.push(e)
        else groups.push({ date: e.date, events: [e] })
    }

    return (
        <div className="cal-list">
            {groups.map(g => (
                <div key={g.date} className="fed-group">
                    <div className="cal-list__date-header">{_fmtFullDate(g.date)}</div>
                    {g.events.map((e, i) => (
                        <div key={i} className="ipo-row" title={_ipoTooltip(e)}>
                            <RadarTicker
                                symbol={e.symbol}
                                name={e.name}
                                logo={e.logo}
                                onSelect={() => onSelect?.(e)}
                                title={e.symbol ? `Build a setup around ${e.symbol}'s IPO` : ''}
                            />
                            {e.price && <span className="ipo-row__price">${e.price}</span>}
                            {e.status && (
                                <span className={`ipo-row__status ipo-row__status--${_ipoStatusClass(e.status)}`}>{e.status}</span>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}

function _ipoStatusClass(s) {
    const t = (s || '').toLowerCase()
    if (['priced', 'expected', 'filed', 'withdrawn'].includes(t)) return t
    return 'other'
}

function _ipoTooltip(e) {
    const parts = []
    if (e.exchange) parts.push(e.exchange)
    if (e.shares)   parts.push(`${_compact(e.shares)} shares`)
    if (e.value)    parts.push(`${_money(e.value)} deal`)
    return parts.join(' · ')
}

function _compact(n) {
    const v = Number(n)
    if (!Number.isFinite(v)) return ''
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
    return String(v)
}


function _fmtDate(iso) {
    if (!iso) return ''
    const [, m, d] = iso.split('-')
    return `${_months[+m - 1]} ${+d}`
}

// "Jul 2 – Jul 6" for a week window; collapses to a single date when from === to.
function _fmtRange(from, to) {
    if (!from) return ''
    if (!to || to === from) return _fmtDate(from)
    return `${_fmtDate(from)} – ${_fmtDate(to)}`
}
const _months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const _weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// Weekday + month + day, e.g. "Thu · Jul 2". Uses UTC parts so the ISO date
// doesn't shift a day across timezones.
function _fmtFullDate(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-').map(Number)
    const wd = _weekdays[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    return `${wd} · ${_months[m - 1]} ${d}`
}

function _fmt(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    return n.toFixed(2)
}

function _money(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    return `$${n.toFixed(0)}`
}

Radar.propTypes = {
    tab:               PropTypes.string,
    onTabChange:       PropTypes.func,
    scans:             PropTypes.array,
    scansLoading:      PropTypes.bool,
    onCandidateSelect: PropTypes.func,
    onDeleteScan:      PropTypes.func,
    onEditScan:        PropTypes.func,
    earnings:          PropTypes.array,
    earningsFrom:      PropTypes.string,
    earningsTo:        PropTypes.string,
    earningsLoading:   PropTypes.bool,
    onEarningSelect:   PropTypes.func,
    fed:               PropTypes.array,
    fedLoading:        PropTypes.bool,
    ipo:               PropTypes.array,
    ipoLoading:        PropTypes.bool,
    onIpoSelect:       PropTypes.func,
    coverage:          PropTypes.array,
    coverageLoading:   PropTypes.bool,
    onEditCoverage:    PropTypes.func,
    onRetireCoverage:  PropTypes.func,
    onDeleteCoverage:  PropTypes.func,
}
