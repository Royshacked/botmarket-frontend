import { useState } from 'react'
import PropTypes from 'prop-types'
import { TalosBadge } from '../cmps/AxlHub/AgentBadges.jsx'
import { EntityPopupShell } from '../cmps/EntityCard/EntityPopupShell.jsx'
import { PopoutFooter } from '../cmps/TradeIdeas/PopoutFooter.jsx'
import { MonitorJournal } from '../cmps/TradeIdeas/MonitorJournal.jsx'
// Shared with the call pop-out — `position_state` is one shape whatever desk wrote it.
import { PositionPanel } from '../cmps/TradeIdeas/PositionPanel.jsx'
import { TalosWatch } from '../cmps/TradeIdeas/TalosWatch.jsx'
import { watchTimeframe, showsWatch } from '../cmps/TradeIdeas/talosWatch.js'
import { positionsForEntity } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { PriceChart } from '../cmps/PriceChart/PriceChart.jsx'
import { ConvictionChip } from '../cmps/ConvictionChip/ConvictionChip'
import { setupIcon, isSetupArmed, canArmSetup } from '../cmps/TradeIdeas/setupStatus.js'
import { MANAGE_LABEL, canAcceptManage, manageProposalLine } from '../cmps/TradeIdeas/setupManage.js'
import { isLivePosition, isTerminal, isInvalidated } from '../services/entityStatus.js'
import { useEntityPopup } from '../customHooks/useEntityPopup.js'
import { usePositions } from '../customHooks/usePositions.js'
import { mentorService } from '../services/mentor/mentor.service.remote'
import { askOpener, hasOpener } from '../services/popupBridge.js'
import { SETUP_INVALIDATION_EDIT } from '../services/event-bus.service'
import './IdeaPage.scss'      // the shared pop-out shell (header + chart 70 / column 30)
import './SetupPage.scss'     // setup-only bits (zones, watch list, timeline)

// The `setup` pop-out. Setups previously had NO window — clicking one switched the chat tab —
// because giving them one meant hand-writing a fourth copy of the hand-off, the hydration ladder
// and the popup chrome. With those shared, the page is just this kind's content.
//
// What a setup is FOR is different from an idea or a call: it has no condition tree, only ZONES —
// and those zones belong to SCENARIOS, rival ways into the same trade, each with its own stop,
// targets, conditions and death line. Everything is shown verbatim rather than summarised: the
// premises are the entity, and their conditions are why the monitor looks where it does.
//
// The doc's flat `entry_zones`/`stop_zones`/`tp_zones` are deliberately NOT rendered here — they are
// the execution projection of whichever premise armed, so showing them alongside the scenarios would
// print the same levels twice and imply a fourth set of zones that nobody authored.

// Sentence-length copy, unlike the card's two-word labels — a pop-out has room to say what the
// state MEANS. The ladder itself (and the icon borrow) lives in setupStatus.js.
// The ONE shared ladder (services/entity/vocabulary.js). This table used to hold the setup's private
// vocabulary — `unarmed`/`watching`/`ready` — which meant the words the app actually writes had no
// copy at all: an armed setup sitting in `looking` printed the raw status. Being in a zone is
// `armed_zone_id`, not a rung, so there is deliberately no separate "in zone" line here.
const STATUS_COPY = {
    waiting: 'Not watched — generated but not armed, Talos is not looking at it yet',
    looking: 'Armed — Talos is watching for price to reach a zone',
    hit:     'Triggered — the setup filled in and an order is awaiting your confirmation',
    long:    'In position (long)',
    short:   'In position (short)',
    closed:  'Closed',
}

const fmtZone = z => (z?.lower === z?.upper ? `${z?.lower}` : `${z?.lower} – ${z?.upper}`)

function ZoneRow({ label, zones, tone }) {
    const list = Array.isArray(zones) ? zones : []
    if (!list.length) return null
    return (
        <div className={`setup-page__zone setup-page__zone--${tone}`}>
            <span className="setup-page__zone-label">{label}</span>
            <ul className="setup-page__zone-list">
                {list.map((z, i) => (
                    <li key={z.id ?? i}>
                        <span className="setup-page__zone-range">{fmtZone(z)}</span>
                        {z.note && <span className="setup-page__zone-note"> — {z.note}</span>}
                    </li>
                ))}
            </ul>
        </div>
    )
}
ZoneRow.propTypes = { label: PropTypes.string, zones: PropTypes.array, tone: PropTypes.string }

