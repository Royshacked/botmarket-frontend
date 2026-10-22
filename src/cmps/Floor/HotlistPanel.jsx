import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { useDetailPanel } from '../DetailPanel/detailPanel.store.js'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import {
    COLUMN_LABEL, COLUMN_TITLE, CHECKPOINT_LABEL, COLUMN_ORDER, STATUS_LABEL, STATUS_TITLE, LIST_SORTS,
    fmtRange, rangeTitle, bestColumn, catalystChip, earningsChip, sparkGeometry, rowStatus, rowReason, sortList,
} from './hotlist.utils.js'
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
    // Boards already read while the panel is open; dropped on close so a reopen shows the newest.
    const seen = useRef(new Map())
    // The board the panel WANTS on screen. A slow read that comes back for another tab, or after a
    // close, is cached but not shown — or the 14:30 tab would end up showing the 10:30 board.
    const wanted = useRef(null)

    useEffect(() => { if (!isOpen) { seen.current.clear(); wanted.current = null } }, [isOpen])

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
    const title = listView
        ? `${_day(today.day)} · today’s list`
        : b ? `${_day(b.day)} · ${CHECKPOINT_LABEL[b.checkpoint] ?? b.checkpoint}` : 'Today'
    const actions = (
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
        <DetailPanel id={HOTLIST_PANEL_ID} kicker="Hotlist" title={title} actions={actions} className="hot-panel">
            {listView && today.status === 'ok'
                ? <DayList today={today} sort={sort} setSort={setSort} only={only} setOnly={setOnly}
                    onSymbolClick={onSymbolClick} onBuild={handOff(onBuild)} onAsk={handOff(onAsk)} />
                : <Body today={today} board={board} picksOnly={picksOnly} setPicksOnly={setPicksOnly}
                    onRetry={retryLoad} onSymbolClick={onSymbolClick}
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
                    <div className="hot-table-wrap">
                        <table className="hot-table hot-table--list">
                            <thead>
                                <tr>
                                    <th scope="col" className="hot-table__star"><span className="hot-sr">Argus pick</span></th>
                                    {th('symbol', 'Name')}
                                    <th scope="col"><span className="hot-sr">Last 20 sessions</span></th>
                                    <SortTh k="price" also="chg" label="Price" alsoLabel="Chg" sort={sort} onSort={onSort} num
                                        title="The price at the checkpoint, and its change from the previous close" />
                                    {th('vol', 'RVol', { num: true, title: 'Volume against an ordinary day, at the checkpoint (pre-market: % of a day)' })}
                                    {th('status', 'Status', { title: 'In play now, building, or setting up — and the checkpoint that first listed it' })}
                                    {th('grade', 'Best', { title: 'The best graded column, its free range, and the next report' })}
                                    <th scope="col"><span className="hot-sr">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => <ListRow key={r.symbol} row={r} onBuild={onBuild} onAsk={onAsk} onSymbolClick={onSymbolClick} />)}
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

/**
 * A header that sorts its column; a second click flips the direction. `also` stacks a second sort
 * under the first, for a cell that shows two numbers (the price over its change).
 */
