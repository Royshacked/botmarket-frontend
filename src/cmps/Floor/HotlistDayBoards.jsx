import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { OwnedBadge } from '../OwnedBadge/OwnedBadge.jsx'
import {
    DAY_BOARD_LABEL, DAY_BOARD_TITLE, quotedSpan, latestBoardId, orderedBoards, volText, gapText, catalystCell, dayBoardsNote,
} from './hotlistDay.utils.js'

// THE INTRADAY TAB (botmarket-backend services/hotlist.day.js; docs/design/argus-rework.md §3.3 — revived 2026-11-11):
// the day's boards, 09:20 · 10:30 · 14:30 ET, one at a time, opening on the latest. Each row is a name IN PLAY — moving
// up so far — with the numbers, why, and its freshest headline. No grade, no room, no result, no Argus pick: the boards
// say a name is moving, not where it goes. A symbol opens its chart; a name goes to Mentor by the user's own words for
// now (a board → Mentor hand-off comes with the chain flow).
//
// The board on screen can be HELD BY THE PANEL (`boardId` + `onBoard`), so a trip to a chart and back keeps it (CR
// 2026-11-11); without them the component holds it itself. `day` is the day the panel asked for (null = the latest).

export function HotlistDayBoards({ data, day = null, boardId: heldId, onBoard, onSymbolClick, onRetry, now = Date.now }) {
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
                In play: moving up so far — not a call on where it goes. {span ? `Quoted ${span} ET, not live.` : 'Not live.'}
            </p>
            {!rows.length
                ? <p className="floor-empty">No names in play on the {DAY_BOARD_LABEL[board.checkpoint] ?? board.checkpoint} board.</p>
                : (
                    <div className="hot-table-wrap hot-table-wrap--list">
                        <table className="hot-table hot-table--list hot-table--day">
                            <thead>
                                <tr>
                                    <th scope="col">Sym</th>
                                    <th scope="col" className="hot-table__num" title="The price when the board quoted it — not live">Last</th>
                                    <th scope="col" className="hot-table__num" title="Change from the previous close">Chg%</th>
                                    <th scope="col" className="hot-table__num hot-col--more" title="Volume against an ordinary day so far (before the open: % of a day)">Vol</th>
                                    <th scope="col" className="hot-table__num hot-col--more" title="Average daily range, % of price">ATR%</th>
                                    <th scope="col" title="Why it is in play">Why</th>
                                    <th scope="col" className="hot-col--more" title="Its freshest headline since the last close (ET), and a report or rating change">News</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => <DayRow key={r.symbol} row={r} onSymbolClick={onSymbolClick} />)}
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
}

/** The headline and its flags — in the News column, and under Why on a phone, where News is hidden (CR 2026-11-11). */
function Catalyst({ cat }) {
    return (
        <>
            {cat.title && <span title={cat.more ? `${cat.more} more headline${cat.more === 1 ? '' : 's'} since the last close` : undefined}>
                {cat.time && <span className="hot-dim">{cat.time} </span>}{cat.title}</span>}
            {cat.flags.map(f => <span key={f} className="hot-day-flag">{f}</span>)}
        </>
    )
}
Catalyst.propTypes = { cat: PropTypes.object.isRequired }

function DayRow({ row, onSymbolClick }) {
    const cat = catalystCell(row)
    const dash = <span className="hot-dim">—</span>
    return (
        <tr className="hot-row" data-symbol={row.symbol}>
            <td><button type="button" className="hot-sym" onClick={() => onSymbolClick?.(row.symbol)} title={row.name ?? row.symbol}>{row.symbol}</button><OwnedBadge symbol={row.symbol} /></td>
            <td className="hot-table__num">{Number.isFinite(row.price) ? row.price.toFixed(2) : dash}</td>
            <td className="hot-table__num">{gapText(row) ?? dash}</td>
            <td className="hot-table__num hot-col--more">{volText(row) ?? dash}</td>
            <td className="hot-table__num hot-col--more">{Number.isFinite(row.atr_pct) ? row.atr_pct.toFixed(1) : dash}</td>
            <td>
                {row.why?.length ? row.why.join('; ') : dash}
                {cat && <div className="hot-day-news-sm"><Catalyst cat={cat} /></div>}
            </td>
            <td className="hot-col--more">{cat ? <Catalyst cat={cat} /> : dash}</td>
        </tr>
    )
}
DayRow.propTypes = { row: PropTypes.object.isRequired, onSymbolClick: PropTypes.func }
