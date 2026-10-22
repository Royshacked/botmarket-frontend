import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { useDetailPanel } from '../DetailPanel/detailPanel.store.js'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import {
    COLUMN_LABEL, COLUMN_TITLE, CHECKPOINT_LABEL, COLUMN_ORDER, STATUS_LABEL, STATUS_TITLE, LIST_SORTS,
    fmtRange, rangeTitle, bestColumn, catalystChip, earningsChip, sparkGeometry, rowStatus, rowReason, sortList,
} from './hotlist.utils.js'
import { ChartSurface } from '../PriceChart/ChartSurface.jsx'
import './HotlistPanel.scss'

// THE HOTLIST — the screener's daily board of names in play, in the detail panel over the chat
// (docs/design/daily-names.md §8; Roy, 2026-10-21).
//
// What it shows is the server's: the DailyScreener's checkpoint boards — each name graded per column
// by FREE RANGE (the room to the nearest level overhead), and Argus's read of the board written once
// for everyone (its summary, its starred picks with why and a caution, the traps). Nothing here
// decides anything. Long side only; no entries, stops or targets — those are Mentor's, with the user.
//
// The user hands names on ONE AT A TIME (Roy's call): "Build with Mentor" sends the row's best
// column as a hotlist reference the server reads back from the stored board; "Ask Argus" puts the
// row's facts to Argus as the user's own question. Both live in the chat UNDER this panel, so the
// panel closes first — the same rule the Calendar's doorways follow.
//
// Two views (Roy, 2026-10-22). TODAY'S LIST, the default: a classic watchlist — every name any of the
// day's boards graded, once, sortable, with its status (in play / building / setting up) and why in
// plain words. Prices are as of each name's last checkpoint, never live: live quotes would cost the
// shared FMP key requests it does not have in session. BOARDS: one checkpoint's board at a time.

export const HOTLIST_PANEL_ID = 'hotlist'
/** While the screener is working, the panel looks again this often (quietly — no "Loading…"). */
export const WORKING_POLL_MS = 30_000

