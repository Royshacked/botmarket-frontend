import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { gradeFor, conclusionFor } from './industryGrade.js'
import { AssessmentView } from './AssessmentView.jsx'
import { ThemesView } from './ThemesView.jsx'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { useDetailPanel } from '../DetailPanel/detailPanel.store.js'
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
    // The detail opens in the DetailPanel over the chat column (one panel across the app — see its store).
    const panel = useDetailPanel(`industry:${row.code ?? row.name}`)
    const open = panel.isOpen
    const via = row.answered_at && row.answered_at.level !== 'sub_industry' ? row.answered_at.name : null
    const v = row.view
    const conclusion = conclusionFor(row)
    return (
        <div className="industry-view__row">
            <button type="button" className="industry-view__line" onClick={panel.toggle} aria-haspopup="dialog" aria-expanded={open}>
                <span className="industry-view__head">
                    <span className="industry-view__name" title={row.name}>
                        {row.name}
                        {via && <i className="industry-view__via" title={`Too few companies to measure on its own — measured at ${via}`}>via {via}</i>}
                    </span>
                    {conclusion && <span className="industry-view__conclusion" title={conclusion.line}>{conclusion.line}</span>}
                </span>
                <span className="industry-view__grades">
                    {QUESTIONS.map(([q, label]) => <GradeChip key={q} g={gradeFor(row, q)} label={label} />)}
                </span>
                {row.triggers?.length > 0 && (
                    <span className="industry-view__trigger" title={row.triggers.map(t => TRIGGER_LABEL[t] ?? t).join('; ')}>!</span>
                )}
            </button>
            <DetailPanel id={`industry:${row.code ?? row.name}`} kicker="Forecasts · Structure" title={row.name} meta={<>{QUESTIONS.map(([q, label]) => <span key={q}>{label} <GradeChip g={gradeFor(row, q)} label={label} /></span>)}</>}>
                <div className="industry-view__detail">
                    {conclusion?.reading && <p className="industry-view__reading">{conclusion.reading}</p>}
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
            </DetailPanel>
        </div>
    )
}
IndustryRow.propTypes = { row: PropTypes.object.isRequired }

/**
 * The Forecasts tab: ASSESSED (Pythia's judgment per industry and theme, with what the weekly change scan
 * flagged and the graded track record — backend docs/design/pythia-assessment.md), THEMES (value chains) and
 * STRUCTURE (the three structural answers). The weekly screen's "Trade now" was retired when the assessment
 * board replaced it (Roy, 2026-10-10; step 6, 2026-10-11).
 */
export function IndustryView({ industries = [], loading = false, error = false, assessments = null, themes = [], week = null }) {
    const [mode, setMode] = useState(null)
    const [query, setQuery] = useState('')
    const shown = mode ?? 'assessed'
    const tabs = (
        <div className="screen-view__modes" role="tablist">
            {[['assessed', 'Assessed'], ['themes', 'Themes'], ['structure', 'Structure']].map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={shown === k}
                    className={`screen-view__mode${shown === k ? ' screen-view__mode--on' : ''}`} onClick={() => setMode(k)}>
                    {label}
                </button>
            ))}
        </div>
    )
    if (shown === 'themes') {
        return (
            <div className="industry-view">
                {tabs}
                <ThemesView themes={themes} />
            </div>
        )
    }
    if (shown === 'assessed') {
        return (
            <div className="industry-view">
                {tabs}
                <input className="industry-view__search" type="search" placeholder="Find an industry…" value={query}
                    onChange={e => setQuery(e.target.value)} aria-label="Find an industry" />
                <AssessmentView data={assessments} industries={industries} query={query} week={week} />
            </div>
        )
    }
    return <StructureView industries={industries} loading={loading} error={error} tabs={tabs} query={query} setQuery={setQuery} />
}

IndustryView.propTypes = {
    industries: PropTypes.array,
    loading:    PropTypes.bool,
    error:      PropTypes.bool,
    assessments: PropTypes.object,
    themes:     PropTypes.array,
    week:       PropTypes.object,
}

function StructureView({ industries, loading, error, tabs, query, setQuery }) {
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

    // The empty states keep the mode switch, so the other tabs stay one click away.
    if (loading && !industries.length) return <div className="industry-view">{tabs}<div className="news-feed__loader"><span /><span /><span /></div></div>
    if (!industries.length) {
        return (
            <div className="industry-view">
                {tabs}
                {error
                    ? <p className="news-feed__empty">Could not load the industry views. They will be fetched again on the next refresh.</p>
                    : <p className="news-feed__empty">No industry measurements yet — the engine has not run its industry metrics.</p>}
            </div>
        )
    }

    const answered = industries.filter(r => r.view?.status === 'answered').length
    const flagged  = industries.filter(r => r.triggers?.length).length

    return (
        <div className="industry-view">
            {tabs}
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

StructureView.propTypes = {
    industries: PropTypes.array.isRequired,
    loading:    PropTypes.bool.isRequired,
    error:      PropTypes.bool.isRequired,
    tabs:       PropTypes.node.isRequired,
    query:      PropTypes.string.isRequired,
    setQuery:   PropTypes.func.isRequired,
}
