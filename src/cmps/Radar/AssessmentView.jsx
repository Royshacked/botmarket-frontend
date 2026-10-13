import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { strategyService } from '../../services/strategy/strategy.service.remote.js'
import { useStrategyRun } from '../../customHooks/useStrategyRun.js'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { useDetailPanel } from '../DetailPanel/detailPanel.store.js'
import { verdictKey, VERDICT_LABEL, INPUT_LABEL, causeWord, REGIME_WORD, movedLine, moneyLine, flowLines, geoLine, groupByVerdict, recordWords, isExpired, weekHeadline, weekResultLine } from './assessmentWords.js'

// Pythia's assessments — "Assessed" on the Forecasts tab (backend docs/design/pythia-assessment.md, build
// step 1). Each assessed industry with Pythia's verdict — interesting to trade, to invest in, to watch, or
// to avoid — what caused the move, how far the price has gone (facts from code, not the agent), the risks,
// and what would change the view; and, on top, the track record of every verdict graded against SPY.
// A JUDGMENT, NOT A FORECAST: the board says so.

const _date = (iso) => (iso ? String(iso).slice(0, 10) : '—')

function AssessmentRow({ row }) {
    // The detail opens in the DetailPanel over the chat column (one panel across the app — see its store).
    const panel = useDetailPanel(`assessment:${row.id ?? s.code ?? s.name}`)
    const open = panel.isOpen
    const s = row.subject ?? {}
    const moved = movedLine(row.moved, s.name)
    const money = moneyLine(row.money)
    const flows = flowLines(row.flows)
    const geo = geoLine(row.geopolitics)
    const expired = isExpired(row)
    return (
        <div className="industry-view__row">
            <button type="button" className="industry-view__line" onClick={panel.toggle} aria-haspopup="dialog" aria-expanded={open}>
                <span className="industry-view__head">
                    <span className="industry-view__name" title={s.name}>
                        {s.name}
                        {s.kind === 'theme' && <i className="themes-view__status themes-view__status--theme" title="A theme: a value chain across industries (see Themes)">theme</i>}
                        {expired && <i className="assessment-view__stale" title={`Expired ${_date(row.expires_at)} — due for reassessment`}>stale</i>}
                    </span>
                    <span className="industry-view__conclusion" title={row.thesis}>{row.thesis}</span>
                </span>
                <span className="screen-view__chips">
                    {/* The research could not be done (2026-10-11: a search quota ran out) — a verdict that rests on
                        price and money alone must not read like one that weighed the news. */}
                    {row.cause?.kind === 'unverified' && <span className="assessment-view__unchecked" title="The news could not be checked when this was assessed — the verdict rests on price and money only">news not checked</span>}
                    {row.moved?.hype && <span className="assessment-view__hype" title="Up 100%+ in two years and 100%+ over the market — a crash risk flag, not a timing signal">hype</span>}
                    <span className={`assessment-view__verdict assessment-view__verdict--${verdictKey(row.verdict)}`}>{VERDICT_LABEL[row.verdict] ?? row.verdict}</span>
                    <span className="screen-view__horizon">{row.verdict === 'watch' && row.decides_by ? `decides by ${row.decides_by}` : row.horizon}</span>
                </span>
            </button>
            <DetailPanel id={`assessment:${row.id ?? s.code ?? s.name}`} kicker="Forecasts · Assessed" title={s.name} meta={<><span className={`assessment-view__verdict assessment-view__verdict--${verdictKey(row.verdict)}`}>{VERDICT_LABEL[row.verdict] ?? row.verdict}</span><span>{row.verdict === 'watch' && row.decides_by ? `decides by ${row.decides_by}` : row.horizon}</span>{expired && <span className="assessment-view__stale">stale</span>}</>}>
                <div className="industry-view__detail">
                    <p className="industry-view__summary">{row.thesis}</p>
                    {row.verdict === 'watch' && row.question && (
                        <p><span className="industry-view__label">the open question</span> {row.question}{row.decides_by ? ` — decided by ${row.decides_by}` : ''}</p>
                    )}
                    {(row.trigger?.length ?? 0) > 0 && (
                        <p className="assessment-view__trigger">
                            <span className="industry-view__label">flagged by the weekly scan</span>{' '}
                            {row.trigger.map(t => `${t.text}${t.detail ? ` (${t.detail})` : ''}`).join('; ')}
                        </p>
                    )}
                    <p>
                        <span className="industry-view__label">what moved it</span>{' '}
                        <b className={`assessment-view__cause assessment-view__cause--${row.cause?.kind}`}>{causeWord(row.cause?.kind, row.moved?.hype)}</b>
                        {row.cause?.text ? ` — ${row.cause.text}` : ''}
                    </p>
                    {moved && <p><span className="industry-view__label">how far it has moved</span> {moved}</p>}
                    {money && <p><span className="industry-view__label">where its companies put money</span> {money}</p>}
                    {flows.insiders && <p><span className="industry-view__label">insiders buying</span> {flows.insiders}</p>}
                    {flows.funds && <p><span className="industry-view__label">funds</span> {flows.funds}</p>}
                    {flows.government && <p><span className="industry-view__label">government contracts</span> {flows.government}</p>}
                    {geo && <p><span className="industry-view__label">geopolitics</span> {geo}</p>}
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
            </DetailPanel>
        </div>
    )
}
AssessmentRow.propTypes = { row: PropTypes.object.isRequired }