const _day = (iso) => {
    if (!iso) return ''
    const d = new Date(`${iso}T12:00:00Z`)
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function HotlistPanel({ onBuild, onAsk, onSymbolClick }) {
    const { isOpen, close } = useDetailPanel(HOTLIST_PANEL_ID)
    const [today, setToday] = useState({ status: 'idle', day: null, checkpoints: [], dayList: [], latest: null, working: null, stats: null })
    const [boardId, setBoardId] = useState(null)
    const [board, setBoard] = useState({ status: 'idle', data: null })
    const [picksOnly, setPicksOnly] = useState(false)
    const [view, setView] = useState('list')
    const [sort, setSort] = useState({ key: 'status', dir: null })
    const [only, setOnly] = useState(null)
    const [retry, setRetry] = useState(0)
    // A symbol clicked on the list: its DAILY chart, in this window, in place of the table (Roy, 2026-10-22). The window
    // covers the chat, so the chat's own chart dock would open out of sight.
    const [chartSym, setChartSym] = useState(null)
    // Boards already read while the panel is open; dropped on close so a reopen shows the newest.
    const seen = useRef(new Map())
    // The board the panel WANTS on screen. A slow read that comes back for another tab, or after a
    // close, is cached but not shown — or the 14:30 tab would end up showing the 10:30 board.
    const wanted = useRef(null)

    useEffect(() => { if (!isOpen) { seen.current.clear(); wanted.current = null; setChartSym(null) } }, [isOpen])

    // Every open starts on the day's latest board.
    useEffect(() => {
        if (!isOpen) return
        let live = true
        setToday(t => ({ ...t, status: 'loading' }))
        hotlistService.getToday().then(
            d => {
                if (!live) return
                setToday(_today(d))
                wanted.current = d.latest?.id ?? null
                if (d.latest) { seen.current.set(d.latest.id, d.latest); setBoardId(d.latest.id); setBoard({ status: 'ok', data: d.latest }) }
                else { setBoardId(null); setBoard({ status: 'ok', data: null }) }
            },
            () => { if (live) { setToday(t => ({ ...t, status: 'error' })); setBoard({ status: 'idle', data: null }) } },
        )
        return () => { live = false }
    }, [isOpen, retry])

    // While the screener is working, look again — quietly: the board on screen stays put, a new
    // checkpoint shows up as a tab, and the day's first board replaces the empty note. Every reply
    // is a new `today`, which re-arms the timer; it stops once nothing is running.
    useEffect(() => {
        if (!isOpen || today.status !== 'ok' || !today.working) return
        let live = true
        const timer = setTimeout(() => {
            hotlistService.getToday().then(
                d => {
                    if (!live) return
                    setToday(_today(d))
                    if (d.latest && !wanted.current) {
                        wanted.current = d.latest.id
                        seen.current.set(d.latest.id, d.latest)
                        setBoardId(d.latest.id)
                        setBoard({ status: 'ok', data: d.latest })
                    }
                },
                () => { if (live) setToday(t => ({ ...t })) },   // a failed look: try again next round
            )
        }, WORKING_POLL_MS)
        return () => { live = false; clearTimeout(timer) }
    }, [isOpen, today])

    const pickBoard = (id) => {
        if (id === boardId) return
        setBoardId(id)
        wanted.current = id
        const cached = seen.current.get(id)
        if (cached) { setBoard({ status: 'ok', data: cached }); return }
        setBoard({ status: 'loading', data: null })
        hotlistService.getBoard(id).then(
            b => { seen.current.set(id, b); if (wanted.current === id) setBoard({ status: 'ok', data: b }) },
            () => { if (wanted.current === id) setBoard({ status: 'error', data: null }) },
        )
    }

    const handOff = (fn) => fn && ((...args) => { close(); fn(...args) })
    const b = board.data
    const listView = view === 'list' && today.dayList.length > 0
    // A caller's own handler wins (a host that shows charts elsewhere); otherwise the chart opens here.
    const symbolClick = (sym) => (onSymbolClick ? onSymbolClick(sym) : setChartSym(sym))
    const title = chartSym ? `${chartSym} · daily` : listView
        ? `${_day(today.day)} · today’s list`
        : b ? `${_day(b.day)} · ${CHECKPOINT_LABEL[b.checkpoint] ?? b.checkpoint}` : 'Today'
    const actions = chartSym ? (
        <button type="button" className="hot-nav__btn" onClick={() => setChartSym(null)}>‹ Back to the list</button>
    ) : (
        <>
            {today.dayList.length > 0 && (
                <div className="hot-nav" role="tablist" aria-label="Hotlist view">
                    {[['list', 'Today’s list'], ['boards', 'Boards']].map(([v, label]) => (
                        <button key={v} type="button" role="tab" aria-selected={view === v}
                            className={`hot-nav__btn${view === v ? ' hot-nav__btn--on' : ''}`} onClick={() => setView(v)}>{label}</button>
                    ))}
                </div>
            )}
            {!listView && today.checkpoints.length > 1 && (
                <div className="hot-nav" role="tablist" aria-label="Today's checkpoints">
                    {today.checkpoints.map(c => (
                        <button key={c.id} type="button" role="tab" aria-selected={c.id === boardId}
                            className={`hot-nav__btn${c.id === boardId ? ' hot-nav__btn--on' : ''}`} onClick={() => pickBoard(c.id)}>
                            {CHECKPOINT_LABEL[c.checkpoint] ?? c.checkpoint}
                        </button>
                    ))}
                </div>
            )}
        </>
    )
    const retryLoad = () => setRetry(n => n + 1)

    return (
        <DetailPanel id={HOTLIST_PANEL_ID} kicker="Hotlist" title={title} actions={actions} className="hot-panel" container bare>
            {chartSym
                ? (
                    <div className="hot-chart">
                        <ChartSurface ticker={chartSym} timeframe="day" onClose={() => setChartSym(null)} />
                    </div>
                )
                : listView && today.status === 'ok'
                    ? <DayList today={today} sort={sort} setSort={setSort} only={only} setOnly={setOnly}
                        onSymbolClick={symbolClick} onBuild={handOff(onBuild)} onAsk={handOff(onAsk)} />
                    : <Body today={today} board={board} picksOnly={picksOnly} setPicksOnly={setPicksOnly}
                        onRetry={retryLoad} onSymbolClick={symbolClick}
                        onBuild={handOff(onBuild)} onAsk={handOff(onAsk)} />}
        </DetailPanel>
    )
}

const _today = (d) => ({ status: 'ok', day: d.day, checkpoints: d.checkpoints, dayList: d.dayList ?? [], latest: d.latest ?? null, working: d.working, stats: d.stats })
HotlistPanel.propTypes = {
    onBuild:       PropTypes.func,
    onAsk:         PropTypes.func,
    onSymbolClick: PropTypes.func,
}

function Body({ today, board, picksOnly, setPicksOnly, onRetry, onBuild, onAsk, onSymbolClick }) {
    if (today.status === 'error' || board.status === 'error') {
        return <p className="floor-empty">Couldn’t load the hotlist. <button type="button" className="cal-link" onClick={onRetry}>Try again</button></p>
    }
    if (today.status !== 'ok' || board.status === 'loading') return <p className="floor-empty" aria-live="polite">Loading…</p>
    const b = board.data
    if (!b) {
        const ready = !today.working && ['done', 'partial'].includes(today.stats?.status)
        return (
            <div className="hot-board">
                <Working working={today.working} />
                {ready && (
                    <p className="hot-note">
                        Stats ready: {today.stats.written?.toLocaleString() ?? 'no'} names from {_day(today.stats.day)}’s close{today.stats.status === 'partial' ? ' (a partial pass — the provider’s rate limit stopped it early)' : ''}.
                    </p>
                )}
                <p className="floor-empty">No hotlist yet. On trading days the screener publishes boards at 08:00 and 09:20 ET (the open and this week), then 10:30, 14:30 and 15:30.</p>
            </div>
        )
    }

    const columns = b.columns ?? []
    const rows = (b.rows ?? []).filter(r => !picksOnly || r.pick)
    const picks = (b.rows ?? []).filter(r => r.pick).length
    const regime = b.regime ?? {}

    return (
        <div className="hot-board">
            <Working working={today.working} />
            {b.argus?.summary && (
                <section className="hot-argus" aria-label="Argus's read">
                    <span className="hot-argus__who">Argus</span>
                    <p className="hot-argus__text">{b.argus.summary}</p>
                </section>
            )}

            <div className="hot-meta">
                {Number.isFinite(regime.breadth_above_sma20) && (
                    <span className="hot-meta__item" title="The share of the screened universe closing above its 20-day average">
                        Breadth {regime.breadth_above_sma20.toFixed(0)}%
                    </span>
                )}
                {typeof regime.spy?.above_sma20 === 'boolean' && (
                    <span className={`hot-meta__item hot-meta__item--${regime.spy.above_sma20 ? 'up' : 'down'}`}>
                        SPY {regime.spy.above_sma20 ? 'above' : 'below'} its 20-day
                    </span>
                )}
                {b.status === 'partial' && <span className="hot-meta__item hot-meta__item--warn" title="The pass stopped early (the data provider's rate limit) — these are the names it reached">Partial board</span>}
                {picks > 0 && (
                    <label className="hot-meta__filter">
                        <input type="checkbox" checked={picksOnly} onChange={e => setPicksOnly(e.target.checked)} /> Argus’s picks only ({picks})
                    </label>
                )}
            </div>

            {b.unverified && (
                <p className="hot-note">
                    Grades are <b>unverified</b>{b.unverified_columns?.length && b.unverified_columns.length < columns.length ? ` for ${b.unverified_columns.map(c => COLUMN_LABEL[c] ?? c).join(', ')}` : ''}: not enough logged outcomes yet to say an A beats a C. Free range is room to the next level overhead — not a target.
                </p>
            )}

            {!rows.length
                ? <p className="floor-empty">{picksOnly ? 'Argus starred nothing on this board.' : 'Nothing in play on this board.'}</p>
                : (
                    <div className="hot-table-wrap">
                        <table className="hot-table">
                            <thead>
                                <tr>
                                    <th scope="col" className="hot-table__star"><span className="hot-sr">Argus pick</span></th>
                                    <th scope="col">Name</th>
                                    <th scope="col"><span className="hot-sr">Last 20 sessions</span></th>
                                    <th scope="col" className="hot-table__num">Price</th>
                                    <th scope="col" className="hot-table__num">Gap</th>
                                    <th scope="col" className="hot-table__num" title="Volume against an ordinary day (pre-market: % of a day's volume)">Vol</th>
                                    <th scope="col">Catalyst</th>
                                    {columns.map(c => <th key={c} scope="col" title={COLUMN_TITLE[c]}>{COLUMN_LABEL[c] ?? c}</th>)}
                                    <th scope="col"><span className="hot-sr">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => <Row key={r.symbol} row={r} board={b} columns={columns} onBuild={onBuild} onAsk={onAsk} onSymbolClick={onSymbolClick} />)}
                            </tbody>
                        </table>
                    </div>
                )}
        </div>
    )
}
Body.propTypes = {
    today: PropTypes.object.isRequired, board: PropTypes.object.isRequired,
    picksOnly: PropTypes.bool.isRequired, setPicksOnly: PropTypes.func.isRequired, onRetry: PropTypes.func.isRequired,
    onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func,
}

