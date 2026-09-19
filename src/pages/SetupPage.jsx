import { useState, useMemo } from 'react'
import PropTypes from 'prop-types'
import { TalosBadge } from '../cmps/AxlHub/AgentBadges.jsx'
import { EntityPopupShell } from '../cmps/EntityCard/EntityPopupShell.jsx'
import { PopoutFooter } from '../cmps/TradeIdeas/PopoutFooter.jsx'
import { TalosJournal } from '../cmps/TradeIdeas/TalosJournal.jsx'
import { SetupScenarios } from '../cmps/TradeIdeas/SetupPlan.jsx'
import { planTail } from '../cmps/TradeIdeas/setupPlan.utils.js'
import { firstSentence, nextCallLine } from '../cmps/TradeIdeas/monitorJournal.utils.js'
import { FoldSection } from '../cmps/FoldSection.jsx'
// Shared with the call pop-out — `position_state` is one shape whatever desk wrote it.
import { watchTimeframe, showsWatch } from '../cmps/TradeIdeas/talosWatch.js'
import { positionsForEntity } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { deriveSetupOverlay } from '../cmps/TradeIdeas/chartOverlay.js'
import { PriceChart } from '../cmps/PriceChart/PriceChart.jsx'
import { ConvictionChip } from '../cmps/ConvictionChip/ConvictionChip'
import { setupIcon, isSetupArmed, canArmSetup } from '../cmps/TradeIdeas/setupStatus.js'
import { MANAGE_LABEL, canAcceptManage, manageProposalLine } from '../cmps/TradeIdeas/setupManage.js'
import { isLivePosition, isInvalidated } from '../services/entityStatus.js'
import { useEntityPopup } from '../customHooks/useEntityPopup.js'
import { useJournal } from '../customHooks/useJournal.js'
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
// The right column, top to bottom (docs/design/talos-per-candle.md): the cards waiting on the
// user, then three FOLDED sections — THESIS · SCENARIOS · TALOS JOURNAL — each a FoldSection whose
// summary line carries the section's gist, so the column reads as three lines with everything
// closed and the user opens what they came for. A setup's levels belong to SCENARIOS, rival ways
// into the same trade, each with its own entry, trigger, stop and targets — one block per scenario
// (SetupPlan.jsx), each leg saying whether it RESTS at the broker or is WATCHED by Talos. The
// journal is its own collection, newest first, headed by the NEXT CALL (useJournal / TalosJournal).
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

/**
 * Talos's pending management proposal, and the two buttons that answer it. The twin of the archived
 * CallPage's ManagementCard — same shell, same verbs, one difference that matters:
 *
 * `add_leg` gets NO accept button. Talos has already built the order plan for a printing second leg
 * and parked it awaiting confirmation, so that size is placed by confirming the ORDER (the same
 * dialog a first entry uses). An Accept here would place it twice, so the card says where the
 * action lives instead. The server refuses it too (`confirm_order`) — this is the half that keeps
 * the user from being sent somewhere the app will then say no.
 *
 */
