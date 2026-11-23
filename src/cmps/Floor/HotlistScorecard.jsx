import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { SCORE_MARKS, SCORE_SOURCE, PASS_WHY, scoreCell, spreadCell } from './hotlist.utils.js'

// PROMETHEUS'S SCORECARD in the Hotlist's Book (Roy, 2026-10-27: "do the scorecard"; backend prometheusCalls.service).
// Every coverage call he makes is frozen the day he makes it and graded against SPY at 1, 3, 6 and 12 months — signed by
// the rating, so a sell that fell scores like a buy that rose; holds apart. Calls from before the scorecard are seeded
// from his coverage's history and shown apart. His catalyst reads: the ones he BACKED against the ones he PASSED on,
// both held to the window's end — does his reading add anything over the rule that sent him the name?

const _rating = (r) => r.replace('_', ' ')

// THE YARDSTICK (Roy, 2026-11-22 — Wall Street judges a rating against the stock's own sector): every number read
// against SPY, or against the call's SPDR sector fund. The backend sends both; the switch picks one.
const BENCHES = Object.freeze({ spy: { label: 'vs SPY', word: 'SPY' }, sector: { label: 'vs its sector', word: 'its sector fund' } })
// With the industry strategist or against her — her stance on the call's book the day it was made.
const PYTHIA_ROWS = [['with', 'with her'], ['against', 'against her'], ['neutral', 'she had no side'], ['unread', 'no stance on record']]

function Cell({ s, min, bench, spread = false }) {
    const c = spread ? spreadCell(s, min, bench) : scoreCell(s, min, bench)
    return c ? <td className={`hot-result hot-result--${c.tone}`} title={c.title}>{c.text}</td> : <td className="hot-dim">—</td>
}
Cell.propTypes = { s: PropTypes.object, min: PropTypes.number, bench: PropTypes.string, spread: PropTypes.bool }