/**
 * TODAY'S LIST — the day's names as one sortable watchlist (Roy, 2026-10-22). Each row keeps every
 * column it was graded on today; "Build with Mentor" hands over the best one, referencing the board
 * that cell lives on.
 */
function DayList({ today, sort, setSort, only, setOnly, onBuild, onAsk, onSymbolClick }) {
    const all = today.dayList
    const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map(s => [s, all.filter(r => rowStatus(r) === s).length]))
    const rows = sortList(only ? all.filter(r => rowStatus(r) === only) : all, sort.key, sort.dir)
    const latest = today.latest
    const onSort = (key) => setSort(s => (s.key === key
        ? { key, dir: (s.dir ?? LIST_SORTS[key]) === 'asc' ? 'desc' : 'asc' }
        : { key, dir: null }))
    const th = (key, label, extra = {}) => <SortTh key={key} k={key} label={label} sort={sort} onSort={onSort} {...extra} />
    // One row open at a time: its detail line under it.
    const [openSym, setOpenSym] = useState(null)

    return (
        <div className="hot-board">
            <Working working={today.working} />
            {latest?.argus?.summary && (
                <section className="hot-argus" aria-label="Argus's read">
                    <span className="hot-argus__who">Argus · {CHECKPOINT_LABEL[latest.checkpoint] ?? latest.checkpoint}</span>
                    <p className="hot-argus__text">{latest.argus.summary}</p>
                </section>
            )}
            <div className="hot-meta">
                <div className="hot-status-filter" role="group" aria-label="Show">
                    <button type="button" className={`hot-status-filter__btn${!only ? ' hot-status-filter__btn--on' : ''}`} aria-pressed={!only} onClick={() => setOnly(null)}>All {all.length}</button>
                    {Object.entries(STATUS_LABEL).map(([s, label]) => (
                        <button key={s} type="button" title={STATUS_TITLE[s]} disabled={!counts[s]} aria-pressed={only === s}
                            className={`hot-status-filter__btn hot-status-filter__btn--${s}${only === s ? ' hot-status-filter__btn--on' : ''}`}
                            onClick={() => setOnly(only === s ? null : s)}>{label} {counts[s]}</button>
                    ))}
                </div>
                <span className="hot-meta__item hot-dim" title="Not live: each price is the quote the screener read at the checkpoint that last listed the name">Prices as of each name’s last checkpoint</span>
            </div>
            {latest?.unverified && <p className="hot-note">Grades are <b>unverified</b>: not enough logged outcomes yet to say an A beats a C. Free range is room to the next level overhead — not a target.</p>}
            {!rows.length
                ? <p className="floor-empty">Nothing {STATUS_LABEL[only]?.toLowerCase() ?? 'listed'} today.</p>
                : (
                    <div className="hot-table-wrap hot-table-wrap--list">
                        <table className="hot-table hot-table--list">
                            <thead>
                                <tr>
                                    <th scope="col" className="hot-table__star"><span className="hot-sr">Details and Argus pick</span></th>
                                    {th('symbol', 'Sym')}
                                    <th scope="col"><span className="hot-sr">Last 20 sessions</span></th>
                                    {th('price', 'Last', { num: true, title: 'The price at the checkpoint that last listed it — not live' })}
                                    {th('chg', 'Chg%', { num: true, title: 'Change from the previous close, at that checkpoint' })}
                                    {th('vol', 'RVol', { num: true, title: 'Volume against an ordinary day, at the checkpoint (pre-market: % of a day)' })}
                                    {th('atr', 'ATR%', { num: true, title: 'Average daily range, % of price' })}
                                    {th('status', 'Status', { title: 'In play now, building, or setting up' })}
                                    {th('grade', 'Best', { title: 'The best graded column and its grade' })}
                                    <th scope="col" title="Free range: the room to the next level overhead — not a target">Room</th>
                                    {th('earnings', 'Earn', { title: 'Next earnings; amber = a run-up trade, out before the report' })}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => <ListRow key={r.symbol} row={r} open={openSym === r.symbol}
                                    onToggle={() => setOpenSym(s => (s === r.symbol ? null : r.symbol))}
                                    onBuild={onBuild} onAsk={onAsk} onSymbolClick={onSymbolClick} />)}
                            </tbody>
                        </table>
                    </div>
                )}
        </div>
    )
}
DayList.propTypes = {
    today: PropTypes.object.isRequired, sort: PropTypes.object.isRequired, setSort: PropTypes.func.isRequired,
    only: PropTypes.string, setOnly: PropTypes.func.isRequired,
    onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func,
}

