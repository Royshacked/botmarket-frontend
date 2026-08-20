import PropTypes from 'prop-types'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip'
import { ScenarioBlock, fmtZone } from './ScenarioBlock.jsx'
import { ConditionList } from './ConditionList.jsx'
import { Step } from './Step.jsx'
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
// ── Two modes ────────────────────────────────────────────────────────────────
// `authoring` turns the header, the thesis and the conditions into fields. That is the express
// form's body (cmps/SetupForm) — the user typing a plan they already have rather than being asked
// for it a turn at a time. Everything below the header is the SAME ScenarioBlock / ZoneEditor /
// ConditionList either way, deliberately: a setup typed in and a setup argued into being are one
// artifact, and two editors for one shape is how they stop being.
//
// `locked` narrows authoring for a plan drawn by somebody ELSE. `['plan']` freezes the lot except
// the sizes, which is the shared-setup case exactly: their levels, their conditions, your money.
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
// scenario is an entry scenario in both, and the entry band is formatted by the one shared fmtZone.
//
// Says the things you check at a glance and could not otherwise see while folded: WHICH asset,
// which direction, and how many rival premises are drawn (the count is the surprising one — a
// second entry scenario is easy to forget you agreed to).
export function setupDigest(setup) {
    if (!setup?.asset) return ''
    const parts = [setup.asset]
    if (setup.direction) parts.push(setup.direction.toUpperCase())

    const scenarios = setup.scenarios ?? []
    if (scenarios.length === 1) {
        const zone = fmtZone(scenarios[0].entry_zones?.[0])
        parts.push(zone ? 'entry ' + zone : '1 entry scenario')
    } else if (scenarios.length > 1) {
        parts.push(scenarios.length + ' entry scenarios')
    }
    return parts.join(' · ')
}

