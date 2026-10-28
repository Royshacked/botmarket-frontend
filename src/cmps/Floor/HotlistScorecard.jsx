import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { SCORE_MARKS, SCORE_SOURCE, PASS_WHY, scoreCell } from './hotlist.utils.js'

// PROMETHEUS'S SCORECARD in the Hotlist's Book (Roy, 2026-10-27: "do the scorecard"; backend prometheusCalls.service).
// Every coverage call he makes is frozen the day he makes it and graded against SPY at 1, 3, 6 and 12 months — signed by
// the rating, so a sell that fell scores like a buy that rose; holds apart. Calls from before the scorecard are seeded
// from his coverage's history and shown apart. His catalyst reads: the ones he BACKED against the ones he PASSED on,
// both held to the window's end — does his reading add anything over the rule that sent him the name?

const _rating = (r) => r.replace('_', ' ')

function Cell({ s, min }) {
    const c = scoreCell(s, min)
    return c ? <td className={`hot-result hot-result--${c.tone}`} title={c.title}>{c.text}</td> : <td className="hot-dim">—</td>
}
Cell.propTypes = { s: PropTypes.object, min: PropTypes.number }

function CoverageTable({ coverage, min }) {
    const rows = []
    for (const src of ['forward', 'backfill']) {
        const g = coverage?.[src]
        if (!g?.calls) continue
        rows.push({ key: src, label: SCORE_SOURCE[src], sub: `${g.calls} calls · ${g.open} open`, marks: (m) => g.marks?.[m]?.calls, strong: true })
        // BY THE HOUSE'S BANDS (Roy, 2026-10-28: "if I want to see how the coverages did with the new rating, I need to see
        // it in the scorecard"): each call in the band its target fell in against SPY the day it was made — then as he
        // rated it, for the difference.
        const bands = Object.entries(g.by_band ?? {})
        if (bands.length) {
            rows.push({ key: `${src}-bands`, label: 'By the house bands', sub: 'the band each target fell in the day it was made', marks: () => null, heading: true })
            for (const [r, byMark] of bands) rows.push({ key: `${src}-band-${r}`, label: _rating(r), sub: r === 'hold' ? 'vs SPY, unsigned' : null, marks: (m) => byMark[m] })
            rows.push({ key: `${src}-given`, label: 'As he rated them', sub: 'the rating he wrote', marks: () => null, heading: true })
        }
        for (const [r, byMark] of Object.entries(g.by_rating ?? {})) rows.push({ key: `${src}-${r}`, label: _rating(r), sub: r === 'hold' ? 'vs SPY, unsigned' : null, marks: (m) => byMark[m] })
        if (g.target?.settled) rows.push({ key: `${src}-target`, label: 'Target reached', sub: `${g.target.reached} of ${g.target.settled} past their horizon`, marks: () => null })
    }
    if (!rows.length) return <p className="floor-empty">No coverage calls logged yet.</p>
    return (
        <div className="hot-table-wrap hot-table-wrap--list">
            <table className="hot-table hot-table--list hot-table--score">
                <thead>
                    <tr>
                        <th scope="col">Coverage calls</th>
                        {SCORE_MARKS.map(m => <th key={m} scope="col" title={`${m} after the call: mean vs SPY · share beating SPY · how many`}>{m}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.key} className={`hot-row hot-row--line${r.strong ? ' hot-score__group' : ''}${r.heading ? ' hot-score__heading' : ''}`}>
                            <th scope="row" className={r.strong ? undefined : r.heading ? 'hot-score__head' : 'hot-score__sub'}>{r.label}{r.sub && <span className="hot-dim"> · {r.sub}</span>}</th>
                            {r.heading ? <td colSpan={SCORE_MARKS.length} /> : SCORE_MARKS.map(m => <Cell key={m} s={r.marks(m)} min={min} />)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
CoverageTable.propTypes = { coverage: PropTypes.object, min: PropTypes.number }

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
                        <th scope="row">Backed — a target</th>
                        <td>{b?.reads ?? 0}{b?.reads ? <span className="hot-dim"> · {b.hit} hit target</span> : null}</td>
                        <Cell s={b?.window} min={min} />
                    </tr>
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
    useEffect(() => {
        let live = true
        hotlistService.getScorecard().then(c => { if (live) setCard(c ?? null) }, () => { if (live) setCard(null) })
        return () => { live = false }
    }, [])
    if (card === undefined) return <p className="floor-empty">Loading Prometheus’s scorecard…</p>
    if (card === null) return <p className="floor-empty">The scorecard could not be loaded.</p>
    const min = card.min_judge ?? 20
    return (
        <div className="hot-score">
            <p className="hot-note">Every call Prometheus makes is <b>frozen the day he makes it</b> and graded against SPY — signed by his
                rating, so a sell that fell counts like a buy that rose. Calls from before the scorecard are seeded from his coverage’s
                history and shown apart. Under {min} graded calls a number is shown dim: too few to judge.</p>
            <CoverageTable coverage={card.coverage} min={min} />
            <CatalystTable catalyst={card.catalyst} min={min} />
        </div>
    )
}