/** A header that sorts its column; a second click flips the direction. */
function SortTh({ k, label, sort, onSort, num = false, title }) {
    const on = sort.key === k
    const dir = on ? (sort.dir ?? LIST_SORTS[k]) : null
    return (
        <th scope="col" className={num ? 'hot-table__num' : undefined} title={title}
            aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button type="button" className={`hot-sort${on ? ' hot-sort--on' : ''}`} onClick={() => onSort(k)}>
                {label}{on ? <span aria-hidden="true">{dir === 'asc' ? ' ▲' : ' ▼'}</span> : null}
            </button>
        </th>
    )
}
SortTh.propTypes = {
    k: PropTypes.string.isRequired, label: PropTypes.string.isRequired,
    sort: PropTypes.object.isRequired, onSort: PropTypes.func.isRequired, num: PropTypes.bool, title: PropTypes.string,
}

const LIST_COLS = 11
/** Short words for the one-line row; the filter and the detail use the full ones. */
const STATUS_SHORT = { in_play: 'In play', building: 'Building', setting_up: 'Setting' }
const _room = (r) => (!r ? null : r.open_sky ? 'open sky'
    : [Number.isFinite(r.pct) ? `${r.pct.toFixed(1)}%` : null, Number.isFinite(r.atr_mult) ? `${r.atr_mult.toFixed(2).replace(/^0/, '')}×` : null].filter(Boolean).join(' ') || null)