/** The monitor's instruction sheet, as prose. Free text — there is no taxonomy to render. */
function ConditionRow({ label, conditions }) {
    const list = Array.isArray(conditions) ? conditions : []
    if (!list.length) return null
    return (
        <div className="setup-page__conditions">
            <span className="setup-page__section-label">{label}</span>
            <ul>{list.map((c, i) => (
                <li key={c.id ?? i}>
                    {c.text}
                    {c.weight === 'primary' && <em className="setup-page__cond-tag"> primary</em>}
                    {c.persistence === 'latching' && <em className="setup-page__cond-tag"> latching</em>}
                </li>
            ))}</ul>
        </div>
    )
}
ConditionRow.propTypes = { label: PropTypes.string, conditions: PropTypes.array }

/**
 * ONE WAY IN. A setup can hold rival premises — a false break at one level, a break-and-go at
 * another — each owning its entry, stop, targets, conditions and its own death line. The first to
 * fulfil takes the whole trade, so the sizes shown here are never added together.
 */
function ScenarioSection({ scenario, index, armed, dead }) {
    if (!scenario) return null
    const name = scenario.name?.trim() || `Way in ${index + 1}`
    return (
        <section className={`setup-page__scenario${armed ? ' is-armed' : ''}${dead ? ' is-dead' : ''}`} aria-label={`Scenario ${name}`}>
            <span className="setup-page__section-label">
                {name}
                {armed && <em className="setup-page__cond-tag" title="Price reached this premise — this is the one that fired."> armed</em>}
                {dead  && <em className="setup-page__cond-tag" title="This premise broke its own validity range. Any other way in is unaffected."> dead</em>}
                {scenario.quantity != null && <em className="setup-page__cond-tag"> qty {scenario.quantity}</em>}
                {Number.isFinite(scenario.rr) && <em className="setup-page__cond-tag"> {scenario.rr}R</em>}
            </span>
            <ZoneRow label="Entry"  zones={scenario.entry_zones} tone="entry" />
            <ZoneRow label="Stop"   zones={scenario.stop_zones}  tone="stop" />
            <ZoneRow label="Target" zones={scenario.tp_zones}    tone="tp" />
            <ConditionRow label="Takes it when" conditions={scenario.conditions} />
        </section>
    )
}
ScenarioSection.propTypes = { scenario: PropTypes.object, index: PropTypes.number, armed: PropTypes.bool, dead: PropTypes.bool }

/**
 * Talos's pending management proposal, and the two buttons that answer it. The twin of CallPage's
 * ManagementCard — same shell, same verbs, one difference that matters:
 *
 * `add_leg` gets NO accept button. Talos has already built the order plan for a printing second leg
 * and parked it awaiting confirmation, so that size is placed by confirming the ORDER (the same
 * dialog a first entry uses). An Accept here would place it twice, so the card says where the
 * action lives instead. The server refuses it too (`confirm_order`) — this is the half that keeps
 * the user from being sent somewhere the app will then say no.
 *
 * `let_run` depends on what it carries. Bare, it is a decision NOT to act and reads as a note. With
 * a new target it is Talos asking to move the resting limit further out, which is an amend like any
 * other — so the proposal has to reach the gate, not just the verdict.
 */
function ManagementCard({ pending, busy, onAccept, onDismiss }) {
    const v = pending?.verdict
    if (!v) return null
    const acceptable = canAcceptManage(v, pending.proposal)
    return (
        <div className={`kairos-panel__card kairos-panel__card--manage verdict--${v}`}>
            <div className="kairos-panel__card-head">
                <span className="kairos-panel__card-status">Talos suggests</span>
                <span className={`monitor-journal__verdict verdict--${v}`}>{v}</span>
            </div>
            <div className="kairos-panel__card-row">{manageProposalLine(v, pending.proposal)}</div>
            {pending.read && <div className="kairos-panel__card-note">{pending.read}</div>}
            <div className="call-page__actions">
                {acceptable && (
                    <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" disabled={busy} onClick={() => onAccept(v)}>
                        {MANAGE_LABEL[v]}
                    </button>
                )}
                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" disabled={busy} onClick={onDismiss}>Dismiss</button>
            </div>
        </div>
    )
}
ManagementCard.propTypes = { pending: PropTypes.object, busy: PropTypes.bool, onAccept: PropTypes.func.isRequired, onDismiss: PropTypes.func.isRequired }

