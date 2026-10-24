import { useState } from 'react'
import PropTypes from 'prop-types'
import { CoverageDetail, CoverageRating } from './CoverageDetail.jsx'
import { BOOK_LABEL, BOOK_SORTS, isBuy, bookResult, bookProgress, bookOrigin, bookRecordLine, sortBook } from './hotlist.utils.js'

// THE HOUSE'S BOOK in the Hotlist — its Swing and Long term lists (Roy, 2026-10-24: "in hotlist — what about longer
// swings and long-term names?"). The day's boards stop at This week; these are Prometheus's coverage, split by the price
// target's horizon (backend houseBook.service): 3–6 months a swing, 12–24 months long term. Live, not by day — the
// house's current book. Each row: where it is against its target, how it has done since the target was set (and
// against SPY), and where it came from (the weekly chain, or the desk). The opened row is the thesis itself.

const _price = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—')
const _pct = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—')
// A target date as month and year — "Oct 2027": a long horizon's date is read by the month, and "27-10-23" read as a day.
const _month = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')

/** The book's track record over its list: what came due, and how the live names are doing. */
function BookRecord({ rec, column }) {
    const line = bookRecordLine(rec)
    if (!line) return null
    return (
        <p className="hot-note hot-record">
            <span className="hot-record__who">Track record · {BOOK_LABEL[column].toLowerCase()}</span>
            <span>{line.settled}</span>
            <span>{line.live}</span>
        </p>
    )
}
BookRecord.propTypes = { rec: PropTypes.object, column: PropTypes.string.isRequired }