/**
 * One name, ONE LINE — a broker's watchlist row (Roy, 2026-10-22: "still doesn't look like a classic
 * watchlist table"). Everything that needs words — the reason, the story, Argus's note, the hand-offs
 * — opens under it on a click.
 */
function ListRow({ row, open, onToggle, onBuild, onAsk, onSymbolClick }) {
    const col = bestColumn(row, COLUMN_ORDER)
    const cell = col ? row.cells?.[col] : null
    const status = rowStatus(row)
    const earn = earningsChip(row)
    const detailId = `hot-detail-${row.symbol}`
    // A click anywhere on the row opens it — except on its own buttons (the symbol opens the chart).
    const onRowClick = (e) => { if (!e.target.closest('button')) onToggle() }
    return (
        <>
            <tr className={`hot-row hot-row--line${row.pick ? ' hot-row--pick' : ''}${row.avoid ? ' hot-row--avoid' : ''}${open ? ' hot-row--open' : ''}`}
                data-symbol={row.symbol} onClick={onRowClick}>
                <td className="hot-table__star">
                    <button type="button" className="hot-toggle" aria-expanded={open} aria-controls={detailId}
                        aria-label={`${open ? 'Hide' : 'Show'} ${row.symbol} details`} onClick={onToggle}>{open ? '▾' : '▸'}</button>
                    {row.pick ? <span className="hot-star" title={`Argus's pick #${row.pick.rank}`}>★{row.pick.rank}</span>
                        : row.avoid ? <span className="hot-avoid" title={`Argus — avoid: ${row.avoid}`}>✕</span> : null}
                </td>
                <td><button type="button" className="hot-sym" onClick={() => onSymbolClick?.(row.symbol)} title={row.name ?? row.symbol}>{row.symbol}</button></td>
                <td className="hot-spark-cell hot-spark-cell--sm"><Sparkline closes={row.spark} price={row.price} range={cell?.range ?? null} small hot={status === 'in_play'} /></td>
                <td className="hot-table__num" title={row.quoted_at ? `As of ${_time(row.quoted_at)}` : undefined}>{Number.isFinite(row.price) ? row.price.toFixed(2) : '—'}</td>
                <td className={`hot-table__num${row.gap_pct > 0 ? ' hot-up' : row.gap_pct < 0 ? ' hot-down' : ''}`}>{_pct(row.gap_pct)}</td>
                <td className="hot-table__num">{Number.isFinite(row.rvol) ? `${row.rvol}×` : Number.isFinite(row.pm_vol_pct) ? `${row.pm_vol_pct.toFixed(1)}%` : '—'}</td>
                <td className="hot-table__num">{Number.isFinite(row.atr_pct) ? `${row.atr_pct.toFixed(1)}%` : '—'}</td>
                <td>{status ? <span className={`hot-status hot-status--${status}`} title={STATUS_TITLE[status]}>{STATUS_SHORT[status]}</span> : <span className="hot-dim">—</span>}</td>
                <td>
                    {cell?.grade
                        ? <span className={`hot-grade hot-grade--${cell.grade}`} title={COLUMN_TITLE[col]}>
                            <span className="hot-best__col">{COLUMN_LABEL[col] ?? col}</span> <b>{cell.grade}</b>
                          </span>
                        : <span className="hot-dim">—</span>}
                </td>
                <td className="hot-range" title={rangeTitle(cell?.range) ?? undefined}>{_room(cell?.range) ?? '—'}</td>
                <td>{earn ? <span className={`hot-earn${earn.exit ? ' hot-earn--exit' : ' hot-dim'}`} title={earn.title}>{row.next_earnings.slice(5)}{earn.exit ? '!' : ''}</span> : <span className="hot-dim">—</span>}</td>
            </tr>
            {open && (
                <tr className="hot-detail-row" id={detailId}>
                    <td />
                    <td colSpan={LIST_COLS - 1}><RowDetail row={row} col={col} status={status} earn={earn} onBuild={onBuild} onAsk={onAsk} /></td>
                </tr>
            )}
        </>
    )
}
ListRow.propTypes = {
    row: PropTypes.object.isRequired, open: PropTypes.bool, onToggle: PropTypes.func.isRequired,
    onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func,
}

