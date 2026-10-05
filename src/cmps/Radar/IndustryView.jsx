import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { gradeFor } from './industryGrade.js'
import './IndustryView.scss'

// Pythia's industry views — the Forecasts tab since 2026-10-05 (backend
// docs/design/pythia-industry-questions.md). For each of the 163 GICS sub-industries: three structural
// answers — DEMAND, ECONOMICS, CYCLE — as Pythia published them, or, while an industry is still
// unanswered, the engine's measured first read shown as such (dashed, "measured").
//
// DESCRIPTIONS, NOT FORECASTS. Nothing here says a price will rise; the horizons view that ranks
// industries by evidence per horizon (docs/design/horizons.md §4) arrives with the signal lab.

const QUESTIONS = [['demand', 'Demand'], ['economics', 'Economics'], ['cycle', 'Cycle']]
const TRIGGER_LABEL = {
    revenue_down_two_quarters: 'revenue down two quarters',
    returns_below_hurdle:      'returns below the cost of capital',
    margin_at_range_edge:      'margins at the edge of their 10-year range',
}

const _date = (iso) => (iso ? String(iso).slice(0, 10) : null)

function GradeChip({ g, label }) {
    const title = g.source === 'house'
        ? `${label}: ${g.grade?.replace('_', ' ')} — the house answer${g.departs ? ', departing from the measured grade (reason in the detail)' : ''}`
        : `${label}: ${g.grade ? g.grade.replace('_', ' ') : 'no measurement'} — measured, not yet reviewed by Pythia`
    return (
        <span className={`industry-grade industry-grade--${g.grade ?? 'none'}${g.source === 'measured' ? ' industry-grade--measured' : ''}`} title={title}>
            {g.grade ? g.grade.replace('_', ' ') : '—'}{g.departs ? '*' : ''}
        </span>
    )
}
GradeChip.propTypes = { g: PropTypes.object.isRequired, label: PropTypes.string.isRequired }

function IndustryRow({ row }) {
    const [open, setOpen] = useState(false)
    const via = row.answered_at && row.answered_at.level !== 'sub_industry' ? row.answered_at.name : null
    const v = row.view
    return (
        <div className={`industry-view__row${open ? ' industry-view__row--open' : ''}`}>
            <button type="button" className="industry-view__line" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                <span className="industry-view__name" title={row.name}>
                    {row.name}
                    {via && <i className="industry-view__via" title={`Too few companies to measure on its own — measured at ${via}`}>via {via}</i>}
                </span>
                <span className="industry-view__grades">
                    {QUESTIONS.map(([q, label]) => <GradeChip key={q} g={gradeFor(row, q)} label={label} />)}
                </span>
                {row.triggers?.length > 0 && (
                    <span className="industry-view__trigger" title={row.triggers.map(t => TRIGGER_LABEL[t] ?? t).join('; ')}>!</span>
                )}
            </button>
            {open && (
                <div className="industry-view__detail">
                    {v?.status === 'answered' ? (
                        <>
                            {v.summary && <p className="industry-view__summary">{v.summary}</p>}
                            {QUESTIONS.map(([q, label]) => v[q] && (
                                <div key={q} className="industry-view__answer">
                                    <span className="industry-view__answer-q">{label}</span>
                                    <p>{v[q].rationale}</p>
                                    {v[q].override_reason && (
                                        <p className="industry-view__override">
                                            Measured {v[q].code_grade?.replace('_', ' ') ?? '—'}; the house departs: {v[q].override_reason}
                                        </p>
                                    )}
                                </div>
                            ))}
                            {(v.reopen_if?.length ?? 0) > 0 && (
                                <div className="industry-view__reopen">
                                    <span className="industry-view__label">reopen early if</span>
                                    <ul>{v.reopen_if.map((k, i) => <li key={i}>{k}</li>)}</ul>
                                </div>
                            )}
                            <p className="industry-view__meta">
                                Answered {_date(v.updated_at) ?? '—'} · next review {_date(v.next_review) ?? '—'}
                            </p>
                        </>
                    ) : (
                        <p className="industry-view__pending">
                            Not yet reviewed by Pythia. The grades shown are the engine&apos;s measured first read
                            {row.n_companies ? ` across ${row.n_companies} companies` : ''}.
                        </p>
                    )}
                    {row.triggers?.length > 0 && (
                        <p className="industry-view__meta">Early-review triggers: {row.triggers.map(t => TRIGGER_LABEL[t] ?? t).join('; ')}.</p>
                    )}
                </div>
            )}
        </div>
    )
}
IndustryRow.propTypes = { row: PropTypes.object.isRequired }

export function IndustryView({ industries = [], loading = false }) {
    const [query, setQuery] = useState('')
    const bySector = useMemo(() => {
        const q = query.trim().toLowerCase()
        const out = new Map()
        for (const r of industries) {
            if (q && !`${r.name} ${r.industry ?? ''} ${r.sector}`.toLowerCase().includes(q)) continue
            if (!out.has(r.sector)) out.set(r.sector, [])
            out.get(r.sector).push(r)
        }
        return out
    }, [industries, query])

    if (loading && !industries.length) return <div className="news-feed__loader"><span /><span /><span /></div>
    if (!industries.length) {
        return <p className="news-feed__empty">No industry measurements yet — the engine has not run its industry metrics.</p>
    }

    const answered = industries.filter(r => r.view?.status === 'answered').length
    const flagged  = industries.filter(r => r.triggers?.length).length

    return (
        <div className="industry-view">
            <div className="industry-view__summary-bar">
                <span><b>{answered}</b> of {industries.length} answered by Pythia</span>
                {flagged > 0 && <span className="industry-view__flagged">{flagged} with an early-review trigger</span>}
                <span className="industry-view__legend">demand · economics · cycle — descriptions, not forecasts</span>
            </div>
            <input className="industry-view__search" type="search" placeholder="Find an industry…" value={query}
                onChange={e => setQuery(e.target.value)} aria-label="Find an industry" />
            {[...bySector.entries()].map(([sector, rows]) => (
                <section key={sector} className="industry-view__sector">
                    <h4 className="industry-view__sector-name">{sector} <span>{rows.length}</span></h4>
                    {rows.map(r => <IndustryRow key={r.code} row={r} />)}
                </section>
            ))}
            {!bySector.size && <p className="news-feed__empty">No industry matches “{query}”.</p>}
        </div>
    )
}

IndustryView.propTypes = {
    industries: PropTypes.array,
    loading:    PropTypes.bool,
}
