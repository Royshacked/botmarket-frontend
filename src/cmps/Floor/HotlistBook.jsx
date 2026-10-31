import { useState } from 'react'
import PropTypes from 'prop-types'
import { OwnedBadge } from '../OwnedBadge/OwnedBadge.jsx'
import { CoverageDetail, CoverageRating } from './CoverageDetail.jsx'
import { HotlistScorecard } from './HotlistScorecard.jsx'
import { HotlistRowPage } from './HotlistRowPage.jsx'
import { BOOK_LABEL, BOOK_SORTS, COVERED, VERDICT_WORDS, bookResult, bookProgress, bookOrigin, bookRecordLine, sortBook, chainSurvivors, chainLeft, coveredRows, pickCell } from './hotlist.utils.js'

// THE HOUSE'S BOOK in the Hotlist — its Swing and Long term lists (Roy, 2026-10-24: "in hotlist — what about longer
// swings and long-term names?"). The day's boards stop at This week; these are Prometheus's coverage, split by the price
// target's horizon (backend houseBook.service): 3–6 months a swing, 12–24 months long term. Live, not by day — the
// house's current book. Each row: where it is against its target, how it has done since the target was set (and
// against SPY), and where it came from (the weekly chain, or the desk). A clicked row is its page — the thesis itself,
// over the whole window (HotlistRowPage, Roy 2026-10-31).

const _price = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—')
const _pct = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—')
// A target date as month and year — "Oct 2027": a long horizon's date is read by the month, and "27-10-23" read as a day.
const _month = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—')
/** Which close the book's prices are — the date the meta line used to carry (code review 2026-10-31: stale prices said so nowhere). */
const lastTitle = (asof) => `The screener’s last close${asof ? `, ${asof}` : ''} — not live`

/**
 * A book row's cells, formatted ONCE — `{ text, cls, title }` per column — for the table's line and the page's tiles alike
 * (code review 2026-10-31: the tiles had their own copy). `rating` is an element when the coverage is on hand.
 */
function bookCells(r, cov, asof) {
    const res = bookResult(r)
    const origin = bookOrigin(r)
    return {
        last: { text: _price(r.price), title: lastTitle(asof) },
        rating: cov ? { text: <CoverageRating coverage={cov} /> } : { text: r.rating?.replace('_', ' ') ?? null, cls: 'hot-dim' },
        target: { text: _price(r.target) },
        upside: { text: _pct(r.upside_pct), cls: r.upside_pct > 0 ? 'hot-up' : r.upside_pct < 0 ? 'hot-down' : null, title: 'From the last close to the target' },
        by: { text: `${_month(r.target_date)} · ${r.horizon ?? '—'}`, title: r.target_date ? `${r.target_date}${r.days_left != null ? ` — ${r.days_left} days left` : ''}` : undefined },
        since: { text: res?.text ?? null, cls: `hot-result hot-result--${res?.tone ?? 'dim'}`, title: res?.title },
        progress: { text: bookProgress(r) ?? null },
        from: { text: origin.text, title: origin.title },
    }
}

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

/**
 * Why the survivors list is empty, in words: the picks not there, every name it had left (Pythia no longer calls them),
 * the chain sent nothing yet, still researching, or he covered none.
 */
function survivorsEmpty({ picks, failed, column, left = 0 }) {
    const label = BOOK_LABEL[column].toLowerCase()
    if (failed) return 'The weekly chain’s names could not be loaded — see Covered companies.'
    // Every survivor left (2026-10-28): not "he covered none" — he did, and Pythia has moved on.
    if (left) return `No ${label} names on the list: Pythia no longer calls the ${left} Prometheus covered (named above) — they are in Covered companies.`
    if (!picks.length) return `The weekly chain has sent no ${label} names yet — Pythia’s week sends them. See Covered companies meanwhile.`
    const waiting = picks.filter(p => p.state === 'waiting').length
    if (waiting) return `Prometheus has ${waiting} of Argus’s ${picks.length} ${label} names still to research. See Argus’s names.`
    return `Prometheus covered none of Argus’s ${picks.length} ${label} names — see Argus’s names for why.`
}

