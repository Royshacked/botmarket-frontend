import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { useDetailPanel, setReturnTo } from '../DetailPanel/detailPanel.store.js'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { apiError } from '../../services/http.service.js'
import {
    COLUMN_LABEL, COLUMN_TITLE, CHECKPOINT_LABEL, COLUMN_ORDER, STATUS_LABEL, STATUS_TITLE, LIST_SORTS,
    fmtRange, rangeTitle, bestColumn, catalystChip, earningsChip, sparkGeometry, rowStatus, rowReason, sortList,
    pickFor, horizonCounts, horizonRows, readsBySymbol, readCell, hasBand, PASS_WHY, resultCell, columnRecord,
    BOOK_ORDER, BOOK_LABEL, BOOK_TITLE, readTime, argusRecordLine, backtestLine, DAY_COLUMNS,
    isConfirmedRead, emptyNamesText, COMPANY_LABEL, chainSurvivors, COVERED, COVERED_LABEL, coveredRows,
} from './hotlist.utils.js'
import { ChartSurface } from '../PriceChart/ChartSurface.jsx'
import { HotlistBook } from './HotlistBook.jsx'
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
/** Looks after the screener stops working — the week board lands a minute or two after the nightly run (code review 2026-10-25). */
export const TAIL_LOOKS = 4
/** After a catalyst read is asked for, the reads are looked at again at these delays — a read takes about a minute. */
// eslint-disable-next-line react-refresh/only-export-components -- read by the panel's tests; a plain constant, no state
export const READ_RECHECK_MS = [75_000, 180_000]

