import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { strategyService } from '../../services/strategy/strategy.service.remote.js'
import { VERDICT_LABEL, INPUT_LABEL, CAUSE_WORD, movedLine, groupByVerdict, recordWords, isExpired } from './assessmentWords.js'

// Pythia's assessments — "Assessed" on the Forecasts tab (backend docs/design/pythia-assessment.md, build
// step 1). Each assessed industry with Pythia's verdict — interesting to trade, to invest in, to watch, or
// to avoid — what caused the move, how far the price has gone (facts from code, not the agent), the risks,
// and what would change the view; and, on top, the track record of every verdict graded against SPY.
// A JUDGMENT, NOT A FORECAST: the board says so.

const _date = (iso) => (iso ? String(iso).slice(0, 10) : '—')

function AssessmentRow({ row }) {
    const [open, setOpen] = useState(false)
    const s = row.subject ?? {}
    const moved = movedLine(row.moved)
    const expired = isExpired(row)
    return (
        <div className={`industry-view__row${open ? ' industry-view__row--open' : ''}`}>
            <button type="button" className="industry-view__line" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                <span className="industry-view__head">
                    <span className="industry-view__name" title={s.name}>
                        {s.name}
                        {expired && <i className="assessment-view__stale" title={`Expired ${_date(row.expires_at)} — due for reassessment`}>stale</i>}
                    </span>
                    <span className="industry-view__conclusion" title={row.thesis}>{row.thesis}</span>
                </span>
                <span className="screen-view__chips">
                    {row.moved?.hype && <span className="assessment-view__hype" title="Up 100%+ in two years and 100%+ over the market — a crash risk flag, not a timing signal">hype</span>}
                    <span className={`assessment-view__verdict assessment-view__verdict--${row.verdict}`}>{VERDICT_LABEL[row.verdict] ?? row.verdict}</span>
                    <span className="screen-view__horizon">{row.horizon}</span>
                </span>
            </button>
            {open && (
                <div className="industry-view__detail">
                    <p className="industry-view__summary">{row.thesis}</p>
                    <p>
                        <span className="industry-view__label">what moved it</span>{' '}
                        <b className={`assessment-view__cause assessment-view__cause--${row.cause?.kind}`}>{CAUSE_WORD[row.cause?.kind] ?? row.cause?.kind}</b>
                        {row.cause?.text ? ` — ${row.cause.text}` : ''}
                    </p>
                    {moved && <p><span className="industry-view__label">how far it has moved</span> {moved}</p>}
                    {(row.base_rates ?? []).map(b => (
                        <p key={b.key} className="assessment-view__base-rate"><span className="industry-view__label">base rate</span> {b.text}</p>
                    ))}
                    <div className="assessment-view__evidence">
                        {Object.entries(INPUT_LABEL).filter(([k]) => row.evidence?.[k]).map(([k, label]) => (
                            <div key={k} className="industry-view__answer">
                                <span className="industry-view__answer-q">{label}</span>
                                <p>{row.evidence[k]}</p>
                            </div>
                        ))}
                    </div>
                    {(row.gaps?.length ?? 0) > 0 && (
                        <p className="industry-view__meta">Not part of this verdict: {row.gaps.map(g => INPUT_LABEL[g] ?? g).join(', ')}.</p>
                    )}
                    {row.second_order && <p><span className="industry-view__label">who else it reaches</span> {row.second_order}</p>}
                    {(row.risks?.length ?? 0) > 0 && (
                        <div className="industry-view__reopen">
                            <span className="industry-view__label">risks</span>
                            <ul>{row.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                    )}
                    {(row.change_view_if?.length ?? 0) > 0 && (
                        <div className="industry-view__reopen">
                            <span className="industry-view__label">would change the view</span>
                            <ul>{row.change_view_if.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                    )}
                    {row.structure && (
                        <p className="industry-view__meta">
                            Structure: demand {row.structure.demand?.replace('_', ' ') ?? '—'} · economics {row.structure.economics ?? '—'} · cycle {row.structure.cycle ?? '—'}
                        </p>
                    )}
                    <p className="industry-view__meta">
                        Confidence {row.confidence}{row.confidence_reason ? ` — ${row.confidence_reason}` : ''} · assessed {_date(row.assessed_at)} · reassess by {_date(row.expires_at)}
                    </p>
                </div>
            )}
        </div>
    )
}
AssessmentRow.propTypes = { row: PropTypes.object.isRequired }

/** Admin: assess one industry now (a few minutes of research, its cost shown). */
function AssessNow({ industries }) {
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState(null)
    const options = useMemo(() => [...industries].sort((a, b) => a.name.localeCompare(b.name)), [industries])
    async function run() {
        if (!code || busy) return
        setBusy(true)
        setResult(null)
        try {
            const r = await strategyService.assessNow(code)
            setResult({ ok: true, text: `Published: ${VERDICT_LABEL[r.doc?.verdict] ?? r.doc?.verdict} · cost $${(r.cost_usd ?? 0).toFixed(4)}` })
        } catch (err) {
            const d = err?.response?.data
            setResult({ ok: false, text: `Not published: ${d?.outcome ?? 'error'}${d?.detail ? ` — ${String(d.detail).slice(0, 200)}` : ''}` })
        } finally {
            setBusy(false)
        }
    }
    return (
        <div className="assessment-view__assess">
            <select value={code} onChange={e => setCode(e.target.value)} aria-label="Industry to assess" disabled={busy}>
                <option value="">Assess an industry…</option>
                {options.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
            <button type="button" onClick={run} disabled={!code || busy}>{busy ? 'Assessing…' : 'Assess now'}</button>
            {result && <span className={`assessment-view__result${result.ok ? '' : ' assessment-view__result--bad'}`}>{result.text}</span>}
        </div>
    )
}
AssessNow.propTypes = { industries: PropTypes.array.isRequired }

export function AssessmentView({ data = null, industries = [], query = '' }) {
    const isAdmin = Boolean(useAuth()?.isAdmin)
    const groups = useMemo(() => groupByVerdict(data?.assessments ?? [], query), [data, query])
    const record = recordWords(data?.record)
    const total = data?.assessments?.length ?? 0
    return (
        <div className="assessment-view">
            <div className="assessment-view__record">
                <b>Track record</b> · {record.headline}
                {record.lines.length > 0 && <ul>{record.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            </div>
            <div className="industry-view__summary-bar">
                <span><b>{total}</b> industr{total === 1 ? 'y' : 'ies'} assessed</span>
                <span className="industry-view__legend">a judgment from news, price, money, regime and geopolitics — not a forecast</span>
            </div>
            {isAdmin && industries.length > 0 && <AssessNow industries={industries} />}
            {groups.map(([verdict, list]) => (
                <section key={verdict} className="industry-view__sector">
                    <h4 className={`industry-view__sector-name assessment-view__group assessment-view__group--${verdict}`}>
                        {VERDICT_LABEL[verdict]} <span>{list.length}</span>
                    </h4>
                    {list.map(r => <AssessmentRow key={r.id ?? r.subject?.code} row={r} />)}
                </section>
            ))}
            {!total && <p className="news-feed__empty">No industry assessed yet.</p>}
            {total > 0 && !groups.length && <p className="news-feed__empty">No assessed industry matches “{query}”.</p>}
        </div>
    )
}

AssessmentView.propTypes = { data: PropTypes.object, industries: PropTypes.array, query: PropTypes.string }