function ManagementCard({ pending, busy, onAccept, onDismiss }) {
    const v = pending?.verdict
    if (!v) return null
    const acceptable = canAcceptManage(v, pending.proposal)
    return (
        <div className={`setup-page__card setup-page__card--manage verdict--${v}`}>
            <div className="setup-page__card-head">
                <span className="setup-page__card-status">Talos suggests</span>
                <span className={`talos-journal__verdict verdict--${v}`}>{v}</span>
            </div>
            <div className="setup-page__card-row">{manageProposalLine(v, pending.proposal)}</div>
            {pending.read && <div className="setup-page__card-note">{pending.read}</div>}
            <div className="setup-page__card-actions">
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
        <div className="setup-page__card setup-page__card--redraw">
            <div className="setup-page__card-head">
                <span className="setup-page__card-status">Talos says this needs re-drawing</span>
            </div>
            {why && <div className="setup-page__card-note">{why}</div>}
            <div className="setup-page__card-actions">
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

/**
 * The folded journal's line: when the next call is, and how many reads there have been. The count
 * is what is LOADED — one page — so it says "50+" until the hook has reached the end.
 */
function journalTail(setup, rows, done) {
    const n = Array.isArray(rows) ? rows.length : 0
    const count = !n ? 'no reads yet' : `${n}${done ? '' : '+'} read${n === 1 && done ? '' : 's'}`
    return [nextCallLine(setup), count].filter(Boolean).join(' · ')
}

export function SetupPage() {
    // Polled because Talos writes to monitor_state (memo, guards, the last read) while the window
    // is open. The journal rides on `check_count`, which every wake bumps.
    const { id, entity: setup, error, refresh } = useEntityPopup(
        'setup', mentorService.getSetup, { pollMs: 20_000, notFound: 'Setup not found' },
    )
    const journal = useJournal(id, setup?.monitor_state?.check_count ?? 0)
    const { positions, refresh: refreshPositions, closePosition } = usePositions()
    const [busy, setBusy] = useState(false)

    // What the chart draws: every price the plan names (live scenarios pre-arm, the armed one after,
    // the position once in it, Talos's guards) and the indicators its conditions reference — so the
    // user sees the same EMA / VWAP / RSI the plan talks about, at the levels it talks about. Same
    // derive as the confirm dialog — PriceChart keys on content, so the 20s poll doesn't rebuild.
    const { levels, indicators } = useMemo(() => deriveSetupOverlay(setup), [setup])

    if (error || !setup) return <EntityPopupShell error={error} loading={!setup} />

    async function handleDelete() {
        try { await mentorService.deleteSetup(id); window.close() }
        catch (e) { console.error('[setup-page] delete failed', e) }   // e.g. in_position (409)
    }
    // THREE acts on one button, because the rung decides what "stop" means:
    //   waiting → arm it (a status patch; the server re-runs the readiness gate)
    //   looking → stop watching (a status patch; nothing exists at the broker)
    //   hit + limit → CANCEL THE RESTING ORDER, then reset (its own route: a status patch would
    //     leave a working order live with nothing tracking it, to fill later against no entity)
    async function toggleArm() {
        const next = restingEntry ? mentorService.disarmRestingEntry
            : isSetupArmed(setup.status) ? mentorService.disarmSetup
            : mentorService.armSetup
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

    // A LIMIT entry resting at the broker. The backend has taken this since §3 (POST /:id/disarm
    // cancels the order, then resets) and nothing called it, because `isSetupArmed` is 'looking'-only
    // — so on the one rung where a real order is exposed, the page offered no way to pull it, and the
    // user's only exits were expiry and a validity breach.
    const restingEntry = setup.status === 'hit' && setup.entry_mode === 'limit'
    const canToggle    = canArmSetup(setup.status) || isSetupArmed(setup.status) || restingEntry

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
                    {/* The wording has to say which of the three acts this is. "Stop watching" over a
                        resting limit order would understate it: there is a real order at the broker
                        and this cancels it. */}
                    {restingEntry ? 'Cancel the order'
                        : isSetupArmed(setup.status) ? 'Stop watching'
                        : 'Arm it'}
                </button>
            )}
        >
            <div className="idea-dialog__main">
                <div className="idea-dialog__chart">
                    {/* The rung TALOS is on, not just the one the setup was drawn on. A read that
                        climbed to the 4hr for structure would otherwise leave the user staring at an
                        hourly chart while the journal below talks about a four-hour close. */}
                    <PriceChart symbol={setup.asset || 'SPY'} interval={watchTimeframe(setup)} levels={levels} indicators={indicators} />
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

                    {/* ── 1. Thesis — folded: its first sentence is the line, the rest is a click ── */}
                    <FoldSection title="Thesis" tail={firstSentence(setup.thesis) ?? 'no thesis'} tailTitle={setup.thesis}>
                        {setup.thesis && <p className="setup-page__thesis">{setup.thesis}</p>}
                        <div className="setup-page__metrics">
                            <ConvictionChip conviction={setup.conviction} />
                            {setup.mode && <span className="setup-page__mode">{setup.mode}</span>}
                            {setup.brokerSymbol && <span className="setup-page__broker">trades as {setup.brokerSymbol}</span>}
                        </div>
                    </FoldSection>

                    {/* ── 2. Scenarios — every way in with its exits; the live numbers once in position ── */}
                    <FoldSection title="Scenarios" tail={planTail(setup)} open>
                        <SetupScenarios setup={setup} />
                    </FoldSection>

                    {/* ── 3. Talos journal — the next call, then every read, newest first ── */}
                    <FoldSection title="Talos journal" tail={journalTail(setup, journal.rows, journal.done)} open>
                        <TalosJournal setup={setup} rows={journal.rows} done={journal.done} loading={journal.loading} onOlder={journal.loadOlder} />
                    </FoldSection>
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