function SortTh({ k, label, also, alsoLabel, sort, onSort, num = false, title }) {
    const btn = (key, text) => {
        const on = sort.key === key
        const dir = on ? (sort.dir ?? LIST_SORTS[key]) : null
        return (
            <button type="button" className={`hot-sort${on ? ' hot-sort--on' : ''}`} onClick={() => onSort(key)}>
                {text}{on ? <span aria-hidden="true">{dir === 'asc' ? ' ▲' : ' ▼'}</span> : null}
            </button>
        )
    }
    const onKey = [k, also].find(x => x && sort.key === x)
    const dir = onKey ? (sort.dir ?? LIST_SORTS[onKey]) : null
    return (
        <th scope="col" className={num ? 'hot-table__num' : undefined} title={title}
            aria-sort={onKey ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            {btn(k, label)}
            {also && <span className="hot-sort__also">{btn(also, alsoLabel)}</span>}
        </th>
    )
}
SortTh.propTypes = {
    k: PropTypes.string.isRequired, label: PropTypes.string.isRequired, also: PropTypes.string, alsoLabel: PropTypes.string,
    sort: PropTypes.object.isRequired, onSort: PropTypes.func.isRequired, num: PropTypes.bool, title: PropTypes.string,
}

function ListRow({ row, onBuild, onAsk, onSymbolClick }) {
    const col = bestColumn(row, COLUMN_ORDER)
    const cell = col ? row.cells?.[col] : null
    const status = rowStatus(row)
    const reason = rowReason(row)
    const earn = earningsChip(row)
    const cat = catalystChip(row.catalyst)
    const asOf = _time(row.quoted_at)
    // The board this cell lives on — the hand-off references it, not the latest board.
    const cellBoard = { id: (col && row.cell_board?.[col]) ?? row.board }
    const note = row.pick
        ? <><b>Argus:</b> {row.pick.why}{row.pick.caution ? <span className="hot-row__caution"> Caution: {row.pick.caution}</span> : null}</>
        : row.avoid ? <><b>Argus — avoid:</b> {row.avoid}</> : null
    return (
        <>
            <tr className={`hot-row${row.pick ? ' hot-row--pick' : ''}${row.avoid ? ' hot-row--avoid' : ''}`} data-symbol={row.symbol}>
                <td className="hot-table__star">{row.pick ? <span className="hot-star" title={`Argus's pick #${row.pick.rank}`}>★{row.pick.rank}</span> : null}</td>
                <td className="hot-list__name">
                    <button type="button" className="hot-sym" onClick={() => onSymbolClick?.(row.symbol)} title={row.name ?? row.symbol}>{row.symbol}</button>
                    {(row.name || Number.isFinite(row.atr_pct)) && (
                        <span className="hot-name" title={Number.isFinite(row.atr_pct) ? 'ATR — the average daily range, % of price' : undefined}>
                            {[row.name, Number.isFinite(row.atr_pct) ? `ATR ${row.atr_pct.toFixed(1)}%` : null].filter(Boolean).join(' · ')}
                        </span>
                    )}
                    {(reason || cat) && (
                        <span className="hot-reason">
                            {cat && row.catalyst?.material ? <span className={`hot-cat hot-cat--${row.catalyst.surprise}`} title={row.catalyst?.headline ?? undefined}>{cat}</span> : null}
                            {reason}
                        </span>
                    )}
                </td>
                <td className="hot-spark-cell"><Sparkline closes={row.spark} price={row.price} range={cell?.range ?? null} /></td>
                <td className="hot-table__num" title={asOf ? `As of ${asOf}` : undefined}>
                    {Number.isFinite(row.price) ? row.price.toFixed(2) : '—'}
                    <span className={`hot-sub${row.gap_pct > 0 ? ' hot-up' : row.gap_pct < 0 ? ' hot-down' : ''}`}>{_pct(row.gap_pct)}</span>
                </td>
                <td className="hot-table__num">{Number.isFinite(row.rvol) ? `${row.rvol}×` : Number.isFinite(row.pm_vol_pct) ? `${row.pm_vol_pct.toFixed(1)}%` : '—'}</td>
                <td>
                    {status ? <span className={`hot-status hot-status--${status}`} title={STATUS_TITLE[status]}>{STATUS_LABEL[status]}</span> : <span className="hot-dim">—</span>}
                    {row.first_seen && (
                        <span className="hot-sub hot-dim" title={row.seen?.length > 1 ? `Listed at ${row.seen.map(c => CHECKPOINT_LABEL[c] ?? c).join(', ')}` : 'The checkpoint that first listed it today'}>
                            since {CHECKPOINT_LABEL[row.first_seen]?.split(' ')[0] ?? row.first_seen}
                        </span>
                    )}
                </td>
                <td className="hot-cell">
                    {cell?.grade
                        ? <span className={`hot-grade hot-grade--${cell.grade}`} title={[COLUMN_TITLE[col], rangeTitle(cell.range)].filter(Boolean).join(' — ')}>
                            <span className="hot-best__col">{COLUMN_LABEL[col] ?? col}</span> <b>{cell.grade}</b>
                          </span>
                        : <span className="hot-dim">—</span>}
                    {cell?.range && <span className="hot-sub hot-range">{fmtRange(cell.range)}</span>}
                    {earn && <span className={`hot-sub hot-dim hot-earn${earn.exit ? ' hot-earn--exit' : ''}`} title={earn.title}>{earn.text}</span>}
                </td>
                <td className="hot-actions hot-actions--compact">
                    {col && onBuild && (
                        <button type="button" className="floor-queued__btn" onClick={() => onBuild(row, col, cellBoard)} aria-label="Build with Mentor"
                            title={`Build a ${COLUMN_LABEL[col] ?? col} setup with Mentor`}>Mentor</button>
                    )}
                    {onAsk && <button type="button" className="floor-queued__btn hot-ask" aria-label="Ask Argus" title="Ask Argus about it" onClick={() => onAsk(row, col ?? COLUMN_ORDER[0])}>Argus</button>}
                </td>
            </tr>
            {note && (
                <tr className="hot-note-row">
                    <td />
                    <td colSpan={7} className="hot-row__note">{note}</td>
                </tr>
            )}
        </>
    )
}
ListRow.propTypes = { row: PropTypes.object.isRequired, onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func }

/**
 * The last 20 sessions' closes, today's price as a dot, and the level the best grade's free range runs
 * to as a dash. Empty (not a placeholder) for a row the overnight pass saved no closes for.
 */
function Sparkline({ closes, price, range }) {
    const level = range && !range.open_sky ? range.level : null
    const g = sparkGeometry(closes, { price, level })
    if (!g) return null
    const title = [`Last ${closes.length} sessions: ${g.changePct > 0 ? '+' : ''}${g.changePct}%`,
        Number.isFinite(level) ? `room to ${level}` : range?.open_sky ? 'open sky above' : null].filter(Boolean).join(' — ')
    return (
        <svg className={`hot-spark hot-spark--${g.up ? 'up' : 'down'}`} width="90" height="28" viewBox="0 0 90 28" role="img" aria-label={title}>
            <title>{title}</title>
            {g.levelY != null && <line className="hot-spark__level" x1="0" x2="90" y1={g.levelY} y2={g.levelY} />}
            <path className="hot-spark__line" d={g.line} />
            <circle className="hot-spark__dot" cx={g.dot.x} cy={g.dot.y} r="2.2" />
        </svg>
    )
}
Sparkline.propTypes = { closes: PropTypes.array, price: PropTypes.number, range: PropTypes.object }

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
