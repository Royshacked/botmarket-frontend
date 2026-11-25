import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { useDetailPanel } from '../DetailPanel/detailPanel.store.js'
import { situationService } from '../../services/situation/situation.service.remote.js'
import { apiError } from '../../services/http.service.js'
import { MermaidDiagram } from './MermaidDiagram.jsx'
import {
    pct, usd, SECTION_LABEL, DECISION_LABEL, REASON_LABEL, TREE_LABEL,
    drawn, treesOf, treeDiagram, crossDiagram, industryTable, inWindow, hasFar, WINDOWS, historyLines,
    layersOf, nodesForLayer, droppedByLayer, layerOf, treeKey, LAYER_LABEL, SECTOR_SECTION_LABEL, outcomesLine,
} from './situation.utils.js'
import './SituationPanel.scss'

// THE SITUATION NETWORK'S BOARD (docs/design/situation-network.md §11.6; Roy, 2026-11-23: "I want to see the diagrams and
// probabilities — so I have access to the way it thinks"). Allow-listed users only (Roy and Marce during the forward
// test): the Menu lists it only for them, and the server answers 404 to anyone else.
//
// Five tabs: the NETWORK (the dated state, the connections between trees, a diagram per tree), the QUESTIONS (every node
// with its numbers, its reasoning, its history; Roy can override), the INDUSTRIES (chances over every path, the branches
// behind them, early warnings, would-be entries), the UPDATES (what each run decided, the dropped list, outside events,
// the runs) and the SCORECARD (the forward test against its declared rule). A forward test: nothing here is advice.
//
// THE LAYERS (situation-network-layers.md): a macro layer and one per sector under it. The network and the questions
// are shown for all of them, or for one layer — a sector with the questions linked to it from other layers.

export const SITUATION_PANEL_ID = 'situation'
const TABS = [['network', 'Network'], ['questions', 'Questions'], ['industries', 'Industries'], ['updates', 'Updates'], ['scorecard', 'Scorecard']]

export function SituationPanel() {
    const { isOpen } = useDetailPanel(SITUATION_PANEL_ID)
    const [tab, setTab] = useState('network')
    const [data, setData] = useState({ status: 'idle', run: null })
    const [retry, setRetry] = useState(0)
    const [layer, setLayer] = useState('all')

    useEffect(() => {
        if (!isOpen) return
        let live = true
        setData(d => ({ ...d, status: d.run ? 'ok' : 'loading' }))
        situationService.getLatest().then(
            r => { if (live) setData({ status: 'ok', run: r }) },
            e => { if (live) setData({ status: 'error', run: null, error: apiError(e, 'Could not load the network') }) },
        )
        return () => { live = false }
    }, [isOpen, retry])

    const r = data.run
    const title = r?.run ? `${r.run.kind} run of ${r.run.as_of}` : 'Situation network'
    const actions = (
        <div className="cal-nav" role="tablist" aria-label="Situation view">
            {TABS.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k}
                    className={`cal-nav__btn${tab === k ? ' cal-nav__btn--on' : ''}`} onClick={() => setTab(k)}>{label}</button>
            ))}
        </div>
    )

    return (
        <DetailPanel id={SITUATION_PANEL_ID} kicker="Situation network · forward test" title={title} actions={actions} className="situation" container bare>
            {data.status === 'loading' && <p className="situation__note">Loading…</p>}
            {data.status === 'error' && <p className="situation__note">{data.error} <button type="button" className="situation__link" onClick={() => setRetry(n => n + 1)}>Try again</button></p>}
            {data.status === 'ok' && !r?.run && <p className="situation__note">The network has not been built yet. It builds on its own once the loop is on (SITUATION_NETWORK).</p>}
            {data.status === 'ok' && r?.run && (
                <div className="situation__body">
                    {(tab === 'network' || tab === 'questions') && <LayerPicker run={r} layer={layer} onPick={setLayer} />}
                    {tab === 'network' && <NetworkTab run={r} layer={layer} />}
                    {tab === 'questions' && <QuestionsTab run={r} layer={layer} onChanged={() => setRetry(n => n + 1)} />}
                    {tab === 'industries' && <IndustriesTab run={r} />}
                    {tab === 'updates' && <UpdatesTab run={r} />}
                    {tab === 'scorecard' && <ScorecardTab />}
                </div>
            )}
        </DetailPanel>
    )
}

