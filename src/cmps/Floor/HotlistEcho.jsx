import { Fragment, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { ECHO_HORIZONS, STATUS, pct, tone, modelDirection, directionLine, recordLine } from './echo.utils.js'

// ECHO IN THE HOTLIST (docs/design/echo-desk.md, Roy 2026-11-19: "Hotlist, labelled"). The engine's forward test: a model
// maps each big earnings move to the companies it reaches through the supply chain, the day-5 market check flags the
// links the market has not caught up with, and the market grades them at 20 / 60 / 120 sessions. UNPROVEN — the filing
// backtest found no edge — so the tab says so first, and the record is "so far", never the verdict.

function LinkRows({ links, onSymbolClick }) {
    return links.map((l, i) => {
        const own = modelDirection(l.note)
        return (
            <tr key={`${l.ticker ?? l.name}-${i}`} className={`hot-row${l.group === 'flagged' ? ' hot-row--pick' : ''}`}>
                <td>
                    {l.ticker
                        ? <button type="button" className="hot-sym" onClick={() => onSymbolClick?.(l.ticker)} title={l.name}>{l.ticker}</button>
                        : <span className="hot-dim" title="No US listing — kept, not priced">{l.name}</span>}
                </td>
                <td title={l.why}>{l.relation}{l.group === 'flagged' && <span className="echo-flag"> · lagging</span>}</td>
                <td title={own && own !== l.direction ? `The model said ${own}; the direction follows the move` : undefined}>{l.direction}</td>
                <td className={`hot-table__num ${tone(l.reaction)}`}>{pct(l.reaction)}</td>
                {ECHO_HORIZONS.map(h => <td key={h} className={`hot-table__num ${tone(l.spread?.[h])}`}>{pct(l.spread?.[h])}</td>)}
            </tr>
        )
    })
}

function EventDetail({ id, onSymbolClick }) {
    const [state, setState] = useState({ status: 'loading' })
    const [all, setAll] = useState(false)
    useEffect(() => {
        let alive = true
        hotlistService.getEchoEvent(id)
            .then(ev => { if (alive) setState({ status: 'ok', ev }) })
            .catch(() => { if (alive) setState({ status: 'error' }) })
        return () => { alive = false }
    }, [id])
    if (state.status === 'loading') return <p className="hot-note">Loading the map…</p>
    if (state.status === 'error') return <p className="hot-note hot-note--warn">The map could not be read.</p>
    const ev = state.ev
    if (!ev.all?.length) return <p className="hot-note">{STATUS[ev.status]?.[1] ?? 'No map.'}</p>
    const checked = ev.all.some(l => l.group)
    const shown = all || !checked ? ev.all : ev.all.filter(l => l.group === 'flagged')
    return (
        <div className="echo-detail">
            <p className="hot-note">{ev.size}. {directionLine(ev)}</p>
            {checked && !shown.length && <p className="hot-note">No link was lagging at the day-5 check.</p>}
            {shown.length > 0 && (
                <div className="hot-table-wrap">
                <table className="hot-table hot-table--list echo-links">
                    <thead>
                        <tr>
                            <th scope="col">Name</th><th scope="col">Link</th><th scope="col">Direction</th>
                            <th scope="col" className="hot-table__num" title="Against SPY through the 5th session, signed by the direction">Day 5</th>
                            {ECHO_HORIZONS.map(h => <th key={h} scope="col" className="hot-table__num" title={`From the day-5 close to ${h} sessions, against SPY and minus the same-sector stand-ins`}>{h}d</th>)}
                        </tr>
                    </thead>
                    <tbody><LinkRows links={shown} onSymbolClick={onSymbolClick} /></tbody>
                </table>
                </div>
            )}
            {checked && (
                <button type="button" className="toggle-chip" aria-pressed={all} onClick={() => setAll(a => !a)}>
                    {all ? 'Lagging only' : `All ${ev.all.length} links`}
                </button>
            )}
            <p className="hot-note hot-dim">Mapped by {ev.map?.model ?? 'the model'} · prompt {ev.map?.promptVersion ?? '—'}</p>
        </div>
    )
}
EventDetail.propTypes = { id: PropTypes.string.isRequired, onSymbolClick: PropTypes.func }

/** The Echo tab: the label, the record so far, the events newest first — one opened at a time, its links below it. */
export function HotlistEcho({ onSymbolClick }) {
    const [data, setData] = useState({ status: 'loading' })
    const [open, setOpen] = useState(null)
    const [tick, setTick] = useState(0)
    useEffect(() => {
        let alive = true
        hotlistService.getEcho()
            .then(d => { if (alive) setData({ status: 'ok', ...d }) })
            .catch(() => { if (alive) setData({ status: 'error' }) })
        return () => { alive = false }
    }, [tick])

    return (
        <section className="echo" aria-label="Echo — forward test">
            <p className="echo-label"><strong>Forward test — unproven.</strong> Companies a big earnings move reaches through the supply
                chain, flagged when the market had not caught up by the 5th session. The test is still running: these are not picks.</p>
            {data.status === 'loading' && <p className="hot-note">Loading…</p>}
            {data.status === 'error' && <p className="hot-note hot-note--warn">Echo could not be read. <button type="button" className="hot-sym" onClick={() => setTick(n => n + 1)}>Retry</button></p>}
            {data.status === 'ok' && <>
                <p className="hot-note">{recordLine(data.record)}</p>
                {!data.events.length
                    ? <p className="floor-empty">No events yet — the engine looks every weekday night.</p>
                    : (
                        <div className="hot-table-wrap">
                            <table className="hot-table hot-table--list echo-events">
                                <thead>
                                    <tr>
                                        <th scope="col">Date</th><th scope="col">Event</th><th scope="col">Where</th>
                                        <th scope="col" className="hot-table__num">Lagging</th>
                                        {ECHO_HORIZONS.map(h => <th key={h} scope="col" className="hot-table__num" title={`The lagging links against their stand-ins, ${h} sessions on`}>{h}d</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.events.map(e => {
                                        const [word, why] = STATUS[e.status] ?? [e.status, '']
                                        const isOpen = open === e.id
                                        return (
                                            <Fragment key={e.id}>
                                                <tr className="hot-row hot-row--line" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
                                                    <td>{e.date}</td>
                                                    <td title={e.size}>{e.tickers?.join(' · ') || e.origin} <span className="hot-dim">{e.effect === 'up' ? '▲' : '▼'}</span></td>
                                                    <td title={why}>{word}</td>
                                                    <td className="hot-table__num">{e.status === 'checked' || e.status === 'done' ? `${e.flagged.length} of ${e.links}` : e.links ? `${e.links} links` : '—'}</td>
                                                    {ECHO_HORIZONS.map(h => <td key={h} className={`hot-table__num ${tone(e.spread?.[h])}`}>{pct(e.spread?.[h])}</td>)}
                                                </tr>
                                                {isOpen && (
                                                    <tr className="hot-note-row echo-open">
                                                        <td colSpan={4 + ECHO_HORIZONS.length}><EventDetail id={e.id} onSymbolClick={onSymbolClick} /></td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
            </>}
        </section>
    )
}
HotlistEcho.propTypes = { onSymbolClick: PropTypes.func }
