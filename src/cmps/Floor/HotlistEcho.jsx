import { Fragment, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { ECHO_HORIZONS, STATUS, pct, tone, modelDirection, directionLine, recordLine, linkFacts, echoLine } from './echo.utils.js'
import { CoverageRating, CoverageMeta, CoverageDetail } from './CoverageDetail.jsx'
import { PriceTarget } from '../PriceTarget/PriceTarget.jsx'
import { HotlistRowPage } from './HotlistRowPage.jsx'

// ECHO IN THE HOTLIST (docs/design/echo-desk.md, Roy 2026-11-19: "Hotlist, labelled"). The engine's forward test: a model
// maps each big earnings move to the companies it reaches through the supply chain, the day-5 market check flags the
// links the market has not caught up with, and the market grades them at 20 / 60 / 120 sessions. UNPROVEN — the filing
// backtest found no edge — so the tab says so first, and the record is "so far", never the verdict.
//
// THE READS (echo-desk.md §6): a lagging name goes to the analyst (swing coverage) and the technical analyst (its
// measured profile) after the day-5 check. The links table carries the analyst's rating and target where he covers
// the name; a name clicked opens its page like any Hotlist row — how it trades (the profile, swing), the chart, the
// analyst's thesis — with why Echo linked it.

function LinkRows({ links, coverageOf, onOpen }) {
    return links.map((l, i) => {
        const own = modelDirection(l.note)
        const cov = l.ticker ? coverageOf(l.ticker) : null
        return (
            <tr key={`${l.ticker ?? l.name}-${i}`} className={`hot-row${l.group === 'flagged' ? ' hot-row--pick' : ''}`} data-symbol={l.ticker ?? undefined}>
                <td>
                    {l.ticker
                        ? <button type="button" className="hot-sym" onClick={() => onOpen?.(l.ticker)} title={`${l.name} — open its page`}>{l.ticker}</button>
                        : <span className="hot-dim" title="No US listing — kept, not priced">{l.name}</span>}
                </td>
                <td title={l.why}>{l.relation}{l.group === 'flagged' && <span className="echo-flag"> · lagging</span>}</td>
                {/* The model's own call, where it differs, IN the cell — a phone has no hover (2026-11-19). */}
                <td>{l.direction}{own && own !== l.direction && <span className="echo-own"> model: {own}</span>}</td>
                <td className={`hot-table__num ${tone(l.reaction)}`}>{pct(l.reaction)}</td>
                {ECHO_HORIZONS.map(h => <td key={h} className={`hot-table__num ${tone(l.spread?.[h])}`}>{pct(l.spread?.[h])}</td>)}
                <td className="echo-cov">{cov ? <><CoverageRating coverage={cov} />{cov.price_target?.value != null && <> <PriceTarget priceTarget={cov.price_target} gap={cov.gap} /></>}</> : <span className="hot-dim">—</span>}</td>
            </tr>
        )
    })
}

function EventDetail({ id, coverageOf, onOpen, onLoaded, onAsk = null }) {
    const [state, setState] = useState({ status: 'loading' })
    const [all, setAll] = useState(false)
    useEffect(() => {
        let alive = true
        hotlistService.getEchoEvent(id)
            .then(ev => { if (alive) { setState({ status: 'ok', ev }); onLoaded?.(ev) } })
            .catch(() => { if (alive) setState({ status: 'error' }) })
        return () => { alive = false }
    // onLoaded is the parent's setter wrapper; the map is read once per event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                            <th scope="col" title="The analyst's rating and target, where he covers the name — a lagging name goes to him after the day-5 check">Analyst</th>
                        </tr>
                    </thead>
                    <tbody><LinkRows links={shown} coverageOf={coverageOf} onOpen={onOpen} /></tbody>
                </table>
                </div>
            )}
            {checked && (
                <button type="button" className="toggle-chip" aria-pressed={all} onClick={() => setAll(a => !a)}>
                    {all ? 'Lagging only' : `All ${ev.all.length} links`}
                </button>
            )}
            <p className="hot-note hot-dim">Mapped by {ev.map?.model ?? 'the model'} · prompt {ev.map?.promptVersion ?? '—'}</p>
            {/* The event analyst on THIS event (echo-desk.md §5) — handed off like Build, the Hotlist kept to come back to. */}
            {onAsk && <button type="button" className="toggle-chip echo-ask" onClick={() => onAsk(ev)}>Ask about this event</button>}
        </div>
    )
}
EventDetail.propTypes = { id: PropTypes.string.isRequired, coverageOf: PropTypes.func.isRequired, onOpen: PropTypes.func, onLoaded: PropTypes.func, onAsk: PropTypes.func }

