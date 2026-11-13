import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { OwnedBadge } from '../OwnedBadge/OwnedBadge.jsx'
import { HotlistRowPage } from './HotlistRowPage.jsx'
import {
    DAY_BOARD_LABEL, DAY_BOARD_TITLE, DAY_BOARD_RULE, quotedSpan, latestBoardId, orderedBoards, volText, gapText, catalystCell,
    headlineTime, dayBoardsNote,
} from './hotlistDay.utils.js'

// THE INTRADAY TAB (botmarket-backend services/hotlist.day.js; docs/design/argus-rework.md §3.3 — revived 2026-11-11):
// the day's boards, 09:20 · 10:30 · 14:30 ET, one at a time, opening on the latest. Each row is a name IN PLAY — moving
// up so far. The board's RULE is said once above the table (every row passed it — Roy, 2026-11-12: "all reasons are the
// same"); a row's own why is its CATALYST, the freshest headline. No grade, no room, no result.
//
// A row opens its PAGE (HotlistRowPage, like every other list): the numbers, the daily chart, every headline, and
// "Build with Mentor" — the name handed on as an intraday trade, its board's facts read back by the server (backend
// hotlistSeed, the `hd_` reference). The symbol itself opens the chart, as everywhere.
//
// The board on screen can be HELD BY THE PANEL (`boardId` + `onBoard`), so a trip to a chart and back keeps it (CR
// 2026-11-11); without them the component holds it itself. `day` is the day the panel asked for (null = the latest).
// `focus` / `onOpen` — the row page open, held by the panel like the other lists' (its header has the way back).

export function HotlistDayBoards({ data, day = null, boardId: heldId, onBoard, onSymbolClick, onRetry, now = Date.now,
    focus = null, onOpen = null, onBuild = null }) {
    // The answer's own array is the dependency: `?? []` would be a new array every render and re-run the effect each time.
    const answered = data?.boards
    const boards = answered ?? []
    const [ownId, setOwnId] = useState(() => latestBoardId(boards))
    const held = onBoard !== undefined
    const boardId = held ? heldId : ownId
    const choose = held ? onBoard : setOwnId
    // A new answer (a reload, the next board landing) opens on its latest board — unless the one on screen is still there.
    useEffect(() => {
        const list = answered ?? []
        if (held) { if (!list.some(b => b.id === heldId)) onBoard(latestBoardId(list)) }
        else setOwnId(id => (list.some(b => b.id === id) ? id : latestBoardId(list)))
    }, [answered])   // eslint-disable-line react-hooks/exhaustive-deps -- a new answer is the only trigger; the held id is read, not watched

    if (data?.status === 'loading' || data?.status === 'idle') return <p className="floor-empty">Loading the day boards…</p>
    if (data?.status === 'error') {
        return (
            <p className="floor-empty">
                The day boards could not be loaded. <button type="button" className="cal-nav__btn" onClick={onRetry}>Try again</button>
            </p>
        )
    }
    const note = dayBoardsNote(data, now(), { day })
    if (note.empty) return <p className="floor-empty">{note.empty}</p>
    const ordered = orderedBoards(boards)
    const board = ordered.find(b => b.id === boardId) ?? ordered[ordered.length - 1]
    const rows = board.rows ?? []
    const span = quotedSpan(rows)
    const label = DAY_BOARD_LABEL[board.checkpoint] ?? board.checkpoint

    // A row's page, in place of the table.
    if (focus) {
        const r = rows.find(x => x.symbol === focus)
        if (!r) return <p className="floor-empty">{focus} is not on the {label} board.</p>
        return (
            <HotlistRowPage symbol={r.symbol} name={r.name ?? null} horizon="intraday" facts={dayFacts(r, label, board.checkpoint)}>
                <DayDetail row={r} board={board} label={label} onBuild={onBuild} />
            </HotlistRowPage>
        )
    }

    return (
        <div className="hot-day">
            <div className="hot-meta">
                {/* Toggle buttons, like the other filters (CR 2026-11-11: tab roles promised keyboard behaviour they lacked). */}
                <div className="hot-status-filter" role="group" aria-label="Day boards">
                    {ordered.map(b => (
                        <button key={b.id} type="button" aria-pressed={b.id === board.id} title={DAY_BOARD_TITLE[b.checkpoint]}
                            className={`hot-status-filter__btn${b.id === board.id ? ' hot-status-filter__btn--on' : ''}`}
                            onClick={() => choose(b.id)}>{DAY_BOARD_LABEL[b.checkpoint] ?? b.checkpoint} {(b.rows ?? []).length}</button>
                    ))}
                </div>
            </div>
            {note.stale && <p className="hot-note">{note.stale}</p>}
            {board.status === 'partial' && <p className="hot-note hot-note--warn">This board stopped early (the data provider’s limit) — it lists the names it reached.</p>}
            <p className="hot-note">
                In play on the {label} board: {DAY_BOARD_RULE[board.checkpoint] ?? 'moving up so far'} — moving up so far, not a call on
                where it goes. {span ? `Quoted ${span} ET, not live.` : 'Not live.'}
            </p>
            {!rows.length
                ? <p className="floor-empty">No names in play on the {label} board.</p>
                : (
                    <div className="hot-table-wrap hot-table-wrap--list">
                        <table className="hot-table hot-table--list hot-table--day">
                            <thead>
                                <tr>
                                    <th scope="col" className="hot-table__star"><span className="hot-sr">Details</span></th>
                                    <th scope="col">Sym</th>
                                    <th scope="col" className="hot-table__num" title="The price when the board quoted it — not live">Last</th>
                                    <th scope="col" className="hot-table__num" title="Change from the previous close">Chg%</th>
                                    <th scope="col" className="hot-table__num hot-col--more" title="Volume against an ordinary day so far (before the open: % of a day)">Vol</th>
                                    <th scope="col" className="hot-table__num hot-col--more" title="Average daily range, % of price">ATR%</th>
                                    <th scope="col" title="Its freshest headline since the last close (ET), and a report or rating change">Why — the news</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => <DayRow key={r.symbol} row={r} day={board.day ?? null} onSymbolClick={onSymbolClick} onOpen={onOpen ? () => onOpen(r.symbol) : null} />)}
                            </tbody>
                        </table>
                    </div>
                )}
        </div>
    )
}
HotlistDayBoards.propTypes = {
    data: PropTypes.shape({ status: PropTypes.string, day: PropTypes.string, boards: PropTypes.array }),
    day: PropTypes.string, boardId: PropTypes.string, onBoard: PropTypes.func,
    onSymbolClick: PropTypes.func, onRetry: PropTypes.func, now: PropTypes.func,
    focus: PropTypes.string, onOpen: PropTypes.func, onBuild: PropTypes.func,
}

