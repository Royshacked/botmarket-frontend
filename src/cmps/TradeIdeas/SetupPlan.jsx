import PropTypes from 'prop-types'
import { isLivePosition, isTerminal } from '../../services/entityStatus.js'
import { fmtLevel, fmtR, scenarioName } from './setupPlan.utils.js'
import './SetupPlan.scss'

// ── The plan: every way into the trade, each with its own exits ─────────────────
// docs/design/talos-per-candle.md. What a level IS depends on whether it carries a condition:
//
//   plain     an ORDER at the broker — a limit for a target, a stop-market for a stop — that nobody
//             reads. "rests".
//   watched   a sentence Talos judges on every candle close. "watched". A watched stop still has
//             its stop-market resting behind it; a watched target has nothing resting at all.
//
// ONE block per SCENARIO — rival ways into the same trade, each owning its legs: entry, what takes
// it, stop, targets, top to bottom. It used to be two blocks, Entry then Exits, each walking the
// scenarios again, so a two-premise plan printed four scenario headings and the reader matched
// stops to entries by name. Sizes are never summed across scenarios: the first to fulfil takes the
// whole trade. Past entry only the armed premise is shown (the rivals died with the entry), with
// the live numbers on top — fill, R, the working stop — which used to be a separate PositionPanel.

const watched = z => Array.isArray(z?.conditions) && z.conditions.length > 0

function ConditionList({ conditions }) {
    const list = Array.isArray(conditions) ? conditions : []
    if (!list.length) return null
    return (
        <ul className="setup-plan__conditions">{list.map((c, i) => (
            <li key={c.id ?? i}>
                {c.text}
                {c.weight === 'primary' && <em className="setup-plan__tag"> primary</em>}
                {c.persistence === 'latching' && <em className="setup-plan__tag"> latching</em>}
            </li>
        ))}</ul>
    )
}
ConditionList.propTypes = { conditions: PropTypes.array }

/** One leg: its level, its size, whether it rests or is watched, and its own conditions. */
function Leg({ zone, tone, label, filled = false }) {
    const isWatched = watched(zone)
    return (
        <li className={`setup-plan__leg setup-plan__leg--${tone}${filled ? ' is-filled' : ''}`}>
            <div className="setup-plan__leg-row">
                <span className="setup-plan__leg-label">{label}</span>
                <span className="setup-plan__leg-level">{fmtLevel(zone)}</span>
                {zone?.quantity != null && <span className="setup-plan__leg-qty">qty {zone.quantity}</span>}
                <span
                    className={`setup-plan__mode setup-plan__mode--${isWatched ? 'watched' : 'rests'}`}
                    title={isWatched
                        ? (tone === 'stop'
                            ? 'Talos reads its condition every candle; a stop-market still rests behind it'
                            : 'Talos reads its condition every candle; nothing rests at the broker')
                        : 'An order at the broker — nobody reads it'}
                >
                    {isWatched ? 'watched' : 'rests'}
                </span>
                {filled && <span className="setup-plan__tag">filled</span>}
                {zone?.note && <span className="setup-plan__leg-note">— {zone.note}</span>}
            </div>
            <ConditionList conditions={zone?.conditions} />
        </li>
    )
}
Leg.propTypes = { zone: PropTypes.object.isRequired, tone: PropTypes.string, label: PropTypes.string, filled: PropTypes.bool }

function scenarioClass(setup, sc) {
    const armed = setup.armed_scenario_id === sc.id
    const dead  = setup.monitor_state?.scenarios?.[sc.id]?.invalidation_status === 'fired'
    return `setup-plan__scenario${armed ? ' is-armed' : ''}${dead ? ' is-dead' : ''}`
}
function ScenarioTags({ setup, sc }) {
    const armed = setup.armed_scenario_id === sc.id
    const dead  = setup.monitor_state?.scenarios?.[sc.id]?.invalidation_status === 'fired'
    return (
        <>
            {armed && <em className="setup-plan__tag" title="Price reached this premise — this is the one that fired."> armed</em>}
            {dead  && <em className="setup-plan__tag" title="This premise broke its own validity range. Any other way in is unaffected."> dead</em>}
        </>
    )
}
ScenarioTags.propTypes = { setup: PropTypes.object.isRequired, sc: PropTypes.object.isRequired }

/**
 * SCENARIOS — the ladder, the setup-wide conditions, then each way in: its entry legs, its
 * trigger, its stop and its targets. Past entry, the live numbers first and the armed premise only.
 */