/** The layer filter: all, macro, or one sector (only the layers this run has). */
function LayerPicker({ run, layer, onPick }) {
    const layers = layersOf(run.nodes)
    if (layers.length < 2) return null
    return (
        <div className="cal-nav situation__layers" role="tablist" aria-label="Layer">
            {[['all', drawn(run.nodes).length], ...layers].map(([k, n]) => (
                <button key={k} type="button" role="tab" aria-selected={layer === k} className={`cal-nav__btn${layer === k ? ' cal-nav__btn--on' : ''}`} onClick={() => onPick(k)}>
                    {k === 'all' ? 'All' : LAYER_LABEL(k)} <span className="situation__dim">{n}</span>
                </button>
            ))}
        </div>
    )
}
LayerPicker.propTypes = { run: PropTypes.object.isRequired, layer: PropTypes.string.isRequired, onPick: PropTypes.func.isRequired }

function NetworkTab({ run, layer = 'all' }) {
    const nodes = nodesForLayer(run.nodes, run.links, layer)
    const cross = crossDiagram(nodes, run.links)
    const [open, setOpen] = useState(null)
    const sector = layer !== 'all' && layer !== 'macro' ? (run.sector_states ?? []).find(x => x.sector === layer) : null
    const state = sector ?? run.state
    const labels = sector ? SECTOR_SECTION_LABEL : SECTION_LABEL
    return (
        <>
            <section className="situation__sec">
                <h3 className="situation__h">{sector ? `${LAYER_LABEL(layer)} · its state` : 'The current state'} · {state?.as_of ?? run.run.as_of}</h3>
                {Object.entries(labels).map(([k, label]) => {
                    const items = state?.sections?.[k] ?? []
                    return (
                        <div key={k} className="situation__state">
                            <button type="button" className="situation__fold" aria-expanded={open === k} onClick={() => setOpen(o => (o === k ? null : k))}>
                                {label} <span className="situation__dim">({items.length})</span>
                            </button>
                            {open === k && (
                                <ul className="situation__items">
                                    {items.map((it, i) => (
                                        <li key={i}><span className={`situation__tag situation__tag--${it.tag}`}>{it.tag}</span> {it.text}
                                            <span className="situation__src"> — {it.source}, {it.as_of}</span></li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )
                })}
            </section>
            <section className="situation__sec">
                <h3 className="situation__h">Connections between the trees</h3>
                {cross ? <MermaidDiagram code={cross} label="Connections between the trees" /> : <p className="situation__note">No link crosses a tree in this run.</p>}
            </section>
            {treesOf(nodes).map(([tree, ns]) => (
                <section key={tree} className="situation__sec">
                    <h3 className="situation__h">{TREE_LABEL(tree)} <span className="situation__dim">({ns.length})</span></h3>
                    <MermaidDiagram code={treeDiagram(ns, run.links)} label={`The ${TREE_LABEL(tree)} tree`} />
                </section>
            ))}
        </>
    )
}
NetworkTab.propTypes = { run: PropTypes.object.isRequired, layer: PropTypes.string }

function QuestionsTab({ run, layer = 'all', onChanged }) {
    const [openId, setOpenId] = useState(null)
    const nodes = drawn(run.nodes).filter(n => layer === 'all' || layerOf(n) === layer)
    return (
        <table className="situation__table">
            <thead><tr><th>Question</th><th>Tree</th><th>Numbers</th><th>Resolve by</th></tr></thead>
            <tbody>
                {nodes.map(n => (
                    <QuestionRow key={n.node_id} n={n} run={run} open={openId === n.node_id} onToggle={() => setOpenId(id => (id === n.node_id ? null : n.node_id))} onChanged={onChanged} />
                ))}
            </tbody>
        </table>
    )
}
QuestionsTab.propTypes = { run: PropTypes.object.isRequired, layer: PropTypes.string, onChanged: PropTypes.func.isRequired }

function QuestionRow({ n, run, open, onToggle, onChanged }) {
    const [history, setHistory] = useState(null)
    const [form, setForm] = useState(null)
    const [msg, setMsg] = useState(null)
    useEffect(() => {
        if (!open) return
        let live = true
        situationService.getNodeHistory(n.node_id).then(h => { if (live) setHistory(h) }, () => { if (live) setHistory([]) })
        return () => { live = false }
    }, [open, n.node_id])
    const into = run.links.filter(l => l.to.node_id === n.node_id)
    const outOf = run.links.filter(l => l.from.node_id === n.node_id)
    const q = (id) => run.nodes.find(x => x.node_id === id)?.question ?? '—'
    async function save() {
        setMsg(null)
        try {
            const p = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v) / 100]))
            await situationService.override(n.node_id, p)
            setForm(null); setMsg('Saved — a new run carries your numbers.'); onChanged()
        } catch (e) { setMsg(apiError(e, 'Could not save')) }
    }
    return (
        <>
            <tr className={`situation__row situation__row--${n.status === 'resolved' ? 'resolved' : n.kind}`} onClick={onToggle} aria-expanded={open}>
                <td>{n.question}{n.set_by === 'roy' && <span className="situation__chip">yours</span>}{n.origin && n.origin !== layerOf(n) && <span className="situation__chip">from {LAYER_LABEL(n.origin)}</span>}{(n.woken ?? []).length > 0 && <span className="situation__chip situation__chip--warn">woken</span>}</td>
                <td className="situation__dim">{TREE_LABEL(treeKey(n))}</td>
                <td>{n.options.map(o => (
                    <span key={o.key} className={`situation__opt${o.dormant ? ' situation__opt--dormant' : ''}`}>
                        <span className="situation__bar" style={{ width: `${Math.round(o.p * 100)}%` }} />{o.label} {pct(o.p)}
                    </span>
                ))}</td>
                <td className="situation__dim">{n.status === 'resolved' ? `resolved: ${n.resolved?.option}${n.resolved?.unforeseen ? ' ⚑ not foreseen' : ''}` : n.resolve_by ?? '—'}</td>
            </tr>
            {open && (
                <tr className="situation__detail"><td colSpan={4}>
                    {n.reasoning && <p><b>Reasoning.</b> {n.reasoning}</p>}
                    {n.options.filter(o => o.signpost).map(o => <p key={o.key} className="situation__dim">Signpost for “{o.label}”: {o.signpost}</p>)}
                    {(n.woken ?? []).map((w, i) => <p key={i} className="situation__warn">Woke on {w.on}: {w.option} — {w.evidence}</p>)}
                    {into.length > 0 && <p><b>Moved by:</b> {into.map(l => `${q(l.from.node_id)} → ${l.from.option} ${l.shift > 0 ? 'raises' : 'lowers'} ${l.to.option}`).join('; ')}</p>}
                    {outOf.length > 0 && <p><b>Moves:</b> {outOf.map(l => `${l.from.option} ${l.shift > 0 ? 'raises' : 'lowers'} “${q(l.to.node_id)}” → ${l.to.option}`).join('; ')}</p>}
                    <p><b>History:</b></p>
                    {history == null ? <p className="situation__dim">Loading…</p> : (
                        <ul className="situation__items">{historyLines(history).map(h => <li key={h.key}>{h.when} · {h.kind}{h.by === 'roy' ? ' · yours' : ''}: {h.text}</li>)}</ul>
                    )}
                    {run.canOverride && n.status === 'live' && (form ? (
                        <div className="situation__form" onClick={e => e.stopPropagation()}>
                            {n.options.map(o => (
                                <label key={o.key}>{o.label} <input type="number" min="0" max="100" value={form[o.key]} onChange={e => setForm(f => ({ ...f, [o.key]: e.target.value }))} />%</label>
                            ))}
                            <button type="button" className="situation__link" onClick={save}>Save my numbers</button>
                            <button type="button" className="situation__link" onClick={() => setForm(null)}>Cancel</button>
                        </div>
                    ) : (
                        <button type="button" className="situation__link" onClick={e => { e.stopPropagation(); setForm(Object.fromEntries(n.options.map(o => [o.key, Math.round(o.p * 100)]))) }}>Override these numbers</button>
                    ))}
                    {msg && <p className="situation__dim">{msg}</p>}
                </td></tr>
            )}
        </>
    )
}
QuestionRow.propTypes = { n: PropTypes.object.isRequired, run: PropTypes.object.isRequired, open: PropTypes.bool, onToggle: PropTypes.func.isRequired, onChanged: PropTypes.func.isRequired }

function IndustriesTab({ run }) {
    const [win, setWin] = useState('near')
    const { rows, calls } = industryTable(inWindow(run.industries, win))
    const [openCode, setOpenCode] = useState(null)
    const entries = run.run.stats?.entries ?? []
    const byId = new Map((run.nodes ?? []).map(n => [n.node_id, n]))
    return (
        <>
            <p className="situation__note">Chances over every path through the network; a split industry gets no call. Calls are at 60% or more. Size is how big the average push on the industry is (small, medium, large), not a position size. {hasFar(run.industries) ? 'Near holds the effects that start within 6 months, and the forward test is judged on it (3 and 6 months). Far holds those that start 6 to 24 months out.' : 'There is no single horizon: each branch is decided by its question’s resolve-by date (open a row), and the forward test grades the calls at 3 and 6 months.'} Macro alone is the macro layer without the sectors. A forward test, not advice.</p>
            {hasFar(run.industries) && (
                <div className="cal-nav situation__layers" role="tablist" aria-label="Window">
                    {WINDOWS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={win === k} className={`cal-nav__btn${win === k ? ' cal-nav__btn--on' : ''}`} onClick={() => setWin(k)}>{label}</button>)}
                </div>
            )}
            <p><b>Calls:</b> {calls.length ? calls.map(r => `${r.name} ${r.p_win >= 0.6 ? `wins ${pct(r.p_win)}` : `loses ${pct(r.p_lose)}`}`).join(' · ') : 'none this run'}</p>
            {win === 'near' && entries.length > 0 && <p className="situation__dim">Would-be entries this run (the record only, no trades): {entries.map(e => `${e.name} ${e.side} ≥ ${pct(e.level)}`).join('; ')}</p>}
            <table className="situation__table">
                <thead><tr><th>Industry</th><th>Wins</th><th>Loses</th><th title="How big the average push on the industry is, over every path — not a position size">Size</th><th>Agreement</th><th>Macro alone</th></tr></thead>
                <tbody>
                    {rows.map(r => (
                        <IndustryRow key={r.code} r={r} byId={byId} open={openCode === r.code} onToggle={() => setOpenCode(c => (c === r.code ? null : r.code))} />
                    ))}
                </tbody>
            </table>
        </>
    )
}
IndustriesTab.propTypes = { run: PropTypes.object.isRequired }