const _day = (iso) => {
    if (!iso) return ''
    const d = new Date(`${iso}T12:00:00Z`)
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function HotlistPanel({ onBuild, onAsk, onSymbolClick, coverage = [] }) {
    const { isOpen, close } = useDetailPanel(HOTLIST_PANEL_ID)
    const [today, setToday] = useState({ status: 'idle', day: null, checkpoints: [], dayList: [], latest: null, working: null, stats: null })
    const [boardId, setBoardId] = useState(null)
    const [board, setBoard] = useState({ status: 'idle', data: null })
    const [picksOnly, setPicksOnly] = useState(false)
    const [view, setView] = useState('list')
    const [sort, setSort] = useState({ key: 'status', dir: null })
    const [only, setOnly] = useState(null)
    // A list per horizon (horizon-chains.md §1). FOUR TABS (Roy, 2026-10-28: "week / swing / long term / covered
    // companies") — no "All": the panel opens on This week. (An archived day horizon still shows on a past day with them.)
    const [horizon, setHorizon] = useState('week')
    // Prometheus's catalyst reads on the week's picks (§3) — read on open, and again after a read is asked for; a failed
    // read says so on This week rather than showing no targets as if there were none (code review 2026-10-24).
    const [reads, setReads] = useState({ status: 'idle', list: [] })
    const [readsTick, setReadsTick] = useState(0)
    const [retry, setRetry] = useState(0)
    // The day on screen: null = the latest. A past day is where its names' results are — a week name's lands five
    // sessions after its day (Roy, 2026-10-24: "a signal to know if what the hotlist said is working").
    const [day, setDay] = useState(null)
    // Each grade's track record per horizon (GET /outcomes — the outcome log summarised); null until read, or on a failure.
    const [record, setRecord] = useState(null)
    // The house's Swing and Long term names (GET /book) — read on open; null until read, or on a failure.
    const [book, setBook] = useState(null)
    // A symbol clicked on the list: its DAILY chart, in this window, in place of the table (Roy, 2026-10-22). The window
    // covers the chat, so the chat's own chart dock would open out of sight.
    const [chartSym, setChartSym] = useState(null)
    // Boards already read while the panel is open; dropped on close so a reopen shows the newest.
    const seen = useRef(new Map())
    // The board the panel WANTS on screen. A slow read that comes back for another tab, or after a
    // close, is cached but not shown — or the 14:30 tab would end up showing the 10:30 board.
    const wanted = useRef(null)

    useEffect(() => { if (!isOpen) { seen.current.clear(); wanted.current = null; setChartSym(null); setReads({ status: 'idle', list: [] }); setDay(null); setRecord(null); setBook(null) } }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        let live = true
        hotlistService.getOutcomes().then(s => { if (live) setRecord(s ?? null) }, () => { if (live) setRecord(null) })
        hotlistService.getBook().then(b => { if (live) setBook(b ?? null) }, () => { if (live) setBook(null) })
        return () => { live = false }
    }, [isOpen, retry])

    useEffect(() => {
        if (!isOpen) return
        let live = true
        hotlistService.getReads().then(
            list => { if (live) setReads({ status: 'ok', list }) },
            () => { if (live) setReads({ status: 'error', list: [] }) },
        )
        return () => { live = false }
    }, [isOpen, retry, readsTick])

    // "Catalyst read" on a This week row Argus did not pick (horizon-chains.md §3): asked for on the board the row's week
    // cell lives on. A read takes about a minute, so the reads are looked at again then, and once more after.
    const [asked, setAsked] = useState({})   // symbol → { state: 'sending' | 'started' | 'queued' | 'error', message? }
    const recheck = useRef([])
    useEffect(() => {
        if (isOpen) return undefined
        setAsked({})
        recheck.current.forEach(clearTimeout)
        recheck.current = []
        return undefined
    }, [isOpen])
    useEffect(() => () => recheck.current.forEach(clearTimeout), [])
    const askRead = (row) => {
        const boardOf = row.cell_board?.week ?? row.board
        setAsked(a => ({ ...a, [row.symbol]: { state: 'sending' } }))
        hotlistService.requestRead(boardOf, row.symbol).then(
            outcome => {
                setAsked(a => ({ ...a, [row.symbol]: { state: outcome } }))
                recheck.current.push(...READ_RECHECK_MS.map(ms => setTimeout(() => setReadsTick(n => n + 1), ms)))
            },
            err => setAsked(a => ({ ...a, [row.symbol]: { state: 'error', message: apiError(err, 'The read was not asked for.') } })),
        )
    }

    // Every open starts on the day's latest board; a step back in days reads that day's.
    useEffect(() => {
        if (!isOpen) return
        let live = true
        setToday(t => ({ ...t, status: 'loading' }))
        hotlistService.getToday(day).then(
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
    }, [isOpen, retry, day])

    // While the screener is working, look again — quietly: the board on screen stays put, a new
    // checkpoint shows up as a tab, and the day's first board replaces the empty note. Every reply
    // is a new `today`, which re-arms the timer; it stops once nothing is running. Only on the latest day: a past
    // day's list does not change.
    // The week board is written just AFTER the nightly run finishes (hotlist.week — up to a minute or two of reads), so a
    // few more looks follow the last `working` one (code review 2026-10-25: the panel kept yesterday's list).
    const tail = useRef(0)
    useEffect(() => {
        if (!isOpen || today.status !== 'ok' || day) return
        if (today.working) tail.current = TAIL_LOOKS
        else if (tail.current > 0) tail.current -= 1
        else return
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
    }, [isOpen, today, day])

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

    // A hand-off closes the list for the desk — and leaves the way back: the chat offers "‹ Back to the Hotlist".
    const handOff = (fn) => fn && ((...args) => { close(); setReturnTo({ panel: HOTLIST_PANEL_ID, label: 'the Hotlist' }); fn(...args) })
    const b = board.data
    // An empty overnight week board (a quiet night, or SPY under its 200-day) is still the list view: its tabs carry Swing
    // and Long term, which an empty day must not hide (code review 2026-10-25).
    const listView = view === 'list' && (today.dayList.length > 0 || today.latest?.checkpoint === 'overnight')
    // A caller's own handler wins (a host that shows charts elsewhere); otherwise the chart opens here.
    const symbolClick = (sym) => (onSymbolClick ? onSymbolClick(sym) : setChartSym(sym))
    // The days there are lists for, newest first; the one on screen, and its neighbours.
    const days = today.days ?? []
    const at = days.indexOf(today.day)
    const latestDay = at <= 0
    const title = chartSym ? `${chartSym} · daily` : listView
        ? `${_day(today.day)} · ${latestDay ? 'today’s list' : 'the day’s list'}`
        : b ? `${_day(b.day)} · ${CHECKPOINT_LABEL[b.checkpoint] ?? b.checkpoint}` : 'Today'
    const stepDay = (to) => { setDay(to === days[0] ? null : to); setView('list') }
    const actions = chartSym ? (
        <button type="button" className="hot-nav__btn" onClick={() => setChartSym(null)}>‹ Back to the list</button>
    ) : (
        <>
            {days.length > 1 && at >= 0 && (
                <div className="hot-nav" role="group" aria-label="Day">
                    <button type="button" className="hot-nav__btn" disabled={at >= days.length - 1} onClick={() => stepDay(days[at + 1])}
                        aria-label="The day before" title={at < days.length - 1 ? _day(days[at + 1]) : undefined}>‹</button>
                    <button type="button" className="hot-nav__btn" disabled={latestDay} onClick={() => stepDay(days[at - 1])}
                        aria-label="The day after" title={!latestDay ? _day(days[at - 1]) : undefined}>›</button>
                </div>
            )}
            {/* The Boards view is the archived checkpoints' (2026-10-25): a day with only the overnight week board has one list. */}
            {today.dayList.length > 0 && today.checkpoints.some(c => c.checkpoint !== 'overnight') && (
                <div className="hot-nav" role="tablist" aria-label="Hotlist view">
                    {[['list', latestDay ? 'Today’s list' : 'The day’s list'], ['boards', 'Boards']].map(([v, label]) => (
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
                    ? <DayList today={today} sort={sort} setSort={setSort} only={only} setOnly={setOnly} horizon={horizon} setHorizon={setHorizon}
                        reads={readsBySymbol(reads.list, today.day)} readsFailed={reads.status === 'error'} readsLoading={reads.status === 'idle'} asked={asked} onAskRead={latestDay ? askRead : null}
                        record={record} book={book} coverage={coverage}
                        onSymbolClick={symbolClick} onBuild={handOff(onBuild)} onAsk={handOff(onAsk)} />
                    : <Body today={today} board={board} picksOnly={picksOnly} setPicksOnly={setPicksOnly}
                        onRetry={retryLoad} onSymbolClick={symbolClick}
                        onBuild={handOff(onBuild)} onAsk={handOff(onAsk)} />}
        </DetailPanel>
    )
}

const _today = (d) => ({ status: 'ok', day: d.day, checkpoints: d.checkpoints, dayList: d.dayList ?? [], latest: d.latest ?? null, working: d.working, stats: d.stats, days: d.days ?? [] })
HotlistPanel.propTypes = {
    coverage:      PropTypes.array,
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
    // The overnight week board with no names (hotlist.week): the market gate was shut, or nothing qualified — said so.
    if (b?.checkpoint === 'overnight' && !b.rows?.length) {
        return (
            <div className="hot-board">
                <Working working={today.working} />
                <p className="floor-empty">{b.closed ? `${b.closed}.` : 'No run-up names for this list: no company reporting in six sessions had three beats running.'}</p>
            </div>
        )
    }
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
                <p className="floor-empty">No hotlist yet. On trading days This week is built overnight, after the close.</p>
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
                    <ArgusSpots spots={b.argus.spots} />
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

            <p className="hot-note">Each cell is a column the name is in play on, with its free range — the room to the next level overhead, not a target.</p>

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
function DayList({ today, sort, setSort, only, setOnly, horizon = null, setHorizon = () => {}, reads = new Map(), readsFailed = false,
    readsLoading = false, asked = {}, onAskRead, record = null, book = null, coverage = [], onBuild, onAsk, onSymbolClick }) {
    // SWING and LONG TERM (Roy, 2026-10-24) are the house's coverage, not the day's boards: their own list (BookList).
    const bookView = BOOK_ORDER.includes(horizon) || horizon === COVERED
    // THE HORIZON first (horizon-chains.md §1): one column's list — its names, Argus's picks for it first — then the
    // status filter within it. A header the user clicked sorts it instead.
    const byHorizon = bookView ? [] : horizon ? horizonRows(today.dayList, horizon) : today.dayList
    // DAY TRADES (Roy, 2026-10-24: "the scan, then Argus confirms, then the names"): on a session horizon the list IS
    // the names Argus confirmed — no grade; everything the screener let through stays one click away ("All screened").
    const dayTab = DAY_COLUMNS.includes(horizon)
    // THIS WEEK (Roy, 2026-10-24: "hotlist, Argus automatically, names, Prometheus confirms catalyst and fundamentals and
    // gives a PT"): the list is the names Prometheus confirmed — a target of his on the name — then Argus's picks, then
    // everything screened. A day tab has the last two.
    const weekTab = horizon === 'week'
    // THE RUN-UP RULE (2026-10-25, hotlist-day-archive.md): the overnight week board lists by one rule — no Argus — and
    // Prometheus reads every name on it. Its cells carry the grade 'R'; a day before it has Argus's picks. Read off the
    // DAY (code review 2026-10-25): the All view of a run-up day is the rule's list too, unless the day has day names.
    const ruleDay = today.dayList.some(r => r.cells?.week?.grade === 'R')
    const dayNames = today.dayList.some(r => DAY_COLUMNS.some(c => r.cells?.[c]?.grade))
    const ruleWeek = ruleDay && (weekTab || (!horizon && !dayNames))
    const emptyNight = today.latest?.checkpoint === 'overnight' && !today.dayList.length
    const narrowed = dayTab || weekTab
    // The view is chosen PER HORIZON and cleared when the horizon changes (chooseHorizon) — in the same render, so a new
    // tab never paints with the last tab's view first (code review 2026-10-24: an effect reset it a frame late).
    const [views, setViews] = useState({})
    // With Prometheus's reads not loaded, This week opens on Argus's names — the confirmed list would be empty.
    const defaultView = (h) => (h === 'week' && !readsFailed ? 'confirmed' : h === 'week' && ruleDay ? 'all' : 'argus')
    const shown = views[horizon] ?? defaultView(horizon)
    const argusNames = narrowed ? byHorizon.filter(r => pickFor(r, horizon)) : byHorizon
    const prometheusNames = weekTab ? byHorizon.filter(r => isConfirmedRead(reads.get(r.symbol))) : []
    const all = !narrowed || shown === 'all' ? byHorizon : shown === 'confirmed' ? prometheusNames : argusNames
    // Each control counts inside the other's choice: a horizon's count under the status filter, a status's count inside
    // the horizon — so a tab never reads "3" and opens on "nothing" (code review 2026-10-24).
    const byStatus = only ? today.dayList.filter(r => rowStatus(r) === only) : today.dayList
    const hCounts = horizonCounts(byStatus)
    // A horizon tab's count is the list it OPENS on (code review 2026-10-24, as Swing's, Roy: "Swing's count is 11 but I see
    // fewer"): Argus's names on a day tab, Prometheus's confirmed names on This week. What was screened is on hover.
    const tabCount = (c) => {
        const rowsOf = horizonRows(byStatus, c)
        if (defaultView(c) === 'confirmed') return readsLoading ? '…' : rowsOf.filter(r => isConfirmedRead(reads.get(r.symbol))).length
        if (defaultView(c) === 'all') return rowsOf.length
        return rowsOf.filter(r => pickFor(r, c)).length
    }
    const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map(s => [s, all.filter(r => rowStatus(r) === s).length]))
    const filtered = only ? all.filter(r => rowStatus(r) === only) : all
    // A horizon's list is in Argus's order until a header is clicked: no header claims it meanwhile.
    const argusOrder = Boolean(horizon) && sort.key === 'status' && !sort.dir
    const rows = argusOrder ? filtered : sortList(filtered, sort.key, sort.dir, horizon)
    // On THIS WEEK, Prometheus's catalyst target beside each name (§3).
    const showReads = horizon === 'week'
    const latest = today.latest
    // Click: sort by it; again: the other way; a third time: back to the list's own order (Argus's, on a horizon).
    const onSort = (key) => setSort(s => {
        if (argusOrder && key === 'status') return { key, dir: LIST_SORTS.status }
        if (s.key !== key) return { key, dir: null }
        const cur = s.dir ?? LIST_SORTS[key]
        if (s.dir && cur !== LIST_SORTS[key]) return { key: 'status', dir: null }
        return { key, dir: cur === 'asc' ? 'desc' : 'asc' }
    })
    // A new horizon opens in its own order, not the last tab's sort.
    const chooseHorizon = (h) => { if (h === horizon) return; setHorizon(h); setSort({ key: 'status', dir: null }); setViews({}) }
    const setView = (v) => setViews(m => ({ ...m, [horizon]: v }))
    // A day horizon that empties while chosen (a poll took its last name, or the status filter did, or the next day has
    // none) falls back to This week — which stays, empty or not: its empty list says why.
    // (The book's lists are not the day's: their count is the book's, and a reload of the day does not touch them.)
    useEffect(() => { if (horizon !== 'week' && !bookView && !hCounts[horizon]) setHorizon('week') }, [horizon, hCounts[horizon]])   // eslint-disable-line react-hooks/exhaustive-deps -- the one count is the dependency
    const shownSort = argusOrder ? { key: null, dir: null } : sort
    const th = (key, label, extra = {}) => <SortTh key={key} k={key} label={label} sort={shownSort} onSort={onSort} {...extra} />
    // One row open at a time: its detail line under it.
    const [openSym, setOpenSym] = useState(null)

    return (
        <div className="hot-board">
            <Working working={today.working} />
            {latest?.argus?.summary && (
                <section className="hot-argus" aria-label="Argus's read">
                    <span className="hot-argus__who">Argus · {CHECKPOINT_LABEL[latest.checkpoint] ?? latest.checkpoint}</span>
                    <p className="hot-argus__text">{latest.argus.summary}</p>
                    <ArgusSpots spots={latest.argus.spots} />
                </section>
            )}
            {/* Four tabs (Roy, 2026-10-28): This week, Swing, Long term, Covered companies — one always chosen. */}
            <div className="hot-horizons" role="group" aria-label="Horizon">
                {/* The day horizons were archived (2026-10-25): shown only on a past day that still has their names. This
                    week is always there — the panel opens on it, and an empty night's list says why. */}
                {COLUMN_ORDER.filter(c => c === 'week' || hCounts[c]).map(c => (
                    <button key={c} type="button" aria-pressed={horizon === c} disabled={c !== 'week' && !hCounts[c]}
                        title={`${COLUMN_TITLE[c]} — ${tabCount(c)} on the list (${defaultView(c) === 'confirmed' ? 'Prometheus confirmed' : 'Argus’s names'}) of ${hCounts[c] ?? 0} screened`}
                        className={`hot-horizons__btn${horizon === c ? ' hot-horizons__btn--on' : ''}`}
                        onClick={() => chooseHorizon(c)}>{COLUMN_LABEL[c]} {tabCount(c)}</button>
                ))}
                {BOOK_ORDER.map((b, i) => {
                    // The count is what the button OPENS (Roy, 2026-10-24: "Swing's count is 11 but I see fewer") — the weekly
                    // chain's survivors, the list's default; the chain's picks and the whole book are on hover, a click away.
                    const n = book?.[b]?.length ?? 0
                    const picks = book?.picks?.[b]?.length ?? 0
                    const survivors = chainSurvivors(book, b).length
                    return (
                        <button key={b} type="button" aria-pressed={horizon === b} disabled={!n && !picks}
                            title={`${BOOK_TITLE[b]} — ${survivors} confirmed by Prometheus of ${picks} the chain sent; ${n} in the book`}
                            className={`hot-horizons__btn${i === 0 ? ' hot-horizons__btn--book' : ''}${horizon === b ? ' hot-horizons__btn--on' : ''}`}
                            onClick={() => chooseHorizon(b)}>{BOOK_LABEL[b]} {survivors}</button>
                    )
                })}
                {/* The whole book, both horizons, and Prometheus's scorecard. */}
                <button type="button" aria-pressed={horizon === COVERED}
                    title="Every company Prometheus covers — swing and long term, the desk’s too — and his scorecard"
                    className={`hot-horizons__btn${horizon === COVERED ? ' hot-horizons__btn--on' : ''}`}
                    onClick={() => chooseHorizon(COVERED)}>{COVERED_LABEL} {coveredRows(book).length}</button>
            </div>
            {bookView ? (
                <HotlistBook key={horizon} book={book} column={horizon} coverage={coverage} onBuild={onBuild} onAsk={onAsk} onSymbolClick={onSymbolClick} />
            ) : (<>
            <div className="hot-meta">
                {narrowed && (
                    <div className="hot-status-filter" role="group" aria-label="Names">
                        {[
                            weekTab && ['confirmed', `Prometheus confirmed ${prometheusNames.length}`, 'The names Prometheus read — the catalyst and the company — and set a target on: the week’s list'],
                            !ruleWeek && ['argus', `Argus’s names ${argusNames.length}`, weekTab ? 'Argus’s picks for this week, each read by Prometheus — confirmed or not' : 'The names Argus confirmed for this horizon — the day’s list'],
                            ruleWeek
                                ? ['all', `Run-up names ${byHorizon.length}`, 'Every name the run-up rule listed — each read by Prometheus, confirmed or not']
                                : ['all', `All screened ${byHorizon.length}`, 'Everything the screener let through for this horizon, confirmed or not'],
                        ].filter(Boolean).map(([k, label, title]) => (
                            <button key={k} type="button" aria-pressed={shown === k} title={title}
                                className={`hot-status-filter__btn${shown === k ? ' hot-status-filter__btn--on' : ''}`} onClick={() => setView(k)}>{label}</button>
                        ))}
                    </div>
                )}
                <div className="hot-status-filter" role="group" aria-label="Show">
                    <button type="button" className={`hot-status-filter__btn${!only ? ' hot-status-filter__btn--on' : ''}`} aria-pressed={!only}
                        aria-label={`Every status, ${all.length}`} onClick={() => setOnly(null)}>All {all.length}</button>
                    {Object.entries(STATUS_LABEL).map(([s, label]) => (
                        <button key={s} type="button" title={STATUS_TITLE[s]} disabled={!counts[s]} aria-pressed={only === s}
                            className={`hot-status-filter__btn hot-status-filter__btn--${s}${only === s ? ' hot-status-filter__btn--on' : ''}`}
                            onClick={() => setOnly(only === s ? null : s)}>{label} {counts[s]}</button>
                    ))}
                </div>
                {ruleWeek
                    ? <span className="hot-meta__item hot-dim" title="Not live: the close before the list was built — the trade is bought at the list day's open">Prices: the close before the list</span>
                    : <span className="hot-meta__item hot-dim" title="Not live: each price is the quote the screener read at the checkpoint that last listed the name">Prices as of each name’s last checkpoint</span>}
            </div>
            {weekTab && (ruleWeek
                ? <p className="hot-note">This week is the <b>run-up rule</b>: names reporting in six sessions whose last three reports all beat, while SPY is over its 200-day — bought at the open, out at the close before the report. Small and equal, a fixed budget split across the day’s names. <b>Prometheus</b> reads every one overnight — the catalyst and the company — and sets his target.</p>
                : <p className="hot-note">This week: the screener lets names through, <b>Argus picks</b>, and <b>Prometheus</b> reads each pick after the 09:20 board — the catalyst and the company — and sets his target. The names he confirmed are the list.</p>)}
            {latest?.checkpoint === 'overnight' && latest?.closed && <p className="hot-note hot-note--warn">{latest.closed}.</p>}
            {ruleWeek && latest?.market?.gate === 'unknown' && <p className="hot-note hot-note--warn">SPY’s 200-day could not be checked for this list — it is listed as if the market gate were open.</p>}
            {dayTab && <p className="hot-note">No grades on day trades: the screener lets names through, <b>Argus confirms</b> the ones worth trading, and those are the list. Room is the space to the next level overhead — information, not a target.</p>}
            {horizon && <TrackRecord rec={columnRecord(record, horizon)} column={horizon} rule={ruleWeek} />}
            {/* Argus's own record — his picks, avoids and unmarked names, by how they ended (2026-10-24): this horizon's, or all. */}
            {!ruleWeek && <ArgusRecord parts={argusRecordLine(record, horizon ?? 'all')} />}
            {/* The replay over past sessions (This week, 2026-10-24) — apart from the live record, with its caveats. It replayed
                the OLD week rule: not shown over the run-up list (its own test is in the Info column). */}
            {horizon && !ruleWeek && <BacktestRecord bt={backtestLine(record, horizon)} />}

            {showReads && readsFailed && <p className="hot-note hot-note--warn">Prometheus’s targets could not be loaded — Argus’s names are shown without them.</p>}
            {showReads && <p className="hot-note">Target: <b>Prometheus’s</b> short-swing price — decided from the catalyst and the company, off a yardstick (what the catalyst is worth, or the stock’s usual run-up into a report ahead) — and how much of it is still open. Valid until its window ends (the session before a report); graded then.</p>}
            {!rows.length
                ? (narrowed && shown !== 'all' && !only
                    ? <p className="floor-empty">{emptyNamesText({ shown, column: horizon, argus: ruleWeek ? byHorizon : argusNames, screened: byHorizon.length, reads, readsFailed, readsLoading, rule: ruleWeek })}</p>
                    : emptyNight && !only
                        ? <p className="floor-empty">{latest.closed ? 'No run-up names on this list.' : 'No run-up names for this list: no company reporting in six sessions had three beats running.'}</p>
                        : <p className="floor-empty">Nothing {STATUS_LABEL[only]?.toLowerCase() ?? 'listed'}{horizon ? ` for ${COLUMN_LABEL[horizon].toLowerCase()}` : ''} today.</p>)
                : (
                    <div className="hot-table-wrap hot-table-wrap--list">
                        <table className="hot-table hot-table--list">
                            <thead>
                                <tr>
                                    <th scope="col" className="hot-table__star"><span className="hot-sr">Details and Argus pick</span></th>
                                    {th('symbol', 'Sym')}
                                    <th scope="col"><span className="hot-sr">Last 20 sessions</span></th>
                                    {th('price', 'Last', { num: true, title: 'The price at the checkpoint that last listed it — not live' })}
                                    {!ruleWeek && th('chg', 'Chg%', { num: true, title: 'Change from the previous close, at that checkpoint' })}
                                    {!ruleWeek && th('vol', 'RVol', { num: true, title: 'Volume against an ordinary day, at the checkpoint (pre-market: % of a day)' })}
                                    {th('atr', 'ATR%', { num: true, title: 'Average daily range, % of price' })}
                                    {th('status', 'Status', { title: 'In play now, building, or setting up' })}
                                    {/* No grades on the Hotlist (2026-10-24: the day trades, then This week); on All, the horizon each name is best on. */}
                                    {!horizon && !ruleWeek && th('grade', 'Horizon', { title: 'The horizon the name is best on' })}
                                    {!ruleWeek && <th scope="col" title="Free range: the room to the next level overhead — not a target">Room</th>}
                                    {th('earnings', 'Earn', { title: 'Next earnings; amber = a run-up trade, out before the report' })}
                                    <th scope="col" title="Did it work? Once the horizon's window closes: ✓ reached the level its room was measured to, ✗ did not (its best move); ↑ / ↓ open sky, by how it ended. Open while the window runs.">Result</th>
                                    {showReads && <th scope="col" title="Prometheus's short-swing target — and what is still open">Target</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => <ListRow key={r.symbol} row={r} open={openSym === r.symbol} column={horizon} tape={!ruleWeek}
                                    read={showReads ? reads.get(r.symbol) ?? null : null} showRead={showReads}
                                    asked={showReads ? asked[r.symbol] ?? null : null} onAskRead={showReads && !readsFailed ? onAskRead : null} hideGrade={Boolean(horizon) || ruleWeek}
                                    onToggle={() => setOpenSym(s => (s === r.symbol ? null : r.symbol))}
                                    onBuild={onBuild} onAsk={onAsk} onSymbolClick={onSymbolClick} />)}
                            </tbody>
                        </table>
                    </div>
                )}
            </>)}
        </div>
    )
}
DayList.propTypes = {
    today: PropTypes.object.isRequired, sort: PropTypes.object.isRequired, setSort: PropTypes.func.isRequired,
    only: PropTypes.string, setOnly: PropTypes.func.isRequired,
    horizon: PropTypes.string, setHorizon: PropTypes.func, reads: PropTypes.instanceOf(Map), readsFailed: PropTypes.bool, readsLoading: PropTypes.bool,
    asked: PropTypes.object, onAskRead: PropTypes.func, record: PropTypes.object, book: PropTypes.object, coverage: PropTypes.array,
    onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func,
}

/**
 * A horizon's TRACK RECORD over its list (Roy, 2026-10-24): the board's names against the ones past its cut and the pool
 * it chose from — how often each ended up, its average move. No grades (2026-10-24). Says so when there is no history.
 */
function TrackRecord({ rec, column, rule = false }) {
    const label = COLUMN_LABEL[column]?.toLowerCase() ?? column
    // On the run-up list: the RULE's own record only — the week's older, Argus-era outcomes are not its (code review 2026-10-25).
    if (rule) {
        if (!rec?.rule) return <p className="hot-note hot-record">Track record for the run-up rule: no results logged yet.</p>
        return (
            <p className="hot-note hot-record">
                <span className="hot-record__who">Track record · the run-up rule</span>
                <span title="Each name from the list day's open to the close before its report — its own move, not against SPY. The tested bar: a day's names together about +0.4% over SPY">{rec.rule}</span>
            </p>
        )
    }
    // No horizon shows grades (2026-10-24): its record is the board against the rest, and Argus's below.
    if (!rec?.cut) return <p className="hot-note hot-record">Track record for {label}: no results logged yet.</p>
    return (
        <p className="hot-note hot-record">
            <span className="hot-record__who">Track record · {label}</span>
            {/* The board's top names against every name past its cut — does the ranking pick better? */}
            {rec.cut && <span title="Every quoted name is scored: the board's names, the ones past its cut, and the pool it chose from (in play on no horizon) — do the screener's picks beat the names it passed over?">
                <b>on the board</b> {rec.cut.board} · <b>graded off it</b> {rec.cut.off} · <b>the pool it chose from</b> {rec.cut.pool}</span>}
        </p>
    )
}
TrackRecord.propTypes = { rec: PropTypes.object, column: PropTypes.string.isRequired, rule: PropTypes.bool }

/**
 * What Argus SPOTTED in the pool (2026-10-24): names the screener quoted but put in play on no horizon, that he would
 * trade anyway — the horizon, why, and what would make it wrong. Not on the list (no column has them); scored all the same.
 */
function ArgusSpots({ spots }) {
    if (!spots?.length) return null
    return (
        <div className="hot-argus__spots">
            <span className="hot-dim" title="Quoted by the screener but in play on no horizon — Argus would trade them anyway; scored like the rest">Spotted in the pool:</span>
            {spots.map(s => (
                <p key={`${s.symbol}-${s.column}`} className="hot-argus__spot">
                    <b>{s.symbol}</b> <span className="hot-dim">{COLUMN_LABEL[s.column] ?? s.column}</span> — {s.why}
                    {s.caution ? <span className="hot-row__caution"> Caution: {s.caution}</span> : null}
                </p>
            ))}
        </div>
    )
}
ArgusSpots.propTypes = { spots: PropTypes.array }

/** The horizon's backtest — its rules replayed over past sessions, the screener's names against the pool; never mixed with the live record. */
function BacktestRecord({ bt }) {
    if (!bt) return null
    return (
        <p className="hot-note hot-record" title={`Replayed with the live rules over past sessions — ${bt.caveats.join('; ')}. Kept apart from the live record.`}>
            <span className="hot-record__who">Backtest · {bt.span}</span>
            {bt.parts.map(([k, v]) => <span key={k}><b>{k}</b> {v}</span>)}
        </p>
    )
}
BacktestRecord.propTypes = { bt: PropTypes.object }

/** Argus's record over the list: did his picks beat his avoids, and both the names he left alone? */
function ArgusRecord({ parts }) {
    if (!parts) return null
    return (
        <p className="hot-note hot-record" title="How often each ended up over its window, and its average move — Argus's calls against the names he left unmarked">
            <span className="hot-record__who">Argus’s record</span>
            {parts.map(([k, v]) => <span key={k}><b>{k}</b> {v}</span>)}
        </p>
    )
}
ArgusRecord.propTypes = { parts: PropTypes.array }

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

const LIST_COLS = 12
/** Short words for the one-line row; the filter and the detail use the full ones. */
const STATUS_SHORT = { in_play: 'In play', building: 'Building', setting_up: 'Setting' }
const _room = (r) => (!r ? null : r.open_sky ? 'open sky'
    : [Number.isFinite(r.pct) ? `${r.pct.toFixed(1)}%` : null, Number.isFinite(r.atr_mult) ? `${r.atr_mult.toFixed(2).replace(/^0/, '')}×` : null].filter(Boolean).join(' ') || null)

/**
 * One name, ONE LINE — a broker's watchlist row (Roy, 2026-10-22: "still doesn't look like a classic
 * watchlist table"). Everything that needs words — the reason, the story, Argus's note, the hand-offs
 * — opens under it on a click.
 */
function ListRow({ row, open, onToggle, onBuild, onAsk, onSymbolClick, column = null, read = null, showRead = false, asked = null, onAskRead = null, hideGrade = false, tape = true }) {
    // On a horizon's list the row reads THAT column — its room and Argus's pick for it (horizon-chains.md §1).
    const col = column && row.cells?.[column]?.grade ? column : bestColumn(row, COLUMN_ORDER)
    const pick = column ? pickFor(row, column) : row.pick
    const target = showRead ? readCell(read) : null
    const cell = col ? row.cells?.[col] : null
    const status = rowStatus(row)
    const earn = earningsChip(row)
    // Did it work: the result of the column this row shows (Roy, 2026-10-24).
    const result = col ? row.results?.[col] ?? null : null
    const mark = resultCell(result)
    const detailId = `hot-detail-${row.symbol}`
    // A click anywhere on the row opens it — except on its own buttons (the symbol opens the chart).
    const onRowClick = (e) => { if (!e.target.closest('button')) onToggle() }
    return (
        <>
            <tr className={`hot-row hot-row--line${pick ? ' hot-row--pick' : ''}${row.avoid ? ' hot-row--avoid' : ''}${open ? ' hot-row--open' : ''}`}
                data-symbol={row.symbol} onClick={onRowClick}>
                <td className="hot-table__star">
                    <button type="button" className="hot-toggle" aria-expanded={open} aria-controls={detailId}
                        aria-label={`${open ? 'Hide' : 'Show'} ${row.symbol} details`} onClick={onToggle}>{open ? '▾' : '▸'}</button>
                    {pick ? <span className="hot-star" title={`Argus's pick #${pick.rank}${column ? ` for ${COLUMN_LABEL[column].toLowerCase()}` : ''}`}>★{pick.rank}</span>
                        : row.avoid ? <span className="hot-avoid" title={`Argus — avoid: ${row.avoid}`}>✕</span> : null}
                </td>
                <td><button type="button" className="hot-sym" onClick={() => onSymbolClick?.(row.symbol)} title={row.name ?? row.symbol}>{row.symbol}</button></td>
                <td className="hot-spark-cell hot-spark-cell--sm"><Sparkline closes={row.spark} price={row.price} range={cell?.range ?? null} small hot={status === 'in_play'} /></td>
                <td className="hot-table__num" title={row.quoted_at ? `As of ${_time(row.quoted_at)}` : undefined}>{Number.isFinite(row.price) ? row.price.toFixed(2) : '—'}</td>
                {tape && <td className={`hot-table__num${row.gap_pct > 0 ? ' hot-up' : row.gap_pct < 0 ? ' hot-down' : ''}`}>{_pct(row.gap_pct)}</td>}
                {tape && <td className="hot-table__num">{Number.isFinite(row.rvol) ? `${row.rvol}×` : Number.isFinite(row.pm_vol_pct) ? `${row.pm_vol_pct.toFixed(1)}%` : '—'}</td>}
                <td className="hot-table__num">{Number.isFinite(row.atr_pct) ? `${row.atr_pct.toFixed(1)}%` : '—'}</td>
                <td>{status ? <span className={`hot-status hot-status--${status}`} title={STATUS_TITLE[status]}>{STATUS_SHORT[status]}</span> : <span className="hot-dim">—</span>}</td>
                {!hideGrade && <td>
                    {/* No grade on any horizon (2026-10-24) — the horizon only. */}
                    {cell?.grade
                        ? <span className="hot-best__col" title={COLUMN_TITLE[col]}>{COLUMN_LABEL[col] ?? col}</span>
                        : <span className="hot-dim">—</span>}
                </td>}
                {/* The run-up list measures no room (the rule's exit is the report, not a level): no tape, no room. */}
                {tape && <td className="hot-range" title={rangeTitle(cell?.range) ?? undefined}>{_room(cell?.range) ?? '—'}</td>}
                <td>{earn ? <span className={`hot-earn${earn.exit ? ' hot-earn--exit' : ' hot-dim'}`} title={earn.title}>{row.next_earnings.slice(5)}{earn.exit ? '!' : ''}</span> : <span className="hot-dim">—</span>}</td>
                <td className={`hot-result hot-result--${mark?.tone ?? 'dim'}`} title={mark?.title}>{mark?.text ?? '—'}</td>
                {showRead && (
                    <td className={`hot-target${target?.state ? ` hot-target--${target.state}` : ''}`} title={target?.title}>
                        {target?.text ?? (['started', 'queued', 'sending'].includes(asked?.state)
                            ? <span className="hot-dim" title="Prometheus is reading it — about a minute">reading…</span>
                            : <span className="hot-dim" title="No catalyst read yet — Prometheus reads the week's names after the list is built; open the row to ask for one">—</span>)}
                    </td>
                )}
            </tr>
            {open && (
                <tr className="hot-detail-row" id={detailId}>
                    <td />
                    <td colSpan={LIST_COLS - 1 + (showRead ? 1 : 0) - (hideGrade ? 1 : 0) - (tape ? 0 : 3)}><RowDetail row={row} col={col} pick={pick} read={showRead ? read : null} status={status} earn={earn} onBuild={onBuild} onAsk={onAsk}
                        asked={asked} onAskRead={showRead && !read ? onAskRead : null} result={mark} /></td>
                </tr>
            )}
        </>
    )
}
ListRow.propTypes = {
    row: PropTypes.object.isRequired, open: PropTypes.bool, onToggle: PropTypes.func.isRequired,
    onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func,
    column: PropTypes.string, read: PropTypes.object, showRead: PropTypes.bool, asked: PropTypes.object, onAskRead: PropTypes.func,
    hideGrade: PropTypes.bool,
}

/** Prometheus's catalyst read under a week row (horizon-chains.md §3): the verdict, the number, what can break it. */
function ReadDetail({ read }) {
    const t = read.target
    const graded = read.outcome
    return (
        <div className="hot-read">
            <p className="hot-detail__line">
                <b>Prometheus:</b> {read.verdict.replace('_', ' ')}
                {!t && PASS_WHY[read.pass_reason] && <span className="hot-dim"> · no target: {PASS_WHY[read.pass_reason]}</span>}
                {t && <> · target <b>{t.value.toFixed(2)}</b>{hasBand(t) && ` (${t.low.toFixed(2)}–${t.high.toFixed(2)})`}</>}
                {/* The price the target was set from, and when — the row's Last is an earlier checkpoint's quote. */}
                {t && Number.isFinite(t.spot ?? read.price_at_read) && <span className="hot-dim"> · set from {(t.spot ?? read.price_at_read).toFixed(2)} at the read, {readTime(read.set_at)}</span>}
                {/* A run-up's target is the stock's own record into its reports; an event's is what it is worth less what moved. */}
                {/* HIS OWN number (2026-10-24): what is open, and the yardstick the tools gave him beside it. */}
                {t && t.basis === 'prometheus' && <> · <b>{_pct(t.open_pct)}</b> open — his own number{Number.isFinite(t.yardstick?.open_pct) && <span className="hot-dim">, off the {t.yardstick.basis === 'run_up' ? `run-up record (median ${_pct(t.yardstick.open_pct)}${read.runup?.n ? ` over ${read.runup.n} reports` : ''})` : `catalyst's worth (${_pct(t.yardstick.open_pct)} open)`}</span>}</>}
                {t && t.basis === 'run_up' && <> · its run-up into the last {read.runup?.n ?? '?'} reports: median {t.open_pct > 0 ? '+' : ''}{t.open_pct}%{Number.isFinite(read.runup?.up_share) && `, up ${Math.round(read.runup.up_share * 100)}% of the time`}</>}
                {/* This cycle's head start (2026-10-24): the stock has already moved part of its usual full run-up. */}
                {t && t.basis === 'run_up' && t.moved_pct > 0 && <span className="hot-dim"> · this cycle already {t.moved_pct > 0 ? '+' : ''}{t.moved_pct}% of a usual +{t.worth_pct}%{t.cycle_cut_pct > 0 ? `, so ${t.cycle_cut_pct}% less is left` : ''}</span>}
                {t && !['run_up', 'prometheus'].includes(t.basis) && <> · worth {t.worth_pct > 0 ? '+' : ''}{t.worth_pct}%, moved {t.moved_pct > 0 ? '+' : ''}{t.moved_pct}%, open {t.open_pct > 0 ? '+' : ''}{t.open_pct}%</>}
                {read.exit_before && <span className="hot-earn--exit"> · out before the {read.exit_before} report</span>}
                <span className="hot-dim"> · valid until {String(read.valid_until).slice(0, 10)}</span>
                {read.news_driven === false && <span className="hot-row__caution"> · no news under the move</span>}
            </p>
            {t?.why && <p className="hot-detail__line"><span className="hot-dim">The target:</span> {t.why}</p>}
            {t?.stretch && <p className="hot-detail__line hot-row__caution">A stretch: {t.stretch.times}× the larger of the options’ implied move and the yardstick ({_pct(t.stretch.ref_pct)}).</p>}
            {read.company?.verdict && <p className="hot-detail__line"><span className="hot-dim">The company:</span> <span className={read.company.verdict === 'sound' ? '' : 'hot-row__caution'}>{COMPANY_LABEL[read.company.verdict]}</span>{read.company.why && ` — ${read.company.why}`}</p>}
            {read.read && <p className="hot-detail__line">{read.read}</p>}
            {read.event_risk?.length > 0 && <p className="hot-detail__line hot-earn--exit">Inside the window: {read.event_risk.join('; ')}</p>}
            {read.kill?.length > 0 && <p className="hot-detail__line"><span className="hot-dim">Wrong if:</span> {read.kill.join('; ')}</p>}
            {graded && <p className="hot-detail__line"><b>{read.status === 'hit' ? 'Hit' : 'Expired'}</b>{Number.isFinite(graded.return_pct) && ` · ${graded.return_pct > 0 ? '+' : ''}${graded.return_pct}%`}{Number.isFinite(graded.vs_spy) && ` (${graded.vs_spy > 0 ? '+' : ''}${graded.vs_spy} vs SPY)`}</p>}
        </div>
    )
}
ReadDetail.propTypes = { read: PropTypes.object.isRequired }

/** What an open row says: who it is, why it is here, Argus's word on it, and the hand-offs. */
function RowDetail({ row, col, pick = row.pick, read = null, status, earn, onBuild, onAsk, asked = null, onAskRead = null, result = null }) {
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
            {pick && <p className="hot-detail__line"><b>Argus:</b> {pick.why}{pick.caution ? <span className="hot-row__caution"> Caution: {pick.caution}</span> : null}</p>}
            {row.avoid && <p className="hot-detail__line"><b>Argus — avoid:</b> {row.avoid}</p>}
            {result && result.tone !== 'dim' && (
                <p className="hot-detail__line"><b>Result ({COLUMN_LABEL[col] ?? col}):</b> <span className={`hot-result--${result.tone}`}>{result.title}</span></p>
            )}
            {read && <ReadDetail read={read} />}
            <div className="hot-detail__actions">
                {col && onBuild && (
                    <button type="button" className="floor-queued__btn" onClick={() => onBuild(row, col, cellBoard)}
                        title={`Build a ${COLUMN_LABEL[col] ?? col} setup with Mentor`}>Build with Mentor</button>
                )}
                {onAsk && <button type="button" className="floor-queued__btn hot-ask" onClick={() => onAsk(row, col ?? COLUMN_ORDER[0])}>Ask Argus</button>}
                {/* A week name with no read yet — Argus did not pick it, or it waits: ask Prometheus for one (horizon-chains.md §3). */}
                {onAskRead && (!asked || asked.state === 'error') && (
                    <button type="button" className="floor-queued__btn hot-ask-read" onClick={() => onAskRead(row)}
                        title="Prometheus reads the catalyst and the company — is it real, can the company carry it, what is still open — and sets his target and a window. About a minute.">Catalyst read</button>
                )}
                {/* The answer sits beside the button — a line below it read as "nothing happened" (Roy, 2026-10-24). */}
                {asked && (
                    <span className={`hot-asked hot-asked--${asked.state}`} role="status">
                        {asked.state === 'sending' ? 'Asking Prometheus…'
                            : asked.state === 'started' ? 'Prometheus is reading it — the target lands on this row in about a minute.'
                                : asked.state === 'queued' ? 'Queued — Prometheus reads it as soon as the research running now is done.'
                                    : asked.message}
                    </span>
                )}
            </div>
        </div>
    )
}
RowDetail.propTypes = {
    row: PropTypes.object.isRequired, col: PropTypes.string, pick: PropTypes.object, read: PropTypes.object, status: PropTypes.string, earn: PropTypes.object,
    onBuild: PropTypes.func, onAsk: PropTypes.func, asked: PropTypes.object, onAskRead: PropTypes.func, result: PropTypes.object,
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
                    // This board's cell, checked against the tape once its window closed (Roy, 2026-10-24).
                    const mark = resultCell(row.results?.[c])
                    return (
                        <td key={c} className="hot-cell">
                            {cell?.grade
                                // No grade shown, not even as a colour (2026-10-24) — the room, and the result.
                                ? <span className="hot-grade" title={[rangeTitle(cell.range), ...(cell.why ?? [])].filter(Boolean).join(' — ')}>
                                    <span className="hot-range">{fmtRange(cell.range)}</span>
                                    {mark && mark.tone !== 'dim' && <span className={`hot-result hot-result--${mark.tone}`} title={mark.title}> {mark.text}</span>}
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