export function HotlistBook({ book, column, coverage = [], onBuild, onAsk, onSymbolClick }) {
    const [buysOnly, setBuysOnly] = useState(true)
    const [sort, setSort] = useState({ key: null, dir: null })
    const [openSym, setOpenSym] = useState(null)
    const all = book?.[column] ?? []
    const buys = all.filter(isBuy)
    const rows = sortBook(buysOnly ? buys : all, sort.key, sort.dir)
    const bySymbol = new Map((coverage ?? []).map(c => [String(c?.symbol ?? '').toUpperCase(), c]))
    // Click: sort; again: the other way; a third time: back to the book's own order (the chain's names, then upside).
    const onSort = (key) => setSort(s => {
        if (s.key !== key) return { key, dir: null }
        const cur = s.dir ?? BOOK_SORTS[key]
        if (s.dir && cur !== BOOK_SORTS[key]) return { key: null, dir: null }
        return { key, dir: cur === 'asc' ? 'desc' : 'asc' }
    })
    const th = (key, label, { num = false, title } = {}) => {
        const on = sort.key === key
        const dir = on ? (sort.dir ?? BOOK_SORTS[key]) : null
        return (
            <th scope="col" className={num ? 'hot-table__num' : undefined} title={title} aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className={`hot-sort${on ? ' hot-sort--on' : ''}`} onClick={() => onSort(key)}>
                    {label}{on ? <span aria-hidden="true">{dir === 'asc' ? ' ▲' : ' ▼'}</span> : null}
                </button>
            </th>
        )
    }

    return (
        <>
            <div className="hot-meta">
                <div className="hot-status-filter" role="group" aria-label="Show">
                    <button type="button" aria-pressed={buysOnly} className={`hot-status-filter__btn${buysOnly ? ' hot-status-filter__btn--on' : ''}`}
                        onClick={() => setBuysOnly(true)} title="Rated buy or strong buy — the longs the house would take">Buys {buys.length}</button>
                    <button type="button" aria-pressed={!buysOnly} className={`hot-status-filter__btn${!buysOnly ? ' hot-status-filter__btn--on' : ''}`}
                        onClick={() => setBuysOnly(false)} title="Every live thesis, holds and sells too">All {all.length}</button>
                </div>
                <span className="hot-meta__item hot-dim" title="The house's live coverage — not a day's board. Prices are the screener's last close.">
                    The house’s live coverage{book?.asof ? ` · prices as of the ${book.asof} close` : ''}
                </span>
            </div>
            <BookRecord rec={book?.record?.[column]} column={column} />
            {!rows.length
                ? <p className="floor-empty">No {buysOnly ? 'buy-rated ' : ''}{BOOK_LABEL[column].toLowerCase()} names in the book.</p>
                : (
                    <div className="hot-table-wrap hot-table-wrap--list">
                        <table className="hot-table hot-table--list hot-table--book">
                            <thead>
                                <tr>
                                    <th scope="col" className="hot-table__star"><span className="hot-sr">Details</span></th>
                                    {th('symbol', 'Sym')}
                                    <th scope="col" className="hot-table__num" title="The screener's last close — not live">Last</th>
                                    <th scope="col" title="Prometheus's rating">Rating</th>
                                    <th scope="col" className="hot-table__num" title="Prometheus's price target">Target</th>
                                    {th('upside', 'Upside', { num: true, title: 'From the last close to the target' })}
                                    {th('days_left', 'By', { title: 'The target date, and the horizon it was set for' })}
                                    {th('since', 'Since set', { title: 'Did it work: the move since the target was set (and against SPY over the same days); ✓ hit, ✗ broken, expired once settled' })}
                                    {th('progress', 'To target', { num: true, title: 'How far from the price the day the target was set toward the target' })}
                                    <th scope="col" title="Where the name came from: the weekly chain (Pythia's industry or theme → Argus → Prometheus), or the desk">From</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const open = openSym === r.symbol
                                    const res = bookResult(r)
                                    const origin = bookOrigin(r)
                                    const cov = bySymbol.get(r.symbol) ?? null
                                    const toggle = () => setOpenSym(s => (s === r.symbol ? null : r.symbol))
                                    return [
                                        <tr key={r.symbol} className={`hot-row hot-row--line${r.origin?.source === 'pythia' ? ' hot-row--pick' : ''}${open ? ' hot-row--open' : ''}`}
                                            data-symbol={r.symbol} onClick={(e) => { if (!e.target.closest('button')) toggle() }}>
                                            <td className="hot-table__star">
                                                <button type="button" className="hot-toggle" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} ${r.symbol} details`} onClick={toggle}>{open ? '▾' : '▸'}</button>
                                            </td>
                                            <td><button type="button" className="hot-sym" onClick={() => onSymbolClick?.(r.symbol)} title={r.name ?? r.symbol}>{r.symbol}</button></td>
                                            <td className="hot-table__num">{_price(r.price)}</td>
                                            <td>{cov ? <CoverageRating coverage={cov} /> : <span className="hot-dim">{r.rating?.replace('_', ' ') ?? '—'}</span>}</td>
                                            <td className="hot-table__num">{_price(r.target)}</td>
                                            <td className={`hot-table__num${r.upside_pct > 0 ? ' hot-up' : r.upside_pct < 0 ? ' hot-down' : ''}`}>{_pct(r.upside_pct)}</td>
                                            <td className="hot-range" title={r.target_date ? `${r.target_date}${r.days_left != null ? ` — ${r.days_left} days left` : ''}` : undefined}>{_month(r.target_date)} · {r.horizon ?? '—'}</td>
                                            <td className={`hot-result hot-result--${res?.tone ?? 'dim'}`} title={res?.title}>{res?.text ?? '—'}</td>
                                            <td className="hot-table__num hot-range">{bookProgress(r) ?? '—'}</td>
                                            <td className="hot-book__from" title={origin.title}>{origin.text}</td>
                                        </tr>,
                                        open && (
                                            <tr key={`${r.symbol}-detail`} className="hot-detail-row">
                                                <td />
                                                <td colSpan={9}>
                                                    <div className="hot-detail">
                                                        <p className="hot-detail__head">
                                                            {r.name && <b>{r.name}</b>}
                                                            {r.industry && <span className="hot-dim"> · {r.industry}</span>}
                                                            {r.price_at_set != null && <span className="hot-dim"> · {_price(r.price_at_set)} when the target was set ({String(r.set_at).slice(0, 10)})</span>}
                                                        </p>
                                                        {r.origin?.source === 'pythia' && (
                                                            <p className="hot-detail__line"><b>From the weekly chain:</b> Pythia’s {r.origin.verdict === 'long_term' ? 'long-term' : r.origin.verdict} call on {r.origin.subject}
                                                                {r.origin.why ? <> — <b>Argus:</b> {r.origin.why}</> : null}
                                                                {r.origin.caution ? <span className="hot-row__caution"> Caution: {r.origin.caution}</span> : null}</p>
                                                        )}
                                                        {cov ? <CoverageDetail coverage={cov} /> : <p className="hot-detail__line hot-dim">The thesis is on the Forecasts page.</p>}
                                                        <div className="hot-detail__actions">
                                                            {onBuild && <button type="button" className="floor-queued__btn" onClick={() => onBuild(r, column, null)}
                                                                title={`Build a ${BOOK_LABEL[column].toLowerCase()} setup with Mentor`}>Build with Mentor</button>}
                                                            {onAsk && <button type="button" className="floor-queued__btn hot-ask" onClick={() => onAsk(r, column)}>Ask Argus</button>}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ),
                                    ]
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
        </>
    )
}
HotlistBook.propTypes = {
    book: PropTypes.object, column: PropTypes.string.isRequired, coverage: PropTypes.array,
    onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func,
}