/** A row's numbers as the page's tiles. Pure. */
function dayFacts(r, label, checkpoint) {
    return [
        ['Last', Number.isFinite(r.price) ? r.price.toFixed(2) : null, null, 'The price when the board quoted it — not live'],
        ['Chg%', gapText(r), Number.isFinite(r.gap_pct) ? (r.gap_pct >= 0 ? 'hot-up' : 'hot-down') : null, 'Change from the previous close'],
        ['Vol', volText(r), null, 'Volume against an ordinary day so far'],
        ['ATR%', Number.isFinite(r.atr_pct) ? r.atr_pct.toFixed(1) : null, null, 'Average daily range, % of price'],
        ['Board', label, null, DAY_BOARD_TITLE[checkpoint] ?? null],
    ]
}

/** The headline and its flags — the row's why. */
function Catalyst({ cat }) {
    return (
        <>
            {cat.title && <span title={cat.more ? `${cat.more} more headline${cat.more === 1 ? '' : 's'} since the last close — open the row` : undefined}>
                {cat.time && <span className="hot-dim">{cat.time} </span>}{cat.title}</span>}
            {cat.flags.map(f => <span key={f} className="hot-day-flag">{f}</span>)}
        </>
    )
}
Catalyst.propTypes = { cat: PropTypes.object.isRequired }

function DayRow({ row, day = null, onSymbolClick, onOpen = null }) {
    const cat = catalystCell(row, day)
    const dash = <span className="hot-dim">—</span>
    // A click anywhere on the row opens its page — except on its own buttons (the symbol opens the chart).
    const onRowClick = onOpen ? (e) => { if (!e.target.closest('button')) onOpen() } : undefined
    return (
        <tr className={`hot-row hot-row--line${onOpen ? ' hot-row--open' : ''}`} data-symbol={row.symbol} onClick={onRowClick}>
            <td className="hot-table__star">
                {onOpen && <button type="button" className="hot-toggle" aria-label={`Details for ${row.symbol}`} onClick={onOpen}>›</button>}
            </td>
            <td><button type="button" className="hot-sym" onClick={() => onSymbolClick?.(row.symbol)} title={row.name ?? row.symbol}>{row.symbol}</button><OwnedBadge symbol={row.symbol} /></td>
            <td className="hot-table__num">{Number.isFinite(row.price) ? row.price.toFixed(2) : dash}</td>
            <td className="hot-table__num">{gapText(row) ?? dash}</td>
            <td className="hot-table__num hot-col--more">{volText(row) ?? dash}</td>
            <td className="hot-table__num hot-col--more">{Number.isFinite(row.atr_pct) ? row.atr_pct.toFixed(1) : dash}</td>
            <td className="hot-day-why">{cat ? <Catalyst cat={cat} /> : <span className="hot-dim">no fresh headline</span>}</td>
        </tr>
    )
}
DayRow.propTypes = { row: PropTypes.object.isRequired, day: PropTypes.string, onSymbolClick: PropTypes.func, onOpen: PropTypes.func }

/** The row's page body: why it is in play, every headline since the last close, and the hand-off to Mentor. */
function DayDetail({ row, board, label, onBuild = null }) {
    const news = Array.isArray(row.catalyst?.news) ? row.catalyst.news : []
    const flags = [row.catalyst?.earnings && 'reported earnings', row.catalyst?.rating && 'a rating change'].filter(Boolean)
    return (
        <div className="hot-detail">
            <p className="hot-detail__line">In play on the {label} board: {DAY_BOARD_RULE[board.checkpoint] ?? 'moving up so far'}.{row.why?.length ? ` ${row.why.join('; ')}.` : ''}</p>
            {flags.length > 0 && <p className="hot-detail__line">Since the last close: {flags.join(' and ')}.</p>}
            {news.length > 0
                ? <ul className="hot-day-news">{news.map((n, i) => <li key={i}><span className="hot-dim">{headlineTime(n.at, board.day ?? null)} </span>{n.title}</li>)}</ul>
                : <p className="hot-detail__line hot-dim">No headline since the last close.</p>}
            <div className="hot-detail__actions">
                {onBuild && (
                    <button type="button" className="floor-queued__btn" onClick={() => onBuild(row, board.checkpoint, { id: board.id })}
                        title="Build an intraday setup in the chat">Build a setup</button>
                )}
            </div>
        </div>
    )
}
DayDetail.propTypes = { row: PropTypes.object.isRequired, board: PropTypes.object.isRequired, label: PropTypes.string.isRequired, onBuild: PropTypes.func }