function CoverageTable({ coverage, min, bench }) {
    const word = BENCHES[bench].word
    const rows = []
    for (const src of ['forward', 'backfill']) {
        const g = coverage?.[src]
        if (!g?.calls) continue
        // The sector read has the same shape as the SPY one, under `sector` (prometheusCalls.coverageRecord).
        const d = bench === 'sector' ? (g.sector ?? {}) : g
        const sub = `${g.calls} calls · ${g.open} open${bench === 'sector' ? ` · ${g.sector?.graded ?? 0} with a sector read` : ''}`
        rows.push({ key: src, label: SCORE_SOURCE[src], sub, marks: (m) => d.marks?.[m]?.calls, strong: true })
        // BUYS MINUS SELLS (Roy, 2026-11-22): the long–short spread a rating book is read by — the picking, with the
        // market's direction taken out.
        if (Object.keys(d.spread?.by_band ?? {}).length) rows.push({ key: `${src}-spread-band`, label: 'Buys − sells, by the house bands', sub: 'how far the buy side beat the sell side', marks: (m) => d.spread.by_band[m], spread: true })
        if (Object.keys(d.spread?.by_rating ?? {}).length) rows.push({ key: `${src}-spread-rating`, label: 'Buys − sells, as he rated them', marks: (m) => d.spread.by_rating[m], spread: true })
        // BY THE HOUSE'S BANDS (Roy, 2026-10-28: "if I want to see how the coverages did with the new rating, I need to see
        // it in the scorecard"): each call in the band its target fell in the day it was made — then as he rated it.
        const bands = Object.entries(d.by_band ?? {})
        if (bands.length) {
            rows.push({ key: `${src}-bands`, label: 'By the house bands', sub: 'the band each target fell in the day it was made', marks: () => null, heading: true })
            for (const [r, byMark] of bands) rows.push({ key: `${src}-band-${r}`, label: _rating(r), sub: r === 'hold' ? `vs ${word}, unsigned` : null, marks: (m) => byMark[m] })
            rows.push({ key: `${src}-given`, label: 'As he rated them', sub: 'the rating he wrote', marks: () => null, heading: true })
        }
        for (const [r, byMark] of Object.entries(d.by_rating ?? {})) rows.push({ key: `${src}-${r}`, label: _rating(r), sub: r === 'hold' ? `vs ${word}, unsigned` : null, marks: (m) => byMark[m] })
        // WITH THE INDUSTRY STRATEGIST OR AGAINST HER (Roy, 2026-11-22): does her read add anything to his?
        const py = PYTHIA_ROWS.filter(([k]) => d.by_pythia?.[k]?.calls)
        if (py.length) {
            rows.push({ key: `${src}-pythia`, label: 'With the industry strategist', sub: 'her stance on the call’s book the day it was made', marks: () => null, heading: true })
            for (const [k, label] of py) rows.push({ key: `${src}-pythia-${k}`, label, sub: `${d.by_pythia[k].calls} calls`, marks: (m) => d.by_pythia[k].marks?.[m] })
        }
        if (g.target?.settled) rows.push({ key: `${src}-target`, label: 'Target reached', sub: `${g.target.reached} of ${g.target.settled} past their horizon`, marks: () => null })
    }
    if (!rows.length) return <p className="floor-empty">No coverage calls logged yet.</p>
    return (
        <div className="hot-table-wrap hot-table-wrap--list">
            <table className="hot-table hot-table--list hot-table--score">
                <thead>
                    <tr>
                        <th scope="col">Coverage calls</th>
                        {SCORE_MARKS.map(m => <th key={m} scope="col" title={`${m} after the call: mean vs ${word} · share beating it · how many`}>{m}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.key} className={`hot-row hot-row--line${r.strong ? ' hot-score__group' : ''}${r.heading ? ' hot-score__heading' : ''}`}>
                            <th scope="row" className={r.strong ? undefined : r.heading ? 'hot-score__head' : 'hot-score__sub'}>{r.label}{r.sub && <span className="hot-dim"> · {r.sub}</span>}</th>
                            {r.heading ? <td colSpan={SCORE_MARKS.length} /> : SCORE_MARKS.map(m => <Cell key={m} s={r.marks(m)} min={min} bench={word} spread={r.spread} />)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
CoverageTable.propTypes = { coverage: PropTypes.object, min: PropTypes.number, bench: PropTypes.oneOf(Object.keys(BENCHES)) }

function CatalystTable({ catalyst, min }) {
    const b = catalyst?.backed, p = catalyst?.passes
    if (!b?.reads && !p?.reads) return <p className="floor-empty">No catalyst reads settled yet.</p>
    return (
        <div className="hot-table-wrap hot-table-wrap--list">
            <table className="hot-table hot-table--list hot-table--score">
                <thead>
                    <tr>
                        <th scope="col">Catalyst reads</th>
                        <th scope="col" title="Reads settled (open ones wait for their window)">Reads</th>
                        <th scope="col" title="Held to the window's last close: mean vs SPY · share beating SPY · how many">To the window’s end</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="hot-row hot-row--line hot-score__group">
                        <th scope="row">Backed — confirmed</th>
                        {/* A run-up read can be confirmed without a target (runup-reads.md §4): the hit rate is over the targeted. */}
                        <td>{b?.reads ?? 0}{b?.reads ? <span className="hot-dim"> · {b.hit} of {b.targeted ?? b.reads} targets hit</span> : null}</td>
                        <Cell s={b?.window} min={min} />
                    </tr>
                    {/* His call on the report: held through it, or out before it — does holding add anything? */}
                    {[['hold', 'held through the report'], ['exit', 'out before the report']].filter(([k]) => b?.by_call?.[k]?.n).map(([k, label]) => (
                        <tr key={k} className="hot-row hot-row--line">
                            <th scope="row" className="hot-score__sub">{label}</th>
                            <td className="hot-dim">{b.by_call[k].n}</td>
                            <Cell s={b.by_call[k]} min={min} />
                        </tr>
                    ))}
                    <tr className="hot-row hot-row--line hot-score__group">
                        <th scope="row">Passed — the control</th>
                        <td>{p?.reads ?? 0}</td>
                        <Cell s={p?.window} min={min} />
                    </tr>
                    {Object.entries(p?.by_reason ?? {}).filter(([, s]) => s.n).map(([k, s]) => (
                        <tr key={k} className="hot-row hot-row--line">
                            <th scope="row" className="hot-score__sub">{PASS_WHY[k] ?? k.replace(/_/g, ' ')}</th>
                            <td className="hot-dim">{s.n}</td>
                            <Cell s={s} min={min} />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
CatalystTable.propTypes = { catalyst: PropTypes.object, min: PropTypes.number }

export function HotlistScorecard() {
    const [card, setCard] = useState(undefined) // undefined loading · null failed
    const [bench, setBench] = useState('spy')
    useEffect(() => {
        let live = true
        hotlistService.getScorecard().then(c => { if (live) setCard(c ?? null) }, () => { if (live) setCard(null) })
        return () => { live = false }
    }, [])
    if (card === undefined) return <p className="floor-empty">Loading the analyst’s scorecard…</p>
    if (card === null) return <p className="floor-empty">The scorecard could not be loaded.</p>
    const min = card.min_judge ?? 20
    return (
        <div className="hot-score">
            <p className="hot-note">Every call the analyst makes is <b>frozen the day he makes it</b> and graded against SPY and against its own
                sector — signed by his rating, so a sell that fell counts like a buy that rose. <b>Buys − sells</b> is how far his buys
                beat his sells: the picking, with the market’s direction taken out. Calls from before the scorecard are seeded from his coverage’s
                history and shown apart. Under {min} graded calls a number is shown dim: too few to judge.</p>
            <div className="hot-status-filter" role="group" aria-label="Yardstick">
                {Object.entries(BENCHES).map(([k, b]) => (
                    <button key={k} type="button" aria-pressed={bench === k} className={`hot-status-filter__btn${bench === k ? ' hot-status-filter__btn--on' : ''}`}
                        title={k === 'spy' ? 'Every call against SPY' : 'Every call against its own sector’s SPDR fund — how Wall Street reads a rating'} onClick={() => setBench(k)}>{b.label}</button>
                ))}
            </div>
            <CoverageTable coverage={card.coverage} min={min} bench={bench} />
            <CatalystTable catalyst={card.catalyst} min={min} />
        </div>
    )
}