/** Every name Argus sent for this book, newest first, and where Prometheus has it. */
function ChainPicks({ picks, failed, rows, column, onSymbolClick }) {
    if (failed) return <p className="floor-empty">The weekly chain’s names could not be loaded.</p>
    if (!picks.length) return <p className="floor-empty">The weekly chain has sent no {BOOK_LABEL[column].toLowerCase()} names in the last eight weeks.</p>
    const bySym = new Map(rows.map(r => [r.symbol, r]))
    return (
        <div className="hot-table-wrap hot-table-wrap--list">
            <table className="hot-table hot-table--list hot-table--picks">
                <thead>
                    <tr>
                        <th scope="col">Sym</th>
                        <th scope="col" title="The industry or theme Pythia called">Pythia’s call</th>
                        <th scope="col" title="Why Argus chose it, and what would make it wrong">Argus</th>
                        <th scope="col" title="Prometheus's rating and target, or why he passed">Prometheus</th>
                        <th scope="col" title="When the chain sent it">Sent</th>
                    </tr>
                </thead>
                <tbody>
                    {picks.map(p => {
                        const cell = pickCell(p, bySym.get(p.symbol) ?? null)
                        return (
                            <tr key={p.symbol} className="hot-row hot-row--line" data-symbol={p.symbol}>
                                <td><button type="button" className="hot-sym" onClick={() => onSymbolClick?.(p.symbol)}>{p.symbol}</button><OwnedBadge symbol={p.symbol} /></td>
                                <td>{p.subject ?? '—'}</td>
                                <td className="hot-picks__why">{p.why ?? <span className="hot-dim">—</span>}{p.caution && <span className="hot-row__caution"> Caution: {p.caution}</span>}</td>
                                <td className={`hot-result hot-result--${cell.tone}`}>{cell.text}</td>
                                <td className="hot-dim">{String(p.at ?? '').slice(0, 10)}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
ChainPicks.propTypes = { picks: PropTypes.array.isRequired, failed: PropTypes.bool, rows: PropTypes.array.isRequired, column: PropTypes.string.isRequired, onSymbolClick: PropTypes.func }

export function HotlistBook({ book, column, coverage = [], isAdmin = false, focus = null, onOpen = () => {}, onBuild, onAsk, onSymbolClick }) {
    // THE CHAIN'S SURVIVORS first (Roy, 2026-10-24: "Pythia brings the industry → Argus brings names from it →
    // Prometheus analyses them and brings a thesis and PT — the survivors in the Hotlist"): the names it covered, any
    // rating; then every name Argus sent and where Prometheus has it; then the whole book, the desk's too. The parent keys
    // this by the book, so Swing → Long term starts fresh — view, sort and open row (code review 2026-10-24).
    // COVERED COMPANIES (Roy, 2026-10-28) is the whole book, both horizons, and the scorecard; Swing and Long term are the
    // chain's lists — the survivors and Argus's names.
    const covered = column === COVERED
    // A user has no view switch (Roy, 2026-10-29): the list is the tab's list — Argus's names and the scorecard are the admin's.
    const [chosen, setView] = useState(covered ? 'all' : 'confirmed')
    const view = isAdmin ? chosen : covered ? 'all' : 'confirmed'
    // The chain's picks are not there: the book failed, or a server from before them (code review 2026-10-24) — never
    // "the chain sent nothing".
    const picksMissing = !book || book.picks == null
    const [sort, setSort] = useState({ key: null, dir: null })
    const all = covered ? coveredRows(book) : book?.[column] ?? []
    const survivors = chainSurvivors(book, column)
    // Names Pythia no longer calls for this book: off the list, said so, in Covered companies (Roy, 2026-10-28).
    const left = covered ? [] : chainLeft(book, column)
    const picks = book?.picks?.[column] ?? []
    const rows = sortBook(view === 'all' ? all : survivors, sort.key, sort.dir)
    const bySymbol = new Map((coverage ?? []).map(c => [String(c?.symbol ?? '').toUpperCase(), c]))
    // Click: sort; again: the other way; a third time: back to the book's own order (the chain's names, then upside).
    const onSort = (key) => setSort(s => {
        if (s.key !== key) return { key, dir: null }
        const cur = s.dir ?? BOOK_SORTS[key]
        if (s.dir && cur !== BOOK_SORTS[key]) return { key: null, dir: null }
        return { key, dir: cur === 'asc' ? 'desc' : 'asc' }
    })
    const th = (key, label, { num = false, more = false, title } = {}) => {
        const on = sort.key === key
        const dir = on ? (sort.dir ?? BOOK_SORTS[key]) : null
        return (
            <th scope="col" className={[num && 'hot-table__num', more && 'hot-col--more'].filter(Boolean).join(' ') || undefined} title={title} aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className={`hot-sort${on ? ' hot-sort--on' : ''}`} onClick={() => onSort(key)}>
                    {label}{on ? <span aria-hidden="true">{dir === 'asc' ? ' ▲' : ' ▼'}</span> : null}
                </button>
            </th>
        )
    }

    // A row clicked: its page — the numbers, the chart, the thesis and the hand-offs — in place of the list.
    if (focus) {
        const r = rows.find(x => x.symbol === focus) ?? all.find(x => x.symbol === focus)
        if (!r) return <p className="floor-empty">{focus} is no longer on this list.</p>
        const cov = bySymbol.get(r.symbol) ?? null
        const c = bookCells(r, cov, book?.asof)
        const tile = (label, x, wide = false) => [label, x.text, x.cls ?? null, x.title, wide]
        const facts = [tile('Last', c.last), tile('Rating', c.rating), tile('Target', c.target), tile('Upside', c.upside), tile('By', c.by),
            tile('Since set', c.since), tile('To target', c.progress), tile('From', c.from, true)]
        // The head line only when it has something to say (code review 2026-10-31: an empty one left a gap).
        const head = [r.industry, r.price_at_set != null ? `${_price(r.price_at_set)} when the target was set (${String(r.set_at).slice(0, 10)})` : null].filter(Boolean)
        return (
            <HotlistRowPage symbol={r.symbol} name={r.name ?? null} facts={facts}>
                <div className="hot-detail">
                    {head.length > 0 && <p className="hot-detail__head hot-dim">{head.join(' · ')}</p>}
                    {r.origin?.source === 'pythia' && (
                        <p className="hot-detail__line"><b>From the weekly chain:</b> Pythia’s {r.origin.verdict === 'long_term' ? 'long-term' : r.origin.verdict} call on {r.origin.subject}
                            {r.origin.why ? <> — <b>Argus:</b> {r.origin.why}</> : null}
                            {r.origin.caution ? <span className="hot-row__caution"> Caution: {r.origin.caution}</span> : null}</p>
                    )}
                    {cov ? <CoverageDetail coverage={cov} /> : <p className="hot-detail__line hot-dim">The thesis is on the Forecasts page.</p>}
                    <div className="hot-detail__actions">
                        {/* On Covered companies a row hands off as the book it sits in. */}
                        {onBuild && <button type="button" className="floor-queued__btn" onClick={() => onBuild(r, r.book ?? column, null)}
                            title={`Build a ${BOOK_LABEL[r.book ?? column].toLowerCase()} setup with Mentor`}>Build with Mentor</button>}
                        {onAsk && <button type="button" className="floor-queued__btn hot-ask" onClick={() => onAsk(r, r.book ?? column)}>Ask Argus</button>}
                    </div>
                </div>
            </HotlistRowPage>
        )
    }

    return (
        <>
            {isAdmin && <div className="hot-meta">
                <div className="hot-status-filter" role="group" aria-label="Names">
                    {(covered ? [
                        ['all', `All coverage ${all.length}`, 'Every live thesis, swing and long term — the desk’s too, holds and sells too'],
                        ['scorecard', 'Prometheus’s scorecard', 'Every call he made, frozen when made and graded against SPY — all horizons, and his catalyst reads against his passes'],
                    ] : [
                        ['confirmed', `Prometheus confirmed ${survivors.length}`, 'The weekly chain’s survivors: Pythia’s industry, Argus’s pick, and Prometheus’s thesis and target — whatever the rating'],
                        ['argus', `Argus’s names ${picks.length}`, 'Every name Argus sent from Pythia’s calls in the last eight weeks, and where Prometheus has it'],
                    ]).map(([k, label, title]) => (
                        <button key={k} type="button" aria-pressed={view === k} title={title}
                            className={`hot-status-filter__btn${view === k ? ' hot-status-filter__btn--on' : ''}`} onClick={() => setView(k)}>{label}</button>
                    ))}
                </div>
            </div>}
            {view === 'scorecard' ? <HotlistScorecard /> : <>
            {view === 'argus'
                ? <ChainPicks picks={picks} failed={picksMissing} rows={all} column={column} onSymbolClick={onSymbolClick} />
                : !rows.length
                ? <p className="floor-empty">{!isAdmin ? (covered ? 'No covered companies yet.' : 'No names on this list yet.') : covered ? 'No covered companies in the book.' : view === 'all' ? `No ${BOOK_LABEL[column].toLowerCase()} names in the book.` : survivorsEmpty({ picks, failed: picksMissing, column, left: left.length })}</p>
                : (
                    <div className="hot-table-wrap hot-table-wrap--list">
                        <table className="hot-table hot-table--list hot-table--book">
                            <thead>
                                <tr>
                                    <th scope="col" className="hot-table__star"><span className="hot-sr">Details</span></th>
                                    {th('symbol', 'Sym')}
                                    <th scope="col" className="hot-table__num hot-col--more" title={lastTitle(book?.asof)}>Last</th>
                                    <th scope="col" title="Prometheus's rating">Rating</th>
                                    <th scope="col" className="hot-table__num" title="Prometheus's price target">Target</th>
                                    {th('upside', 'Upside', { num: true, title: 'From the last close to the target' })}
                                    {th('days_left', 'By', { more: true, title: 'The target date, and the horizon it was set for' })}
                                    {th('since', 'Since set', { title: 'Did it work: the move since the target was set (and against SPY over the same days); ✓ hit, ✗ broken, expired once settled' })}
                                    {th('progress', 'To target', { num: true, more: true, title: 'How far from the price the day the target was set toward the target' })}
                                    <th scope="col" className="hot-col--more" title="Where the name came from: the weekly chain (Pythia's industry or theme → Argus → Prometheus), or the desk">From</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const c = bookCells(r, bySymbol.get(r.symbol) ?? null, book?.asof)
                                    const open = () => onOpen(r.symbol)
                                    // A cell from bookCells: its text, or a dash.
                                    const td = (x, base = '') => (
                                        <td className={[base, x.cls].filter(Boolean).join(' ') || undefined} title={x.title}>{x.text ?? '—'}</td>
                                    )
                                    return (
                                        <tr key={r.symbol} className={`hot-row hot-row--line${r.origin?.source === 'pythia' ? ' hot-row--pick' : ''}`}
                                            data-symbol={r.symbol} onClick={(e) => { if (!e.target.closest('button')) open() }}>
                                            <td className="hot-table__star">
                                                <button type="button" className="hot-toggle" aria-label={`Details for ${r.symbol}`} onClick={open}>›</button>
                                            </td>
                                            <td><button type="button" className="hot-sym" onClick={() => onSymbolClick?.(r.symbol)} title={r.name ?? r.symbol}>{r.symbol}</button><OwnedBadge symbol={r.symbol} /></td>
                                            {td(c.last, 'hot-table__num hot-col--more')}
                                            {td(c.rating)}
                                            {td(c.target, 'hot-table__num')}
                                            {td(c.upside, 'hot-table__num')}
                                            {td(c.by, 'hot-range hot-col--more')}
                                            {td(c.since)}
                                            {td(c.progress, 'hot-table__num hot-range hot-col--more')}
                                            {td(c.from, 'hot-book__from hot-col--more')}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            {/* The record and who left the list sit UNDER the table (Roy, 2026-10-31): the table comes right under the tabs;
                how the chain makes the list is in the Info column. */}
            {isAdmin && !covered && <BookRecord rec={book?.record?.[column]} column={column} />}
            {isAdmin && view === 'confirmed' && left.length > 0 && (
                <p className="hot-note hot-dim">Off this list — Pythia no longer calls them {BOOK_LABEL[column].toLowerCase()}; still covered, in Covered companies:{' '}
                    {left.map(r => `${r.symbol} (${r.origin?.subject ?? 'its industry'}: now ${VERDICT_WORDS[r.origin?.verdict_now] ?? r.origin?.verdict_now ?? '—'})`).join(', ')}.</p>
            )}
            </>}
        </>
    )
}
HotlistBook.propTypes = {
    book: PropTypes.object, column: PropTypes.string.isRequired, coverage: PropTypes.array, isAdmin: PropTypes.bool,
    focus: PropTypes.string, onOpen: PropTypes.func,
    onBuild: PropTypes.func, onAsk: PropTypes.func, onSymbolClick: PropTypes.func,
}
