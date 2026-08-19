import PropTypes from 'prop-types'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip'
import { ScenarioBlock, fmtZone } from './ScenarioBlock.jsx'
import { ConditionList } from './ConditionList.jsx'
import './SetupSummary.scss'

// The live worksheet — the setup as built so far, filling in turn by turn.
//
// Mentor re-emits the COMPLETE setup every turn, so this is a pure render of the current draft;
// there is no separate state to reconcile. The panel owns the draft and hands it down.
//
// A SETUP IS A LIST OF WAYS IN. Each scenario owns its entry, stop, targets, conditions and its own
// death line, and the first to fulfil takes the whole trade. Rendering one set of levels would hide
// the second premise entirely — including the case where one has already died and another is still
// armed — so every scenario gets a block.
//
// What earns its space here, because nothing else in the app shows it: the CONDITIONS, which are
// what the monitor will actually check. An undeclared thing is never looked at, and a declared one
// is paid for on every wake, so the user should see the instruction sheet they are writing.
//
// It does NOT own Generate or readiness. Those live at the BOTTOM of the chat pane with the other
// agent actions (where Kairos puts its Generate too): the preview is a reference you glance up at,
// while the thing you press belongs where your attention already is — under the conversation.

const fmtDate = (iso) => {
    if (!iso) return null
    try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
}

// The worksheet folded onto one line, for the collapsed preview header. It lives here rather than
// in the panel so the summary and its one-liner describe the setup in the same vocabulary — a way
// in is a way in in both, and the entry band is formatted by the one shared fmtZone.
//
// Says the things you check at a glance and could not otherwise see while folded: WHICH asset,
// which direction, and how many rival premises are drawn (the count is the surprising one — a
// second way in is easy to forget you agreed to).
export function setupDigest(setup) {
    if (!setup?.asset) return ''
    const parts = [setup.asset]
    if (setup.direction) parts.push(setup.direction.toUpperCase())

    const scenarios = setup.scenarios ?? []
    if (scenarios.length === 1) {
        const zone = fmtZone(scenarios[0].entry_zones?.[0])
        parts.push(zone ? 'entry ' + zone : '1 way in')
    } else if (scenarios.length > 1) {
        parts.push(scenarios.length + ' ways in')
    }
    return parts.join(' · ')
}

export function SetupSummary({ setup, onChange, readOnly = false }) {
    if (!setup?.asset) {
        return <div className="setup-summary setup-summary--empty">Your setup will build here as you talk it through.</div>
    }

    const dir       = setup.direction ? setup.direction.toUpperCase() : null
    const scenarios = setup.scenarios ?? []
    const deadOf    = (id) => setup.monitor_state?.scenarios?.[id]?.invalidation_status === 'fired'

    // Writes back into `scenarios`, never into the flat zones: those are the server's execution
    // projection of whichever premise armed, so an edit there is discarded on Generate.
    function patchScenario(id, next) {
        onChange?.({ ...setup, scenarios: scenarios.map(s => (s.id === id ? next : s)) })
    }

    function addScenario() {
        const id = `s${scenarios.length + 1}`
        onChange?.({
            ...setup,
            scenarios: [...scenarios, { id, name: '', entry_zones: [], stop_zones: [], tp_zones: [], conditions: [], validity: null }],
        })
    }

    function removeScenario(id) {
        onChange?.({ ...setup, scenarios: scenarios.filter(s => s.id !== id) })
    }

    return (
        <div className="setup-summary">
            <header className="setup-summary__head">
                <div className="setup-summary__title">
                    <span className="setup-summary__asset">{setup.asset}</span>
                    {dir && <span className={`setup-summary__dir setup-summary__dir--${setup.direction}`}>{dir}</span>}
                </div>
                <div className="setup-summary__tags">
                    {setup.type && <span className="setup-summary__tag">{setup.type}</span>}
                    {setup.trade_mode && (
                        <span className="setup-summary__tag setup-summary__tag--lens" title={setup.trade_mode === 'smc' ? 'Smart-money concepts — structure, order blocks, FVG, liquidity' : 'Classical price action'}>
                            {setup.trade_mode}
                        </span>
                    )}
                    {setup.timeframe && <span className="setup-summary__tag">{setup.timeframe}</span>}
                </div>
            </header>

            {setup.thesis && <p className="setup-summary__thesis">{setup.thesis}</p>}

            <ConditionList
                conditions={setup.conditions}
                title="Always — whichever way in"
                hint="True of the trade whatever prints. Checked alongside the conditions of whichever premise price reaches, so it is written once rather than copied into each."
            />

            {scenarios.length === 0 && <p className="setup-summary__empty-ways">No way in drawn yet.</p>}

            {scenarios.map((sc, i) => (
                <ScenarioBlock
                    key={sc.id ?? i}
                    scenario={sc}
                    direction={setup.direction}
                    index={i}
                    armed={setup.armed_scenario_id === sc.id}
                    dead={deadOf(sc.id)}
                    onChange={next => patchScenario(sc.id, next)}
                    onRemove={removeScenario}
                    removable={scenarios.length > 1}
                    readOnly={readOnly}
                />
            ))}

            {!readOnly && (
                <button type="button" className="setup-summary__add-way" onClick={addScenario}
                    title="A different premise — the other side of the level, a break instead of a fade. Whichever fulfils first takes the whole trade.">
                    + another way in
                </button>
            )}

            <div className="setup-summary__metrics">
                <ConvictionChip conviction={setup.conviction} />
            </div>

            {(setup.active_from || setup.valid_until) && (
                <p className="setup-summary__window">
                    {setup.active_from && <>from {fmtDate(setup.active_from)} </>}
                    {setup.valid_until && <>until {fmtDate(setup.valid_until)}</>}
                </p>
            )}

            {setup.event_risk?.length > 0 && (
                <p className="setup-summary__events" title="Scheduled catalysts, stamped at Generate. Talos always checks these, whether or not the setup declares a news factor.">
                    ⚑ {setup.event_risk.map(e => `${e.date} ${e.label}`).join(' · ')}
                </p>
            )}

        </div>
    )
}

SetupSummary.propTypes = {
    setup:    PropTypes.object,
    onChange: PropTypes.func,
    readOnly: PropTypes.bool,
}
