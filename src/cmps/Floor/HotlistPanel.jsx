import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { useDetailPanel } from '../DetailPanel/detailPanel.store.js'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import {
    COLUMN_LABEL, COLUMN_TITLE, CHECKPOINT_LABEL, fmtRange, rangeTitle, bestColumn, catalystChip,
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

export const HOTLIST_PANEL_ID = 'hotlist'

const _day = (iso) => {
    if (!iso) return ''
    const d = new Date(`${iso}T12:00:00Z`)
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function HotlistPanel({ onBuild, onAsk, onSymbolClick }) {
    const { isOpen, close } = useDetailPanel(HOTLIST_PANEL_ID)
    const [today, setToday] = useState({ status: 'idle', day: null, checkpoints: [] })
    const [boardId, setBoardId] = useState(null)
    const [board, setBoard] = useState({ status: 'idle', data: null })
    const [picksOnly, setPicksOnly] = useState(false)
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
                setToday({ status: 'ok', day: d.day, checkpoints: d.checkpoints })
                wanted.current = d.latest?.id ?? null
                if (d.latest) { seen.current.set(d.latest.id, d.latest); setBoardId(d.latest.id); setBoard({ status: 'ok', data: d.latest }) }
                else { setBoardId(null); setBoard({ status: 'ok', data: null }) }
            },
            () => { if (live) { setToday(t => ({ ...t, status: 'error' })); setBoard({ status: 'idle', data: null }) } },
        )
        return () => { live = false }
    }, [isOpen, retry])

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
    const title = b ? `${_day(b.day)} · ${CHECKPOINT_LABEL[b.checkpoint] ?? b.checkpoint}` : 'Today'
    const actions = today.checkpoints.length > 1 ? (
        <div className="hot-nav" role="tablist" aria-label="Today's checkpoints">
            {today.checkpoints.map(c => (
                <button key={c.id} type="button" role="tab" aria-selected={c.id === boardId}
                    className={`hot-nav__btn${c.id === boardId ? ' hot-nav__btn--on' : ''}`} onClick={() => pickBoard(c.id)}>
                    {CHECKPOINT_LABEL[c.checkpoint] ?? c.checkpoint}
                </button>
            ))}
        </div>
    ) : null

    return (
        <DetailPanel id={HOTLIST_PANEL_ID} kicker="Hotlist" title={title} actions={actions} className="hot-panel">
            <Body today={today} board={board} picksOnly={picksOnly} setPicksOnly={setPicksOnly}
                onRetry={() => setRetry(n => n + 1)} onSymbolClick={onSymbolClick}
                onBuild={handOff(onBuild)} onAsk={handOff(onAsk)} />
        </DetailPanel>
    )
}
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
        return <p className="floor-empty">No hotlist yet. On trading days the screener publishes boards at 08:00 and 09:20 ET (the open and this week), then 10:30, 14:30 and 15:30.</p>
    }

    const columns = b.columns ?? []
    const rows = (b.rows ?? []).filter(r => !picksOnly || r.pick)
    const picks = (b.rows ?? []).filter(r => r.pick).length
    const regime = b.regime ?? {}

    return (
        <div className="hot-board">
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

const _pct = (n) => (Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(1)}%` : '—')

function Row({ row, board, columns, onBuild, onAsk, onSymbolClick }) {
    const col = bestColumn(row, columns)
    const cat = catalystChip(row.catalyst)
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
                <td className="hot-table__num">{Number.isFinite(row.price) ? row.price.toFixed(2) : '—'}</td>
                <td className={`hot-table__num${row.gap_pct > 0 ? ' hot-up' : row.gap_pct < 0 ? ' hot-down' : ''}`}>{_pct(row.gap_pct)}</td>
                <td className="hot-table__num">{vol}</td>
                <td>
                    {cat ? <span className={`hot-cat${row.catalyst?.material ? ` hot-cat--${row.catalyst.surprise}` : ''}`} title={row.catalyst?.headline ?? undefined}>{cat}</span> : <span className="hot-dim">—</span>}
                    {row.fade_check && <span className="hot-flag" title="A minor story under a big gap — a fade candidate as much as a follow-through">fade?</span>}
                    {row.next_earnings && <span className="hot-dim hot-earn" title="Next earnings">E {row.next_earnings.slice(5)}</span>}
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
                    <td colSpan={columns.length + 6} className="hot-row__note">{note}</td>
                </tr>
            )}
        </>
    )
}
Row.propTypes = {
    row: PropTypes.object.isRequired, board: PropTypes.object.isRequired, columns: PropTypes.array.isRequired,
    onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func,
}