function IndustryRow({ r, byId, open, onToggle }) {
    return (
        <>
            <tr className="situation__row" onClick={onToggle} aria-expanded={open}>
                <td>{r.name}{(r.early_warning ?? []).length > 0 && <span className="situation__chip situation__chip--warn">early warning</span>}</td>
                <td className="situation__num situation__num--win">{pct(r.p_win)}</td>
                <td className="situation__num situation__num--lose">{pct(r.p_lose)}</td>
                <td className="situation__dim">{r.bucket ?? '—'}</td>
                <td className="situation__num">{pct(r.agreement)}</td>
                <td className="situation__dim">{r.macro ? `${pct(r.macro.p_win)} / ${pct(r.macro.p_lose)}` : '—'}</td>
            </tr>
            {open && (
                <tr className="situation__detail"><td colSpan={6}>
                    <ul className="situation__items">
                        {(r.paths ?? []).map(p => {
                            const by = p.resolve_by ?? byId?.get(p.node_id)?.resolve_by ?? null
                            return <li key={`${p.node_id}|${p.option}`}>“{p.question}”{by ? ` (by ${by})` : ''} → {p.label}: {p.weight >= 0 ? 'helps' : 'hurts'}</li>
                        })}
                    </ul>
                </td></tr>
            )}
        </>
    )
}
IndustryRow.propTypes = { r: PropTypes.object.isRequired, byId: PropTypes.instanceOf(Map), open: PropTypes.bool, onToggle: PropTypes.func.isRequired }