/**
 * TALOS SAYS THIS PLAN NEEDS RE-DRAWING — the pre-entry twin of the management card above, and the
 * setup's answer to CallPage's "Accept edit".
 *
 * It is NOT that button, deliberately. A call's `edit_proposal` has a defined shape that
 * `applyEditPatch` can apply on the server, so a call can accept a re-map in one click. A setup's
 * proposal carries free-form `changes` against a plan of rival scenarios, each with its own zones,
 * stop, size and death line — there is nothing that could safely apply it, and a one-click "accept"
 * that silently rewrote a premise would be worse than no button. So the setup's answer is to take
 * the proposal to the desk that owns re-drawing: same destination as the social-chat card, reached
 * through the one bridge back to the app window.
 *
 * The proposal's WHY is shown here in full even though the ask leaves — it is Talos's reasoning
 * about this plan, and the pop-out is where the plan is read.
 */
function StaleMapCard({ setup, onRedraw }) {
    const why = setup.invalidation_reason ?? setup.monitor_state?.last_assessment?.edit_proposal?.why ?? null
    return (
        <div className="kairos-panel__card kairos-panel__card--expiring">
            <div className="kairos-panel__card-head">
                <span className="kairos-panel__card-status">Talos says this needs re-drawing</span>
            </div>
            {why && <div className="kairos-panel__card-note">{why}</div>}
            <div className="call-page__actions">
                {onRedraw
                    ? (
                        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={onRedraw}>
                            Re-draw it in Mentor
                        </button>
                    )
                    : (
                        // Opened from a pasted URL: there is no app window to open Mentor in, and a
                        // button that can only fail is worse than a sentence saying where to go.
                        <span className="setup-page__memo">Open this setup from the app to re-draw it.</span>
                    )}
            </div>
        </div>
    )
}
StaleMapCard.propTypes = { setup: PropTypes.object.isRequired, onRedraw: PropTypes.func }