/** A linked name's page: why Echo linked it, the analyst's thesis, and (HotlistRowPage) how it trades and its chart. */
function LinkPage({ ev, link, coverage, onAsk = null }) {
    return (
        <HotlistRowPage symbol={link.ticker} name={link.name ?? null} horizon="swing" facts={linkFacts(link)}>
            <div className="hot-detail">
                <p className="hot-detail__line"><b>From Echo{link.group === 'flagged' ? ' — lagging at day 5' : ''}:</b> {echoLine(ev, link)}</p>
                <p className="hot-detail__line hot-dim">A forward test, still running — not a pick.</p>
                {coverage
                    ? <>
                        <p className="hot-detail__line echo-analyst"><b>Analyst:</b> <CoverageMeta coverage={coverage} /></p>
                        <CoverageDetail coverage={coverage} />
                    </>
                    : <p className="hot-detail__line hot-dim">{link.group === 'flagged'
                        ? 'Not covered yet — a lagging name goes to the analyst for swing coverage after the day-5 check.'
                        : 'Not covered by the analyst.'}</p>}
                {onAsk && <div className="hot-detail__actions"><button type="button" className="floor-queued__btn" onClick={() => onAsk(ev)}>Ask about this event</button></div>}
            </div>
        </HotlistRowPage>
    )
}
LinkPage.propTypes = { ev: PropTypes.object.isRequired, link: PropTypes.object.isRequired, coverage: PropTypes.object, onAsk: PropTypes.func }

/**
 * The Echo tab: the label, the record so far, the events newest first — one opened at a time, its links below it. A
 * name clicked opens its page in the panel (`focus` / `onOpen`, the panel's — its header has the way back); without
 * them (a standalone render) the name opens its chart.
 */
export function HotlistEcho({ onSymbolClick, onAsk = null, coverage = [], focus = null, onOpen = null }) {
    const [data, setData] = useState({ status: 'loading' })
    const [open, setOpen] = useState(null)
    const [tick, setTick] = useState(0)
    // The opened event's map, kept here so a name's page (which replaces the table) has its link.
    const [detail, setDetail] = useState(null)
    useEffect(() => {
        let alive = true
        hotlistService.getEcho()
            .then(d => { if (alive) setData({ status: 'ok', ...d }) })
            .catch(() => { if (alive) setData({ status: 'error' }) })
        return () => { alive = false }
    }, [tick])
    const bySymbol = new Map((coverage ?? []).map(c => [String(c?.symbol ?? '').toUpperCase(), c]))
    const coverageOf = (s) => bySymbol.get(String(s).toUpperCase()) ?? null
    const openName = onOpen ?? onSymbolClick

    if (focus) {
        const link = detail?.ev?.id === open ? detail.ev.all?.find(l => l.ticker === focus) : null
        if (!link) return <p className="floor-empty">{focus} is not on the opened event’s map.</p>
        return <LinkPage ev={detail.ev} link={link} coverage={coverageOf(focus)} onAsk={onAsk} />
    }

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
                                        const toggle = () => setOpen(isOpen ? null : e.id)
                                        const who = e.tickers?.join(' / ') || e.origin || e.id
                                        return (
                                            <Fragment key={e.id}>
                                                {/* The row opens on a click; the button is the way in by keyboard and the one a screen reader announces. */}
                                                <tr className="hot-row hot-row--line" onClick={toggle}>
                                                    <td>
                                                        <button type="button" className="hot-toggle" aria-expanded={isOpen} aria-label={`${who} event of ${e.date}`}
                                                            onClick={(ev) => { ev.stopPropagation(); toggle() }}>{isOpen ? '▾' : '›'}</button>
                                                        {' '}{e.date}
                                                    </td>
                                                    <td title={e.size}>{e.tickers?.join(' · ') || e.origin} <span className="hot-dim">{e.effect === 'up' ? '▲' : '▼'}</span></td>
                                                    <td title={why}>{word}</td>
                                                    <td className="hot-table__num">{e.status === 'checked' || e.status === 'done' ? `${e.flagged.length} of ${e.links}` : e.links ? `${e.links} links` : '—'}</td>
                                                    {ECHO_HORIZONS.map(h => <td key={h} className={`hot-table__num ${tone(e.spread?.[h])}`}>{pct(e.spread?.[h])}</td>)}
                                                </tr>
                                                {isOpen && (
                                                    <tr className="hot-note-row echo-open">
                                                        <td colSpan={4 + ECHO_HORIZONS.length}><EventDetail id={e.id} coverageOf={coverageOf} onOpen={openName} onLoaded={(ev) => setDetail({ ev })} onAsk={onAsk} /></td>
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
HotlistEcho.propTypes = { onSymbolClick: PropTypes.func, onAsk: PropTypes.func, coverage: PropTypes.array, focus: PropTypes.string, onOpen: PropTypes.func }