/** Admin: assess one industry now (a few minutes of research, its cost shown). */
function AssessNow({ industries }) {
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState(null)
    const options = useMemo(() => [...industries].sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))), [industries])
    // The in-flight state lives in the service too, so a button remounted mid-run (tab switched and back)
    // still shows the run instead of offering a second paid click.
    const inFlight = useStrategyRun(code ? `industry:${code}` : null)
    const running = busy || inFlight
    async function run() {
        if (!code || running) return
        setBusy(true)
        setResult(null)
        try {
            const r = await strategyService.assessNow(code)
            setResult({ ok: true, text: `Published: ${VERDICT_LABEL[r.doc?.verdict] ?? r.doc?.verdict} · cost $${(r.cost_usd ?? 0).toFixed(4)}` })
        } catch (err) {
            const outcome = err?.response?.data?.outcome
            setResult({ ok: false, text: `Not published${outcome ? ` (${outcome})` : ''}: ${strategyService.runError(err)}` })
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
            <button type="button" onClick={run} disabled={!code || running}>{running ? 'Assessing…' : 'Assess now'}</button>
            <span role="status" aria-live="polite" className={result ? `assessment-view__result${result.ok ? '' : ' assessment-view__result--bad'}` : undefined}>{result?.text}</span>
        </div>
    )
}
AssessNow.propTypes = { industries: PropTypes.array.isRequired }

/**
 * The week (backend pythia-assessment.md §8): what the change scan flagged, what was assessed and how it came
 * out, what waits — and the market regime it ran in. An admin also sees the spend and can run the week.
 */
function WeekPanel({ week, isAdmin }) {
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState(null)
    // `status` is the server's real state: a week a dead process left behind reads `interrupted` (resumable).
    const running = week?.status === 'running'
    const reasonText = useMemo(() => Object.fromEntries((week?.flagged ?? []).flatMap(f => (f.reasons ?? []).map(r => [r.key, r.text]))), [week])
    async function run() {
        if (busy || running) return
        setBusy(true)
        setNote(null)
        try {
            await strategyService.runWeek({ force: week?.status === 'done' })   // interrupted → resume, not rerun
            setNote('Started — the board follows it.')
        } catch (err) {
            setNote(`Not started — ${strategyService.runError(err)}`)
        } finally {
            setBusy(false)
        }
    }
    const headline = weekHeadline(week)
    return (
        <div className="assessment-view__week">
            <div className="assessment-view__week-head">
                {headline
                    ? <button type="button" className="assessment-view__week-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>{headline}</button>
                    : <span>No week has run yet — the change scan picks what to assess after each weekly price run.</span>}
                {week?.regime && <span className={`screen-view__regime screen-view__regime--${week.regime}`}>regime {REGIME_WORD[week.regime] ?? week.regime}</span>}
                {isAdmin && typeof week?.cost_usd === 'number' && <span className="industry-view__meta">cost ${week.cost_usd.toFixed(4)}{week.stopped === 'budget' ? ' — stopped at the week\'s spend ceiling' : ''}</span>}
                {isAdmin && (
                    <button type="button" onClick={run} disabled={busy || running}>
                        {running ? 'Running…' : week?.status === 'done' ? 'Run the week again' : week?.status === 'interrupted' || week?.status === 'paused' ? 'Resume the week' : 'Run the week'}
                    </button>
                )}
                <span role="status" aria-live="polite" className={note ? 'assessment-view__result' : undefined}>{note}</span>
            </div>
            {open && week && (
                <div className="assessment-view__week-body">
                    {(week.results?.length ?? 0) > 0 && (
                        <ul>{week.results.map((r, i) => <li key={`${r.code ?? r.id}-${i}`}>{weekResultLine(r, reasonText)}</li>)}</ul>
                    )}
                    {(week.waiting?.length ?? 0) > 0 && (
                        <p className="industry-view__meta">
                            Waiting for next week: {week.waiting.map(w => w.name).join(', ')}{week.waiting_count > week.waiting.length ? ` and ${week.waiting_count - week.waiting.length} more` : ''}.
                        </p>
                    )}
                    {(week.held_back?.length ?? 0) > 0 && (
                        <p className="industry-view__meta">Held back this week after two refusals in a row (tried again next week): {week.held_back.map(w => w.name).join(', ')}.</p>
                    )}
                    {!week.results?.length && !week.waiting?.length && !week.held_back?.length && <p className="industry-view__meta">Nothing moved since the last assessments.</p>}
                </div>
            )}
        </div>
    )
}
WeekPanel.propTypes = { week: PropTypes.object, isAdmin: PropTypes.bool.isRequired }

export function AssessmentView({ data = null, industries = [], query = '', week = null }) {
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
                <span><b>{total}</b> {total === 1 ? 'industry or theme' : 'industries and themes'} assessed</span>
                <span className="industry-view__legend">a judgment from news, price, money, regime and geopolitics — not a forecast</span>
            </div>
            <WeekPanel week={week} isAdmin={isAdmin} />
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

AssessmentView.propTypes = { data: PropTypes.object, industries: PropTypes.array, query: PropTypes.string, week: PropTypes.object }