/** What an open row says: who it is, why it is here, Argus's word on it, and the hand-offs. */
function RowDetail({ row, col, status, earn, onBuild, onAsk }) {
    const reason = rowReason(row)
    const cat = catalystChip(row.catalyst)
    const seen = (row.seen ?? []).map(c => CHECKPOINT_LABEL[c]?.split(' ')[0] ?? c)
    // The board this cell lives on — the hand-off references it, not the latest board.
    const cellBoard = { id: (col && row.cell_board?.[col]) ?? row.board }
    return (
        <div className="hot-detail">
            <p className="hot-detail__head">
                {row.name && <b>{row.name}</b>}
                {status && <span> · {STATUS_LABEL[status]}</span>}
                {seen.length > 0 && <span className="hot-dim"> · listed at {seen.join(', ')}</span>}
                {row.quoted_at && <span className="hot-dim"> · price as of {_time(row.quoted_at)}</span>}
            </p>
            {reason && <p className="hot-detail__line">{reason}</p>}
            {cat && <p className="hot-detail__line">
                <span className={`hot-cat${row.catalyst?.material ? ` hot-cat--${row.catalyst.surprise}` : ''}`}>{cat}</span>
                {row.catalyst?.headline ? <span> {row.catalyst.headline}</span> : null}
            </p>}
            {earn?.exit && <p className="hot-detail__line hot-earn--exit">{earn.title}.</p>}
            {row.pick && <p className="hot-detail__line"><b>Argus:</b> {row.pick.why}{row.pick.caution ? <span className="hot-row__caution"> Caution: {row.pick.caution}</span> : null}</p>}
            {row.avoid && <p className="hot-detail__line"><b>Argus — avoid:</b> {row.avoid}</p>}
            <div className="hot-detail__actions">
                {col && onBuild && (
                    <button type="button" className="floor-queued__btn" onClick={() => onBuild(row, col, cellBoard)}
                        title={`Build a ${COLUMN_LABEL[col] ?? col} setup with Mentor`}>Build with Mentor</button>
                )}
                {onAsk && <button type="button" className="floor-queued__btn hot-ask" onClick={() => onAsk(row, col ?? COLUMN_ORDER[0])}>Ask Argus</button>}
            </div>
        </div>
    )
}
RowDetail.propTypes = {
    row: PropTypes.object.isRequired, col: PropTypes.string, status: PropTypes.string, earn: PropTypes.object,
    onBuild: PropTypes.func, onAsk: PropTypes.func,
}