function UpdatesTab({ run }) {
    const s = run.run.stats ?? {}
    const dropped = run.dropped
    return (
        <>
            <section className="situation__sec">
                <h3 className="situation__h">This run · {run.run.kind}{run.run.trigger ? ` — ${run.run.trigger}` : ''} · {usd(s.cost_usd)}</h3>
                {(s.decisions ?? []).length > 0 ? (
                    <ul className="situation__items">{s.decisions.map((d, i) => <li key={i}><b>{DECISION_LABEL[d.decision] ?? d.decision}</b>{d.applied ? '' : ' (not applied)'}: {d.summary}</li>)}</ul>
                ) : <p className="situation__dim">A build: every question was set fresh.</p>}
                {(s.changes ?? []).length > 0 && <p className="situation__dim">Spread through the links in {s.rounds} rounds; {s.changes.length} numbers moved.</p>}
                {(s.layers ?? []).length > 0 && <p className="situation__dim">Layers run: {s.layers.filter(x => x.ran).map(x => `${LAYER_LABEL(x.layer)} (${x.articles} articles)`).join(' · ') || 'none'}</p>}
                {(s.promoted ?? s.sectors?.promoted ?? []).length > 0 && <p className="situation__dim">Moved up to the macro layer: {(s.promoted ?? s.sectors.promoted).map(p => run.nodes.find(n => n.node_id === p.node_id)?.question ?? p.node_id).join('; ')}</p>}
                {s.outcomes?.ran && <p className="situation__dim">The outcomes review: {outcomesLine(s.outcomes, run.nodes)}</p>}
                {(s.unforeseen ?? []).length > 0 && <p className="situation__dim">⚑ Not foreseen: {s.unforeseen.map(id => run.nodes.find(n => n.node_id === id)?.question ?? id).join('; ')} — what happened was not what its options assumed.</p>}
            </section>
            {dropped && (
                <section className="situation__sec">
                    <h3 className="situation__h">Questions: {dropped.considered} considered · {dropped.open} open · {dropped.settled} settled · {dropped.resolved ?? 0} resolved · {dropped.dropped.length} dropped</h3>
                    {droppedByLayer(dropped.dropped).length > 1 && <p className="situation__dim">Dropped by layer: {droppedByLayer(dropped.dropped).map(([l, n]) => `${LAYER_LABEL(l)} ${n}`).join(' · ')}</p>}
                    <ul className="situation__items">{dropped.dropped.map((d, i) => <li key={i}>{d.flagged ? '⚑ ' : ''}{(d.layer ?? 'macro') !== 'macro' ? `[${LAYER_LABEL(d.layer)}] ` : ''}{d.question} — <span className="situation__dim">{REASON_LABEL[d.reason] ?? d.reason}{d.note ? `: ${d.note}` : ''}</span></li>)}</ul>
                </section>
            )}
            {(run.outside ?? []).length > 0 && (
                <section className="situation__sec">
                    <h3 className="situation__h">Outside the network</h3>
                    <ul className="situation__items">{run.outside.map(o => <li key={o.event_id}>{o.date}: {o.text} — {o.industries.join(', ')}{(o.routed_to ?? []).length ? <span className="situation__dim"> · sent to {o.routed_to.map(LAYER_LABEL).join(', ')}</span> : null}</li>)}</ul>
                </section>
            )}
            <section className="situation__sec">
                <h3 className="situation__h">Runs</h3>
                <ul className="situation__items">{(run.runs ?? []).map(x => <li key={x.run_id}>{x.as_of} · {x.kind}{x.trigger ? ` — ${x.trigger}` : ''} · {usd(x.stats?.cost_usd)}</li>)}</ul>
            </section>
        </>
    )
}
UpdatesTab.propTypes = { run: PropTypes.object.isRequired }