export function SetupSummary({ setup, onChange, readOnly = false, authoring = false, locked = [], ladder = null, vocab = null, pricesOnly = false,
    timeframes = null, onTimeframes = null }) {
    // Authoring opens on an EMPTY setup by definition — the asset is the first thing to be typed,
    // so the "nothing yet" placeholder would replace the form with a sentence about the form.
    if (!setup?.asset && !authoring) {
        return <div className="setup-summary setup-summary--empty">Your setup will build here as you talk it through.</div>
    }

    const edit     = authoring && !readOnly
    // `plan` is the coarse lock the shared case wants; the field names are there for finer use.
    const isLocked = (key) => locked.includes('plan') || locked.includes(key)
    const set      = (field, value) => onChange?.({ ...setup, [field]: value })
    // NUMBERED STEPS, but only where they help: someone typing a plan from scratch needs to be told
    // what to do next, and someone reading a plan that arrived already drawn does not. So a locked
    // (shared) setup keeps the compact presentation and only its size boxes are live.
    const stepped  = edit && pricesOnly && !isLocked('nucleus')

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
            {edit && !isLocked('nucleus') ? (
                <SetupFields
                    setup={setup} set={set} isLocked={isLocked} ladder={ladder ?? setup.ladder} vocab={vocab}
                    stepped={stepped} timeframes={timeframes} onTimeframes={onTimeframes}
                />
            ) : (
                <>
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
                </>
            )}

            {/* THE SETUP-WIDE TIER ONLY APPEARS WHEN IT MEANS SOMETHING.
                It is optional — `setupReadiness` wants at least one condition SOMEWHERE, and the two
                tiers satisfy that for each other. With a single entry scenario they are therefore
                indistinguishable: a condition written here and one written under "Takes this entry
                when" are checked at the same moment, against the same price, with the same effect.
                Asking for both is asking the user to understand a distinction that does not yet make
                a difference to them.

                And the express form never asks for it AT ALL, because deciding which of your
                conditions is general is filing, not trading — Mentor hoists them when it draws the
                zones (see the express hand-off in its prompt). What is shown here is what already
                HOLDS something: a plan someone shared, or one Mentor has been through. Never hide
                what somebody wrote. */}
            {(!edit || (setup.conditions?.length ?? 0) > 0) && (
                <ConditionList
                    conditions={setup.conditions}
                    title="Always — whichever entry"
                    hint="True of the trade whatever prints. Checked alongside the conditions of whichever entry scenario price reaches, so it is written once rather than copied into each."
                    onChange={edit && !isLocked('conditions') ? (next => set('conditions', next)) : null}
                />
            )}

            {scenarios.length === 0 && <p className="setup-summary__empty-ways">No entry scenario drawn yet.</p>}

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
                    authoring={edit}
                    lockPrices={edit && isLocked('plan')}
                    pricesOnly={pricesOnly}
                    // Steps 5-7 continue the run started by the nucleus. Only the FIRST entry
                    // scenario is numbered: a second one is a repeat of the same three questions,
                    // and numbering it 8-9-10 would imply a longer sequence than there is.
                    stepFrom={stepped && i === 0 ? 5 : null}
                />
            ))}

            {!readOnly && !isLocked('plan') && (
                // "another scenario", not "another entry scenario": the blocks above are already
                // titled Entry scenario 1, 2…, so repeating the noun in full says nothing the
                // context has not. The `+` is a disc rather than part of the string, matching the
                // add-condition button — one shape for "this adds another one of those".
                <button type="button" className="setup-summary__add-way" onClick={addScenario}
                    title="A different premise — the other side of the level, a break instead of a fade. Whichever fulfils first takes the whole trade.">
                    <span className="setup-summary__add-plus" aria-hidden="true">+</span>
                    <span className="setup-summary__add-text">
                        another scenario
                        <em>a rival way in — first one to fulfil takes the trade</em>
                    </span>
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

/**
 * The nucleus, as fields: ticker · direction · horizon · timeframe · lens, plus the thesis.
 *
 * These are the five things Mentor's prompt calls the nucleus — what has to be true before there is
 * a setup at all — and in a conversation they are asked for one at a time, naturally. A user who
 * already has the plan wants them all on screen at once, which is the entire difference between
 * this and the build.
 *
 * THE OPTIONS ARE SERVED, NOT HARDCODED (`vocabulary` off the hydrate response). The horizon list,
 * the lens list and the fetchable rungs are each already defined once on the server; a copy here
 * would be the one that quietly refuses a lens the rest of the app has gained. Until it arrives the
 * selects render with the current value alone, so the form is never briefly lying about the choices.
 */
/**
 * A choice made of BUTTONS, not a dropdown.
 *
 * Every one of these is a two-to-four-way choice from a closed set, and a `<select>` hides the
 * options behind a click to save space this form is not short of. Seeing that "swing" sits beside
 * "intraday" and "day" is also the fastest way to understand what the field is asking.
 *
 * Options are SERVED, so a set the client has never heard of still renders (see SetupFields).
 */
function Segmented({ label, hint, value, options, disabled, onPick, multi = false, hideLabel = false }) {
    if (!options?.length) return null
    const picked = multi ? (Array.isArray(value) ? value : []) : [value]
    const isOn   = (opt) => picked.includes(opt)

    // Single: picking the live value CLEARS it. A closed set with no "none" button is otherwise a
    // one-way door — choose `swing` by mistake and there is no way back to unanswered, only to a
    // different wrong answer. Multi: the same gesture, one option at a time.
    const pick = (opt) => {
        if (!multi) return onPick(isOn(opt) ? null : opt)
        // Kept in the OPTIONS' order rather than click order, so the list always reads coarse→fine
        // the way the choices are presented. Which one is "first" is not a decision the user is
        // making here — Mentor picks the primary (see the timeframe step).
        const next = isOn(opt) ? picked.filter(p => p !== opt) : [...picked, opt]
        onPick(options.filter(o => next.includes(o)))
    }

    return (
        <div className="setup-fields__field">
            {!hideLabel && <span className="setup-fields__label" title={hint}>{label}</span>}
            <div className="setup-fields__segmented" role="group" aria-label={label}>
                {options.map(opt => (
                    <button
                        key={opt} type="button" disabled={disabled}
                        className={`setup-fields__seg${isOn(opt) ? ' is-on' : ''}`}
                        aria-pressed={isOn(opt)}
                        onClick={() => pick(opt)}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    )
}

function SetupFields({ setup, set, isLocked, ladder, vocab, stepped = false, timeframes = null, onTimeframes }) {
    // Not stepped — the compact two-row layout, for a plan that is being read rather than filled in.
    if (!stepped) {
        return (
            <div className="setup-fields">
                <div className="setup-fields__row">
                    <TickerField setup={setup} set={set} isLocked={isLocked} />
                    <Segmented label="Direction" value={setup.direction} options={vocab?.directions}
                        disabled={isLocked('direction')} onPick={v => set('direction', v)} />
                </div>
                <div className="setup-fields__row">
                    <Segmented label="Horizon" value={setup.type} options={vocab?.horizons}
                        disabled={isLocked('type')} onPick={v => set('type', v)} />
                    <Segmented label="Timeframe" value={setup.timeframe} options={vocab?.timeframes}
                        disabled={isLocked('timeframe')} onPick={v => set('timeframe', v)} />
                </div>
                <LadderLine ladder={ladder} />
                <ThesisField setup={setup} set={set} isLocked={isLocked} />
            </div>
        )
    }

    const picked = timeframes ?? (setup.timeframe ? [setup.timeframe] : [])

    return (
        <div className="setup-fields setup-fields--stepped">
            <Step n={1} title="Which ticker?" done={!!setup.asset}>
                <TickerField setup={setup} set={set} isLocked={isLocked} />
            </Step>

            <Step n={2} title="Which way?" done={!!setup.direction}>
                <Segmented label="Direction" hideLabel value={setup.direction} options={vocab?.directions}
                    disabled={isLocked('direction')} onPick={v => set('direction', v)} />
            </Step>

            <Step n={3} title="How long are you in it?" done={!!setup.type}
                hint="Sets how often it gets checked — an intraday plan every few minutes, a swing every few hours.">
                <Segmented label="Horizon" hideLabel value={setup.type} options={vocab?.horizons}
                    disabled={isLocked('type')} onPick={v => set('type', v)} />
            </Step>

            {/* MORE THAN ONE IS ALLOWED, because traders read more than one. The document holds a
                single `timeframe` — it is what the monitor's rung window is centred on — so when
                several are picked, MENTOR chooses which one that is and folds the rest into the
                plan's wording. Same division of labour as the lens and the zones: the user says what
                is true of how they trade, the desk decides how to file it. */}
            <Step n={4} title="Off which chart?" done={picked.length > 0}
                hint={picked.length > 1
                    ? 'Mentor will pick which one the monitor is centred on and work the others into the plan.'
                    : 'The chart the plan is drawn on. Pick more than one if you read it off several.'}>
                <Segmented
                    label="Timeframe" hideLabel value={picked} options={vocab?.timeframes} multi
                    disabled={isLocked('timeframe')} onPick={onTimeframes}
                />
                <LadderLine ladder={ladder} />
            </Step>
        </div>
    )
}

function TickerField({ setup, set, isLocked }) {
    return (
        <label className="setup-fields__field setup-fields__field--asset">
            <span className="setup-fields__label">Ticker</span>
            <input
                className="setup-fields__input" value={setup.asset ?? ''} placeholder="Name a ticker…"
                disabled={isLocked('asset')} aria-label="Ticker"
                // Uppercased as they type: the asset is a key everywhere downstream (the venue
                // lookup, the position match), and `nvda` reaching the server as a different string
                // from `NVDA` is a class of bug worth never having.
                onChange={e => set('asset', e.target.value.toUpperCase())}
            />
        </label>
    )
}

function ThesisField({ setup, set, isLocked }) {
    return (
        <label className="setup-fields__field setup-fields__field--wide">
            <span className="setup-fields__label" title="Why this trade. Not checked by anything — it is what you will read back when you review the trade later.">Thesis <em>(optional)</em></span>
            <textarea
                className="setup-fields__textarea" rows={2} value={setup.thesis ?? ''}
                placeholder="Why this trade, in a line" disabled={isLocked('thesis')} aria-label="Thesis"
                onChange={e => set('thesis', e.target.value)}
            />
        </label>
    )
}

/**
 * SAID OUT LOUD, because it is derived and nobody would guess it: the timeframe does not only say
 * which chart the plan is drawn on, it BOUNDS what the monitor may look at. Someone picking `day` is
 * also deciding the assessment can never wander onto a monthly chart, and that is worth seeing while
 * the choice is still open.
 */
function LadderLine({ ladder }) {
    if (!ladder?.length) return null
    return (
        <p className="setup-fields__ladder" title="Derived from the timeframe. The monitor may read these rungs and no others.">
            Monitor watches: {ladder.join(' · ')}
        </p>
    )
}

TickerField.propTypes = { setup: PropTypes.object.isRequired, set: PropTypes.func.isRequired, isLocked: PropTypes.func.isRequired }
ThesisField.propTypes = TickerField.propTypes
LadderLine.propTypes  = { ladder: PropTypes.arrayOf(PropTypes.string) }

Segmented.propTypes = {
    label:    PropTypes.string.isRequired,
    hint:     PropTypes.string,
    // A string when single, an array when `multi`.
    value:    PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
    options:  PropTypes.arrayOf(PropTypes.string),
    disabled: PropTypes.bool,
    onPick:   PropTypes.func.isRequired,
    multi:     PropTypes.bool,
    // The step heading already asks the question, so repeating the field name under it is noise.
    hideLabel: PropTypes.bool,
}

SetupFields.propTypes = {
    setup:    PropTypes.object.isRequired,
    set:      PropTypes.func.isRequired,
    isLocked: PropTypes.func.isRequired,
    ladder:   PropTypes.arrayOf(PropTypes.string),
    vocab:    PropTypes.object,
    // Numbered steps instead of the compact rows — the express form.
    stepped:     PropTypes.bool,
    // Every timeframe the user reads this off. The document holds one; Mentor picks which.
    timeframes:  PropTypes.arrayOf(PropTypes.string),
    onTimeframes: PropTypes.func,
}

SetupFields.propTypes = {
    setup:    PropTypes.object.isRequired,
    set:      PropTypes.func.isRequired,
    isLocked: PropTypes.func.isRequired,
    ladder:   PropTypes.arrayOf(PropTypes.string),
    vocab:    PropTypes.object,
}

SetupSummary.propTypes = {
    setup:    PropTypes.object,
    onChange: PropTypes.func,
    readOnly: PropTypes.bool,
    // The header, thesis and conditions become fields — the express form's body.
    authoring: PropTypes.bool,
    // Fields the user may read but not change. `'plan'` freezes everything except the sizes.
    locked:    PropTypes.arrayOf(PropTypes.string),
    // The monitor's rung window, derived server-side from the timeframe. Passed separately from
    // `setup` so a form can keep it fresh without adopting the whole normalised copy mid-type.
    ladder:    PropTypes.arrayOf(PropTypes.string),
    // The server's own vocabularies, so the choices cannot drift from what it will accept.
    vocab:     PropTypes.object,
    // One price per level instead of a band, for the express form. See ZoneEditor.
    pricesOnly: PropTypes.bool,
    // Every timeframe the user reads this off, and the setter for them. The document holds one.
    timeframes:   PropTypes.arrayOf(PropTypes.string),
    onTimeframes: PropTypes.func,
}