export function SetupScenarios({ setup }) {
    const scenarios = Array.isArray(setup.scenarios) ? setup.scenarios : []
    const inPos     = isLivePosition(setup.status)
    const closed    = isTerminal(setup.status)
    const ps        = setup.position_state ?? null
    const filledIds = new Set((ps?.entry?.legs ?? []).map(l => l?.zone_id).filter(Boolean))
    // Past entry only the ARMED premise is real; the rivals died with the entry.
    const shown = (inPos || closed) && setup.armed_scenario_id
        ? scenarios.filter(sc => sc.id === setup.armed_scenario_id)
        : scenarios

    return (
        <section className="setup-plan" aria-label="Scenarios">
            {(inPos || closed) && ps && <LiveNumbers ps={ps} closed={closed} />}
            {(setup.timeframe || setup.ladder?.length) && (
                <span className="setup-plan__ladder">{setup.ladder?.length > 1 ? setup.ladder.join(' → ') : setup.timeframe}</span>
            )}
            {Array.isArray(setup.conditions) && setup.conditions.length > 0 && (
                <div className="setup-plan__always">
                    <span className="setup-plan__sub">Always</span>
                    <ConditionList conditions={setup.conditions} />
                </div>
            )}
            {shown.map((sc, i) => (
                <div key={sc.id ?? i} className={scenarioClass(setup, sc)}>
                    <span className="setup-plan__sub">
                        {scenarioName(sc, i)}<ScenarioTags setup={setup} sc={sc} />
                        {rrTag(sc)}
                    </span>
                    <ul className="setup-plan__legs">
                        {(sc.entry_zones ?? []).map((z, k) => (
                            <Leg key={z.id ?? k} zone={z} tone="entry" label={(sc.entry_zones.length > 1) ? `leg ${k + 1}` : 'entry'} filled={filledIds.has(z.id)} />
                        ))}
                    </ul>
                    {Array.isArray(sc.conditions) && sc.conditions.length > 0 && (
                        <div className="setup-plan__trigger">
                            <span className="setup-plan__sub">Takes it when</span>
                            <ConditionList conditions={sc.conditions} />
                        </div>
                    )}
                    <ul className="setup-plan__legs">
                        {(sc.stop_zones ?? []).map((z, k) => <Leg key={z.id ?? `s${k}`} zone={z} tone="stop" label="stop" />)}
                        {(sc.tp_zones ?? []).map((z, k) => <Leg key={z.id ?? `t${k}`} zone={z} tone="tp" label={(sc.tp_zones.length > 1) ? `target ${k + 1}` : 'target'} />)}
                    </ul>
                </div>
            ))}
        </section>
    )
}
SetupScenarios.propTypes = { setup: PropTypes.object.isRequired }

function rrTag(sc) {
    return Number.isFinite(sc?.rr) ? <em className="setup-plan__tag"> {sc.rr}R</em> : null
}

function LiveNumbers({ ps, closed }) {
    const e = ps.entry ?? {}, s = ps.stop ?? {}, m = ps.metrics ?? {}, o = ps.outcome
    const taken = Array.isArray(ps.taken) ? ps.taken : []
    return (
        <div className="setup-plan__live">
            <div className="setup-plan__grid">
                <div className="setup-plan__cell"><span>Entry</span><b>{e.fill_price ?? e.intended ?? '—'}</b></div>
                <div className="setup-plan__cell"><span>Stop</span><b>{s.current ?? '—'}</b>{s.initial != null && s.initial !== s.current && <em> (init {s.initial})</em>}</div>
                <div className="setup-plan__cell"><span>Size</span><b>{e.size ?? '—'}</b></div>
                {!closed && <div className="setup-plan__cell"><span>R now</span><b className={m.r_multiple_now > 0 ? 'pos' : m.r_multiple_now < 0 ? 'neg' : ''}>{fmtR(m.r_multiple_now)}</b></div>}
                {!closed && (m.mfe != null || m.mae != null) && <div className="setup-plan__cell"><span>MFE / MAE</span><b>{fmtR(m.mfe)} / {fmtR(m.mae)}</b></div>}
            </div>
            {taken.length > 0 && (
                <div className="setup-plan__taken">
                    <span className="setup-plan__sub">Taken</span>
                    {taken.map((t, i) => <span key={i} className="setup-plan__taken-row">{t.kind} {t.size ?? ''}{t.r_multiple != null ? ` · ${fmtR(t.r_multiple)}` : ''}</span>)}
                </div>
            )}
            {closed && o && (
                <div className={`setup-plan__outcome ${o.r_multiple > 0 ? 'is-win' : o.r_multiple < 0 ? 'is-loss' : ''}`}>
                    <span>{o.reason}</span>
                    <span className="setup-plan__outcome-r">{fmtR(o.r_multiple)}</span>
                    {o.exit_price != null && <span className="setup-plan__outcome-bit">exit {o.exit_price}</span>}
                    {o.pnl != null && <span className="setup-plan__outcome-bit">P&amp;L {o.pnl}</span>}
                </div>
            )}
        </div>
    )
}
LiveNumbers.propTypes = { ps: PropTypes.object.isRequired, closed: PropTypes.bool }