function ScorecardTab() {
    const [s, setS] = useState({ status: 'loading' })
    useEffect(() => {
        let live = true
        situationService.getScorecard().then(x => { if (live) setS({ status: 'ok', x }) }, e => { if (live) setS({ status: 'error', error: apiError(e, 'Could not load the scorecard') }) })
        return () => { live = false }
    }, [])
    if (s.status === 'loading') return <p className="situation__note">Loading…</p>
    if (s.status === 'error') return <p className="situation__note">{s.error}</p>
    const { x } = s
    const a = x.nodes.all
    return (
        <>
            <p className="situation__note">The pass rule was declared before the start and does not change during the test.</p>
            <p><b>Since</b> {x.started_on ?? 'not started'} · {x.verdict.months} months · {x.runs} runs · {x.verdict.pass ? 'PASSED' : 'not passed'}</p>
            <ul className="situation__items">{Object.entries(x.verdict.checks).map(([k, v]) => <li key={k}>{v ? '✓' : '✗'} {k.replace(/^\d_/, '').replace(/_/g, ' ')}</li>)}</ul>
            <p>Questions resolved: {a.questions} · Brier {a.brier?.toFixed(3) ?? '—'} against equal odds {a.equal_odds?.toFixed(3) ?? '—'}</p>
            <p>Industry long − short at 6 months: {x.industries.m6.n} dates, mean {pct(x.industries.m6.mean)}, t {x.industries.m6.t?.toFixed(1) ?? '—'} · the macro layer alone: {pct(x.macro_only?.m6?.mean)} · the plain question: {pct(x.control.m6.mean)}</p>
            {x.unforeseen?.of > 0 && <p className="situation__dim">Not foreseen: {x.unforeseen.questions} of {x.unforeseen.of} resolved questions were won by an outcome their options did not have when forecast</p>}
            {x.layers && <p className="situation__dim">By layer: macro {x.layers.macro.questions} resolved (Brier {x.layers.macro.brier?.toFixed(3) ?? '—'}) · sectors {x.layers.sectors.questions} resolved (Brier {x.layers.sectors.brier?.toFixed(3) ?? '—'})</p>}
            <p className="situation__dim">Groups: yours {x.nodes.roy.questions} questions (Brier {x.nodes.roy.brier?.toFixed(3) ?? '—'}), the model’s you overrode {x.nodes.overridden.brier?.toFixed(3) ?? '—'}, the model’s you let stand {x.nodes.accepted.brier?.toFixed(3) ?? '—'}.</p>
        </>
    )
}
