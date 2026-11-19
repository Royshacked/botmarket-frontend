import { Fragment, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { STATUS, FLAG, FACTORS, TYPE_WORDS, GRADE_HORIZONS, isFlag, words, pct, tone, evidenceWords, recordLine, linkFacts, echoLine, echoHandoff, yardLine } from './echo.utils.js'
import { CoverageRating, CoverageMeta, CoverageDetail } from './CoverageDetail.jsx'
import { PriceTarget } from '../PriceTarget/PriceTarget.jsx'
import { HotlistRowPage } from './HotlistRowPage.jsx'

// ECHO IN THE HOTLIST (backend docs/design/echo-pipeline.md; Roy 2026-11-19: "Echo aligned with the design"). Every event —
// the house's (the intake reads earnings, 8-Ks, policy, defense awards, trials, news) and the user's own — is mapped
// through the supply chain, every link SCORED on the simulator's six factors (high at 8 of 12), checked at the 5th session
// (the flags: underreacted winner, overreacted loser, fully priced), watched for follow-ups, and graded against
// same-sector stand-ins. The links come RANKED: flags first, then score. A name opens its page — why it scores, factor by
// factor with the evidence; how it trades; the analyst's read — and goes to the trader (Step 6) or the event analyst.
// UNPROVEN until the validation has its events: the tab says so first.

function LinkRows({ links, coverageOf, onOpen }) {
    return links.map((l, i) => {
        const cov = l.ticker ? coverageOf(l.ticker) : null
        return (
            <tr key={`${l.ticker}-${i}`} className={`hot-row${isFlag(l.flag) ? ' hot-row--pick' : ''}`} data-symbol={l.ticker}>
                <td><button type="button" className="hot-sym" onClick={() => onOpen?.(l.ticker)} title={`${l.name} — open its page`}>{l.ticker}</button></td>
                <td title={l.why}>{words(l.relation)} <span className="hot-dim">L{l.layer}</span></td>
                <td>{l.direction}</td>
                <td className={`hot-table__num${l.high ? ' hot-up' : ''}`} title="Six factors, 0–2 each; high at 8 of 12">{l.total ?? '—'}{l.high ? ' ★' : ''}</td>
                <td className="echo-evidence" title={l.filings?.excerpt ?? undefined}>{evidenceWords(l.filings)}</td>
                <td className={`hot-table__num ${tone(l.check?.signedMove)}`}>{pct(l.check?.signedMove)}</td>
                <td title={l.flagWhy ?? undefined}>{l.flag ? <span className={isFlag(l.flag) ? 'echo-flag' : 'hot-dim'}>{FLAG[l.flag]?.[0] ?? words(l.flag)}</span> : <span className="hot-dim">—</span>}</td>
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
    // onLoaded is the parent's setter wrapper; the event is read once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])
    if (state.status === 'loading') return <p className="hot-note">Loading the event…</p>
    if (state.status === 'error') return <p className="hot-note hot-note--warn">The event could not be read.</p>
    const ev = state.ev
    const e = ev.event
    const SHOWN = 12
    const shown = all ? ev.links : ev.links.slice(0, SHOWN)
    return (
        <div className="echo-detail">
            <p className="hot-note"><b>{e.whatChanged}.</b>{e.size ? ` ${e.size}.` : ''}{e.durability?.kind ? <> Durability: <b>{words(e.durability.kind)}</b>{e.durability.why ? ` — ${e.durability.why}` : ''}.</> : null}</p>
            {ev.checked
                ? <p className="hot-note">{yardLine(ev.checked)}</p>
                : ev.links.length > 0 && <p className="hot-note hot-dim">{ev.waiting ?? STATUS[ev.status]?.[1] ?? ''}</p>}
            {ev.error && <p className="hot-note hot-note--warn">Stopped: {ev.error}</p>}
            {!ev.links.length
                ? <p className="hot-note">{STATUS[ev.status]?.[1] ?? 'No map yet.'}</p>
                : (
                    <div className="hot-table-wrap">
                        <table className="hot-table hot-table--list echo-links">
                            <thead>
                                <tr>
                                    <th scope="col">Name</th><th scope="col">Link</th><th scope="col">Direction</th>
                                    <th scope="col" className="hot-table__num" title="Six factors, 0–2 each; high at 8 of 12">Score</th>
                                    <th scope="col" title="What the SEC filings say: a stated share of revenue, named, or not">Filings</th>
                                    <th scope="col" className="hot-table__num" title="Its move vs SPY through the 5th session, signed by its direction">Day 5</th>
                                    <th scope="col" title="The day-5 flags: underreacted winner, overreacted loser, fully priced">Flag</th>
                                    <th scope="col" title="The analyst's rating and target, where he covers the name">Analyst</th>
                                </tr>
                            </thead>
                            <tbody><LinkRows links={shown} coverageOf={coverageOf} onOpen={onOpen} /></tbody>
                        </table>
                    </div>
                )}
            {ev.links.length > SHOWN && (
                <button type="button" className="toggle-chip" aria-pressed={all} onClick={() => setAll(a => !a)}>
                    {all ? `Top ${SHOWN}` : `All ${ev.links.length} links`}
                </button>
            )}
            {ev.triggers?.length > 0 && <p className="hot-note">Wave watch: {ev.triggers.slice(-3).map(t => t.what).join(' · ')}</p>}
            <p className="hot-note hot-dim">{[ev.map ? `Mapped by ${ev.map.model}` : null, ev.scored ? `scored ${String(ev.scored.scoredAt).slice(0, 10)}` : null,
                ev.mine ? (ev.kind === 'house' ? 'yours — Echo took it as a house event' : 'your event') : `the house's (${words(e.source) || 'intake'})`].filter(Boolean).join(' · ')}</p>
            {onAsk && <button type="button" className="toggle-chip echo-ask" onClick={() => onAsk(ev)}>Ask about this event</button>}
        </div>
    )
}
EventDetail.propTypes = { id: PropTypes.string.isRequired, coverageOf: PropTypes.func.isRequired, onOpen: PropTypes.func, onLoaded: PropTypes.func, onAsk: PropTypes.func }

/** Why the link scores what it does: the six factors, each with its reason and evidence. */
function WhyItScores({ link }) {
    const f = link.factors
    if (!f) return <p className="hot-detail__line hot-dim">Not scored yet.</p>
    return (
        <section className="echo-factors" aria-label="Why it scores">
            <h3 className="echo-factors__title">Why it scores {link.total} / 12{link.high ? ' — high' : ''}</h3>
            <dl className="echo-factors__list">
                {FACTORS.map(([k, label, def]) => {
                    const x = f[k]
                    if (!x) return null
                    const tag = k === 'bottleneck' ? x.evidence : k === 'exposure' ? x.source : null
                    return (
                        <div key={k} className="echo-factor">
                            <dt title={def}><span className={`echo-factor__score echo-factor__score--${x.score}`}>{x.score}</span> {label}{tag ? <span className="hot-dim"> · {tag}</span> : null}</dt>
                            <dd>{x.why}{k === 'bottleneck' && x.quote ? <q className="echo-quote">{x.quote}</q> : null}</dd>
                        </div>
                    )
                })}
            </dl>
            {link.ledger?.conflicted && <p className="hot-detail__line hot-row__caution">Conflicted: other events pull it the other way ({link.ledger.events.map(e => e.origin).join(', ')}) — a weak trade.</p>}
            {link.filings?.excerpt && <p className="hot-detail__line"><b>Its filing:</b> <q className="echo-quote">{link.filings.excerpt}</q></p>}
            {link.supplySentences?.filter(s => !s.hedged).slice(0, 2).map((s, i) => (
                <p key={i} className="hot-detail__line"><b>Its {s.form} ({s.date}):</b> <q className="echo-quote">{s.text}</q></p>
            ))}
        </section>
    )
}
WhyItScores.propTypes = { link: PropTypes.object.isRequired }

/** A linked name's page: why it scores, the flag and the grades, the analyst's read; to the trader or the event analyst. */
function LinkPage({ ev, link, coverage, onAsk = null, onBuild = null }) {
    const grades = GRADE_HORIZONS.filter(h => Number.isFinite(link.grades?.[h]))
    return (
        <HotlistRowPage symbol={link.ticker} name={link.name ?? null} horizon="swing" facts={linkFacts(link)}>
            <div className="hot-detail">
                <p className="hot-detail__line"><b>From Echo{isFlag(link.flag) ? ` — ${FLAG[link.flag][0].toLowerCase()} at day 5` : ''}:</b> {echoLine(ev, link)}</p>
                {link.flagWhy && <p className="hot-detail__line">{link.flagWhy}.</p>}
                <WhyItScores link={link} />
                {grades.length > 0 && <p className="hot-detail__line">Since the day-5 close, its way vs SPY: {grades.map(h => `${h}d ${pct(link.grades[h])}`).join(' · ')}</p>}
                <p className="hot-detail__line hot-dim">Echo is unproven until its validation has the events — a lead, not a pick.</p>
                {coverage
                    ? <>
                        <p className="hot-detail__line echo-analyst"><b>Analyst:</b> <CoverageMeta coverage={coverage} /></p>
                        <CoverageDetail coverage={coverage} />
                    </>
                    : <p className="hot-detail__line hot-dim">{isFlag(link.flag) ? 'Not covered yet — a flagged name goes to the analyst for swing coverage after the day-5 check.' : 'Not covered by the analyst.'}</p>}
                <div className="hot-detail__actions">
                    {/* To the trader: the FLAGGED names only — the leads the doc's rules have levels for (CR 2026-11-19). */}
                    {onBuild && isFlag(link.flag) && <button type="button" className="floor-queued__btn" onClick={() => onBuild(echoHandoff(ev, link))}
                        title="The trader builds his regular setup, with Echo's facts and the simulator rules' levels as considerations">Build with the trader</button>}
                    {onAsk && <button type="button" className="floor-queued__btn" onClick={() => onAsk(ev)}>Ask about this event</button>}
                </div>
            </div>
        </HotlistRowPage>
    )
}
LinkPage.propTypes = { ev: PropTypes.object.isRequired, link: PropTypes.object.isRequired, coverage: PropTypes.object, onAsk: PropTypes.func, onBuild: PropTypes.func }

/**
 * The Echo tab: the label, the validation record so far, the events newest first — one opened at a time, its links
 * ranked below it. A name clicked opens its page in the panel (`focus` / `onOpen`, the panel's — its header has the way
 * back); without them (a standalone render) the name opens its chart.
 */
export function HotlistEcho({ onSymbolClick, onAsk = null, onBuild = null, coverage = [], focus = null, onOpen = null }) {
    const [data, setData] = useState({ status: 'loading' })
    const [open, setOpen] = useState(null)
    const [tick, setTick] = useState(0)
    // The opened event, kept here so a name's page (which replaces the table) has its link.
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

    // A name's page sits OVER the list, which stays mounted beneath it (hidden): Back finds the opened event and its rows
    // where they were — no refetch, the scroll and the focus back on the name (CR 2026-11-19).
    const focusLink = focus && detail?.ev?.id === open ? detail.ev.links?.find(l => l.ticker === focus) : null
    const page = !focus ? null
        : focusLink ? <LinkPage ev={detail.ev} link={focusLink} coverage={coverageOf(focus)} onAsk={onAsk} onBuild={onBuild} />
            : <p className="floor-empty">{focus} is not on the opened event’s map.</p>

    return (<>
        {page}
        <section className="echo" aria-label="Echo — events through the supply chain" hidden={Boolean(focus)}>
            <p className="echo-label"><strong>Echo — unproven.</strong> Events traced through the supply chain: every company they reach,
                scored on six factors (high at 8 of 12), checked at the 5th session for the ones the market has not caught up with.
                Graded against same-sector stand-ins — until that has its events, these are leads, not picks.</p>
            {data.status === 'loading' && <p className="hot-note">Loading…</p>}
            {data.status === 'error' && <p className="hot-note hot-note--warn">Echo could not be read. <button type="button" className="hot-sym" onClick={() => setTick(n => n + 1)}>Retry</button></p>}
            {data.status === 'ok' && <>
                <p className="hot-note">{recordLine(data.report)}</p>
                {!data.events.length
                    ? <p className="floor-empty">No events yet.</p>
                    : (
                        <div className="hot-table-wrap">
                            <table className="hot-table hot-table--list echo-events">
                                <thead>
                                    <tr>
                                        <th scope="col">Date</th><th scope="col">Event</th><th scope="col">Kind</th><th scope="col">Where</th>
                                        <th scope="col" title="The top-scored names">Top</th>
                                        <th scope="col" title="Flagged at the day-5 check">Flags</th>
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
                                                    <td title={e.whatChanged}>{who} <span className="hot-dim">{e.effect === 'up' ? '▲' : e.effect === 'down' ? '▼' : '◆'}</span>{e.mine ? <span className="hot-dim"> · yours</span> : null}</td>
                                                    <td>{TYPE_WORDS[e.type] ?? words(e.type)}</td>
                                                    <td title={e.expiredBecause ?? why}>{word}</td>
                                                    <td>{e.top?.length ? e.top.map(t => `${t.ticker} ${t.total}`).join(' · ') : <span className="hot-dim">—</span>}</td>
                                                    <td>{e.flagged?.length ? <span className="echo-flag">{e.flagged.map(f => f.ticker).join(' · ')}</span> : <span className="hot-dim">—</span>}</td>
                                                </tr>
                                                {isOpen && (
                                                    <tr className="hot-note-row echo-open">
                                                        <td colSpan={6}><EventDetail id={e.id} coverageOf={coverageOf} onOpen={openName} onLoaded={(ev) => setDetail({ ev })} onAsk={onAsk} /></td>
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
    </>)
}
HotlistEcho.propTypes = { onSymbolClick: PropTypes.func, onAsk: PropTypes.func, onBuild: PropTypes.func, coverage: PropTypes.array, focus: PropTypes.string, onOpen: PropTypes.func }