export function SetupPage() {
    // Polled because Talos writes to monitor_state (memo + timeline) while the window is open.
    const { id, entity: setup, error, refresh } = useEntityPopup(
        'setup', mentorService.getSetup, { pollMs: 20_000, notFound: 'Setup not found' },
    )
    const { positions, refresh: refreshPositions, closePosition } = usePositions()
    const [busy, setBusy] = useState(false)

    if (error || !setup) return <EntityPopupShell error={error} loading={!setup} />

    async function handleDelete() {
        try { await mentorService.deleteSetup(id); window.close() }
        catch (e) { console.error('[setup-page] delete failed', e) }   // e.g. in_position (409)
    }
    async function toggleArm() {
        const next = isSetupArmed(setup.status) ? mentorService.disarmSetup : mentorService.armSetup
        try { await next(id); await refresh() }
        catch (e) { console.error('[setup-page] arm toggle failed', e) }
    }
    // Accept / dismiss the management card. Refresh either way: accepting writes stop.current and
    // clears the card, dismissing clears it — both change what this page should be showing.
    async function act(action) {
        setBusy(true)
        try { await mentorService.actOnSetup(id, action); await refresh() }
        catch (e) { console.error('[setup-page] act failed', e) }
        finally { setBusy(false) }
    }

    // Positions belonging to THIS setup — matched by broker linkage, not by symbol. Talos stamps
    // brokerOrders onto the setup when it fires, so a portfolio holding on the same ticker is a
    // different entity and must not show up here (it also made PopoutFooter delete-lock a setup
    // that owned no position at all).
    const setupPositions = positionsForEntity(setup, positions)

    const canToggle = canArmSetup(setup.status) || isSetupArmed(setup.status)

    // The stale-map ask is PRE-ENTRY only, on the same `showsWatch` boundary the watch panel uses:
    // past entry the position is the live surface and the management card above is what speaks, and
    // a "re-draw the plan" button beside an open trade would be offering to rewrite the thing the
    // broker is already holding. `isInvalidated` is the FIRED latch (the same read CallPage makes) —
    // a merely DRIFTING setup is the "ran away" case, which asks nothing of anyone.
    const needsRedraw = showsWatch(setup.status) && isInvalidated(setup.invalidation_status)

    function handleRedraw() {
        // Ask, then close: the plan is rewritten in the app window, and leaving this one open on the
        // superseded version is how a user ends up editing against a stale read of their own setup.
        if (askOpener(SETUP_INVALIDATION_EDIT, { setupId: id })) window.close()
    }

    return (
        <EntityPopupShell
            className="setup-page"
            badge={<TalosBadge size={22} />}
            asset={setup.asset}
            direction={setup.direction}
            status={setup.status}
            iconStatus={setupIcon(setup.status)}
            statusLabel={STATUS_COPY[setup.status] ?? setup.status}
            meta={[
                setup.type ?? null,
                setup.trade_mode ?? null,
                setup.quantity != null ? `qty ${setup.quantity}` : null,
                Number.isFinite(setup.rr) ? `${setup.rr}R` : null,
                setup.valid_until ? `valid until ${new Date(setup.valid_until).toLocaleString()}` : null,
            ]}
            headerExtra={canToggle && (
                <button className="setup-page__arm" onClick={toggleArm}>
                    {isSetupArmed(setup.status) ? 'Stop watching' : 'Arm it'}
                </button>
            )}
        >
            <div className="idea-dialog__main">
                <div className="idea-dialog__chart">
                    {/* The rung TALOS is on, not just the one the setup was drawn on. A read that
                        climbed to the 4hr for structure would otherwise leave the user staring at an
                        hourly chart while the journal below talks about a four-hour close. */}
                    <PriceChart symbol={setup.asset || 'SPY'} interval={watchTimeframe(setup)} />
                </div>

                <div className="idea-dialog__conditions setup-page__panel">
                    {/* Actionable cards first — these are waiting on the user. */}
                    {isLivePosition(setup.status) && setup.position_state?.pending_action && (
                        <ManagementCard
                            pending={setup.position_state.pending_action} busy={busy}
                            onAccept={v => act(v)} onDismiss={() => act('dismiss')}
                        />
                    )}
                    {needsRedraw && (
                        <StaleMapCard setup={setup} onRedraw={hasOpener() ? handleRedraw : null} />
                    )}

                    {/* ── 1. Trade general info ── */}
                    {setup.thesis && <p className="setup-page__thesis">{setup.thesis}</p>}
                    <div className="setup-page__metrics">
                        <ConvictionChip conviction={setup.conviction} />
                        {setup.mode && <span className="setup-page__mode">{setup.mode}</span>}
                        {setup.brokerSymbol && <span className="setup-page__broker">trades as {setup.brokerSymbol}</span>}
                    </div>
                    {setup.monitor_state?.memo && (
                        <p className="setup-page__memo">{setup.monitor_state.memo}</p>
                    )}

                    {/* ── 2. Requested setup + timeframes ── */}
                    <span className="setup-page__section-label">Requested setup</span>
                    {(setup.timeframe || setup.ladder?.length) && (
                        <div className="setup-page__timeframes">
                            {setup.ladder?.length > 1
                                ? <span className="setup-page__tf-ladder">{setup.ladder.join(' → ')}</span>
                                : <span className="setup-page__tf-ladder">{setup.timeframe}</span>
                            }
                        </div>
                    )}
                    <ConditionRow label="Always" conditions={setup.conditions} />
                    {(setup.scenarios ?? []).map((sc, i) => (
                        <ScenarioSection
                            key={sc.id ?? i}
                            scenario={sc}
                            index={i}
                            armed={setup.armed_scenario_id === sc.id}
                            dead={setup.monitor_state?.scenarios?.[sc.id]?.invalidation_status === 'fired'}
                        />
                    ))}

                    {/* ── 3–5. Monitor state → next check → findings (pre-entry only) ──
                        Past entry the management card above is the live surface; last_assessment
                        would be the read that got us IN, not a current read. */}
                    {showsWatch(setup.status) && <TalosWatch setup={setup} />}

                    {/* Past entry: position panel (R, stop, target ladder). */}
                    {(isLivePosition(setup.status) || isTerminal(setup.status)) && setup.position_state && (
                        <PositionPanel ps={setup.position_state} status={setup.status} />
                    )}

                    {/* ── Journal ── */}
                    <span className="setup-page__section-label">Talos journal</span>
                    <MonitorJournal
                        timeline={setup.monitor_state?.timeline}
                        empty="No monitor activity yet — the journal fills in as Talos wakes to check this setup."
                    />
                </div>
            </div>

            <PopoutFooter
                positions={setupPositions}
                closePosition={closePosition}
                onPositionsChanged={refreshPositions}
                onDelete={handleDelete}
                deleteTitle="Delete setup"
            />
        </EntityPopupShell>
    )
}