/**
 * The last 20 sessions' closes, today's price as a dot, and the level the best grade's free range runs
 * to as a dash. Empty (not a placeholder) for a row the overnight pass saved no closes for.
 */
function Sparkline({ closes, price, range, small = false, hot = true }) {
    const level = range && !range.open_sky ? range.level : null
    const [w, h] = small ? [60, 16] : [90, 28]
    const g = sparkGeometry(closes, { price, level, w, h, pad: small ? 2 : 3 })
    if (!g) return null
    const title = [`Last ${closes.length} sessions: ${g.changePct > 0 ? '+' : ''}${g.changePct}%`,
        Number.isFinite(level) ? `room to ${level}` : range?.open_sky ? 'open sky above' : null].filter(Boolean).join(' — ')
    // In the list, colour is for the HOT names (Roy, 2026-10-22): an in-play line is green or red, the
    // rest are drawn muted.
    const tone = hot ? (g.up ? 'up' : 'down') : 'muted'
    return (
        <svg className={`hot-spark hot-spark--${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>
            <title>{title}</title>
            {g.levelY != null && <line className="hot-spark__level" x1="0" x2={w} y1={g.levelY} y2={g.levelY} />}
            <path className="hot-spark__line" d={g.line} />
            <circle className="hot-spark__dot" cx={g.dot.x} cy={g.dot.y} r={small ? 1.6 : 2.2} />
        </svg>
    )
}
Sparkline.propTypes = { closes: PropTypes.array, price: PropTypes.number, range: PropTypes.object, small: PropTypes.bool, hot: PropTypes.bool }

const _time = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null)

/** What the screener is doing right now — the overnight pass (with its count) or a checkpoint's board. */
function Working({ working }) {
    if (!working) return null
    const since = _time(working.started_at)
    let text
    if (working.kind === 'overnight') {
        const count = Number.isFinite(working.of) && working.of > 0
            ? ` — ${(working.done ?? 0).toLocaleString()} of ${working.of.toLocaleString()} names`
            : ''
        text = `Preparing the screener’s stats from ${_day(working.day)}’s close${count}`
    } else {
        text = `Building the ${CHECKPOINT_LABEL[working.checkpoint] ?? working.checkpoint} board`
    }
    return (
        <p className="hot-working" role="status">
            <span className="hot-working__dot" aria-hidden="true" />
            {text}{since ? <span className="hot-dim"> · since {since}</span> : null}
        </p>
    )
}
Working.propTypes = { working: PropTypes.object }

const _pct = (n) => (Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(1)}%` : '—')

function Row({ row, board, columns, onBuild, onAsk, onSymbolClick }) {
    const col = bestColumn(row, columns)
    const cat = catalystChip(row.catalyst)
    const earn = earningsChip(row)
    const vol = Number.isFinite(row.rvol) ? `${row.rvol}×` : Number.isFinite(row.pm_vol_pct) ? `${row.pm_vol_pct.toFixed(1)}%` : '—'
    const note = row.pick
        ? <><b>Argus:</b> {row.pick.why}{row.pick.caution ? <span className="hot-row__caution"> Caution: {row.pick.caution}</span> : null}</>
        : row.avoid ? <><b>Argus — avoid:</b> {row.avoid}</> : null
    return (
        <>
            <tr className={`hot-row${row.pick ? ' hot-row--pick' : ''}${row.avoid ? ' hot-row--avoid' : ''}`} data-symbol={row.symbol}>
                <td className="hot-table__star">{row.pick ? <span className="hot-star" title={`Argus's pick #${row.pick.rank}`}>★{row.pick.rank}</span> : null}</td>
                <td>
                    <button type="button" className="hot-sym" onClick={() => onSymbolClick?.(row.symbol)} title={row.name ?? row.symbol}>{row.symbol}</button>
                    {row.name && <span className="hot-name">{row.name}</span>}
                </td>
                <td className="hot-spark-cell"><Sparkline closes={row.spark} price={row.price} range={col ? row.cells?.[col]?.range : null} /></td>
                <td className="hot-table__num">{Number.isFinite(row.price) ? row.price.toFixed(2) : '—'}</td>
                <td className={`hot-table__num${row.gap_pct > 0 ? ' hot-up' : row.gap_pct < 0 ? ' hot-down' : ''}`}>{_pct(row.gap_pct)}</td>
                <td className="hot-table__num">{vol}</td>
                <td>
                    {cat ? <span className={`hot-cat${row.catalyst?.material ? ` hot-cat--${row.catalyst.surprise}` : ''}`} title={row.catalyst?.headline ?? undefined}>{cat}</span> : <span className="hot-dim">—</span>}
                    {row.fade_check && <span className="hot-flag" title="A minor story under a big gap — a fade candidate as much as a follow-through">fade?</span>}
                    {earn && <span className={`hot-dim hot-earn${earn.exit ? ' hot-earn--exit' : ''}`} title={earn.title}>{earn.text}</span>}
                </td>
                {columns.map(c => {
                    const cell = row.cells?.[c]
                    return (
                        <td key={c} className="hot-cell">
                            {cell?.grade
                                ? <span className={`hot-grade hot-grade--${cell.grade}`} title={[rangeTitle(cell.range), ...(cell.why ?? [])].filter(Boolean).join(' — ')}>
                                    <b>{cell.grade}</b> <span className="hot-range">{fmtRange(cell.range)}</span>
                                  </span>
                                : <span className="hot-dim" title={cell?.gate ? `Fails the ${cell.gate.replace('_', ' ')} gate` : 'Not in play for this column'}>—</span>}
                        </td>
                    )
                })}
                <td className="hot-actions">
                    {col && onBuild && (
                        <button type="button" className="floor-queued__btn" onClick={() => onBuild(row, col, board)}
                            title={`Build a ${COLUMN_LABEL[col] ?? col} setup with Mentor`}>Build with Mentor</button>
                    )}
                    {onAsk && <button type="button" className="floor-queued__btn hot-ask" onClick={() => onAsk(row, col ?? columns[0], board)}>Ask Argus</button>}
                </td>
            </tr>
            {note && (
                <tr className="hot-note-row">
                    <td />
                    <td colSpan={columns.length + 7} className="hot-row__note">{note}</td>
                </tr>
            )}
        </>
    )
}
Row.propTypes = {
    row: PropTypes.object.isRequired, board: PropTypes.object.isRequired, columns: PropTypes.array.isRequired,
    onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func,
}
