import { useState } from 'react'
import PropTypes from 'prop-types'
import {
    positionPnlPct, formatPnl, formatPnlPct, formatNum,
} from '../TradeIdeas/tradeIdea.utils.js'
import { positionsByAccount, groupByDay } from './floor.utils.js'
import './Floor.scss'

// The Floor's left column: the book on top, the calendar underneath.
//
// Both halves are the same shape — a quiet section header over one line per row — because both
// answer a background question ("what am I exposed to", "what is coming"). Neither is a place you
// act; acting happens in the chat or in the right column's lists. That's why there are no cards,
// no controls and no per-row chrome here: this column is READ, not operated.
//
// Positions are grouped by ACCOUNT rather than by portfolio. A portfolio is a construction; an
// account is where the money actually is, and exposure is an account-level question. Accounts data
// (balance, equity, margin) lands here later — the account row is already the seam for it.

const CAL_TABS = [
    { key: 'earnings', label: 'Earnings' },
    { key: 'fed',      label: 'Fed' },
    { key: 'ipo',      label: 'IPO' },
]

const pnlClass = n => (n == null ? '' : n > 0 ? 'is-pos' : n < 0 ? 'is-neg' : '')

function AccountBlock({ group, open, onToggle, onOpenPosition }) {
    const { summary } = group
    return (
        <div className={`floor-acct${open ? ' floor-acct--open' : ''}`}>
            <button
                className="floor-acct__row"
                onClick={() => onToggle(group.key)}
                aria-expanded={open}
                title={open ? 'Collapse account' : 'Expand account'}
            >
                <svg className="floor-acct__chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {/* No paper/manual/live chip: usePositions already scopes the whole list to the
                    active workspace, so every row here is that mode by construction. A per-row
                    badge would be restating the workspace switch on every line. */}
                <span className="floor-acct__no">{group.accountNo}</span>
                <span className="floor-acct__count">{summary.count}</span>
                <span className={`floor-acct__pnl ${pnlClass(summary.pnl)}`}>
                    {summary.pnl == null ? '—' : formatPnl(summary.pnl, summary.currency)}
                </span>
            </button>

            {open && (
                <div className="floor-acct__body">
                    {group.positions.map(p => {
                        const pct = positionPnlPct(p)
                        return (
                            <button
                                key={`${p.broker}:${p.accountId}:${p.id}`}
                                className="floor-pos"
                                onClick={() => onOpenPosition?.(p)}
                                title={onOpenPosition ? 'Open this position' : undefined}
                            >
                                <span className={`floor-pos__dir floor-pos__dir--${p.direction}`} aria-hidden="true">
                                    {p.direction === 'short' ? '▾' : '▴'}
                                </span>
                                <span className="floor-pos__sym">{p.symbol ?? '—'}</span>
                                <span className="floor-pos__qty">{formatNum(p.volume)}</span>
                                <span className={`floor-pos__pnl ${pnlClass(Number(p.pnl))}`}>
                                    {formatPnl(p.pnl, p.currency)}
                                </span>
                                <span className={`floor-pos__pct ${pnlClass(pct)}`}>{formatPnlPct(pct)}</span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

AccountBlock.propTypes = {
    group:          PropTypes.object.isRequired,
    open:           PropTypes.bool,
    onToggle:       PropTypes.func.isRequired,
    onOpenPosition: PropTypes.func,
}

// ── Calendar ──────────────────────────────────────────────────────────────────
// One row per event, grouped by day. The three feeds differ in what they carry, so each renders
// its own row — but the day grouping and the header are shared, because that part is mechanism.

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

function CalendarRows({ tab, earnings, fed, ipo, onEarningSelect, onIpoSelect }) {
    const items = tab === 'earnings' ? earnings : tab === 'fed' ? fed : ipo
    if (!items.length) return <p className="floor-empty">Nothing scheduled.</p>

    return groupByDay(items).map(g => (
        <div key={g.date} className="floor-cal__day">
            <div className="floor-cal__date">{fmtDay(g.date)}</div>
            {g.items.map((e, i) => {
                if (tab === 'fed') {
                    return (
                        <div key={i} className="floor-cal__row" title={e.desc || ''}>
                            <span className="floor-cal__time">{e.time || ''}</span>
                            <span className="floor-cal__label">{e.event}</span>
                            <span className={`floor-cal__impact floor-cal__impact--${e.impact}`}>{e.impact}</span>
                        </div>
                    )
                }
                const onSelect = tab === 'earnings' ? onEarningSelect : onIpoSelect
                return (
                    <button
                        key={e.symbol || i}
                        className="floor-cal__row floor-cal__row--btn"
                        onClick={() => onSelect?.(e)}
                        title={e.symbol ? `Build a trade idea around ${e.symbol}` : undefined}
                    >
                        <span className="floor-cal__sym">{e.symbol ?? '—'}</span>
                        <span className="floor-cal__label">{e.name ?? ''}</span>
                        {tab === 'earnings'
                            ? <span className="floor-cal__when">{EARN_WHEN[(e.time || '').toLowerCase()] ?? ''}</span>
                            : <span className="floor-cal__when">{e.price ? `$${e.price}` : ''}</span>}
                    </button>
                )
            })}
        </div>
    ))
}

/**
 * @param {object[]} positions
 * @param {Function} [onOpenPosition]  row click — hands the position back to the caller
 */
export function FloorLeft({
    positions = [], positionsLoading = false, onOpenPosition,
    earnings = [], fed = [], ipo = [], calendarLoading = false,
    onEarningSelect, onIpoSelect,
}) {
    const groups = positionsByAccount(positions)
    // Accounts default OPEN — the book is the one thing you want to see without asking. Collapse is
    // for when it grows past the half-column, which is also when it stops being glanceable.
    const [closed, setClosed] = useState(() => new Set())
    const [calTab, setCalTab] = useState('earnings')

    function toggle(key) {
        setClosed(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    return (
        <aside className="floor-left">
            {/* ── The book ── */}
            <section className="floor-left__half floor-left__half--book">
                {/* Title only. The roll-up P&L that used to sit here is deliberately gone: the
                    per-account rows below already carry it, and a second total in the header
                    invited the reader to reconcile two numbers instead of reading one. */}
                <header className="floor-sec">
                    <h2 className="floor-sec__title">Positions</h2>
                </header>

                <div className="floor-left__scroll">
                    {positionsLoading && !positions.length
                        ? <p className="floor-empty">Loading…</p>
                        : !groups.length
                            ? <p className="floor-empty">No open positions.</p>
                            : groups.map(g => (
                                <AccountBlock
                                    key={g.key}
                                    group={g}
                                    open={!closed.has(g.key)}
                                    onToggle={toggle}
                                    onOpenPosition={onOpenPosition}
                                />
                            ))}
                </div>
            </section>

            {/* ── The calendar ── */}
            <section className="floor-left__half floor-left__half--cal">
                <header className="floor-sec">
                    <h2 className="floor-sec__title">Calendar</h2>
                    <nav className="floor-sec__tabs">
                        {CAL_TABS.map(t => (
                            <button
                                key={t.key}
                                className={`floor-sec__tab${calTab === t.key ? ' floor-sec__tab--on' : ''}`}
                                onClick={() => setCalTab(t.key)}
                            >{t.label}</button>
                        ))}
                    </nav>
                </header>

                <div className="floor-left__scroll">
                    {calendarLoading
                        ? <p className="floor-empty">Loading…</p>
                        : <CalendarRows
                            tab={calTab}
                            earnings={earnings} fed={fed} ipo={ipo}
                            onEarningSelect={onEarningSelect} onIpoSelect={onIpoSelect}
                        />}
                </div>
            </section>
        </aside>
    )
}

FloorLeft.propTypes = {
    positions:        PropTypes.array,
    positionsLoading: PropTypes.bool,
    onOpenPosition:   PropTypes.func,
    earnings:         PropTypes.array,
    fed:              PropTypes.array,
    ipo:              PropTypes.array,
    calendarLoading:  PropTypes.bool,
    onEarningSelect:  PropTypes.func,
    onIpoSelect:      PropTypes.func,
}
