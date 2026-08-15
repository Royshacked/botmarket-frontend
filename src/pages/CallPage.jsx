import { useState, useMemo } from 'react'
import PropTypes from 'prop-types'
import { deriveCallOverlay } from '../cmps/TradeIdeas/chartOverlay.js'
import { deriveCallChartInterval, positionsForEntity } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { CallDraft } from '../cmps/KairosPanel/KairosPanel.jsx'
import { HermesBadge } from '../cmps/AxlHub/AgentBadges.jsx'
import { EntityPopupShell } from '../cmps/EntityCard/EntityPopupShell.jsx'
import { useEntityPopup } from '../customHooks/useEntityPopup.js'
import { isAwaitingConfirm, isLivePosition, isTerminal, isInvalidated } from '../services/entityStatus.js'
import { PopoutFooter } from '../cmps/TradeIdeas/PopoutFooter.jsx'
import { MonitorJournal } from '../cmps/TradeIdeas/MonitorJournal.jsx'
// Shared with the setup pop-out — `position_state` is one shape whatever desk wrote it.
import { PositionPanel } from '../cmps/TradeIdeas/PositionPanel.jsx'
import { PriceChart } from '../cmps/PriceChart/PriceChart.jsx'
import { usePositions } from '../customHooks/usePositions.js'
import { kairosService } from '../services/kairos/kairos.service.remote.js'
import '../cmps/KairosPanel/KairosPanel.scss'   // CallDraft chips/cards
import './IdeaPage.scss'                          // REUSE the idea pop-out shell (header + chart 70 / column 30)
import './CallPage.scss'                          // call-only bits (delete, action row)

// The shared ladder — the StatusIcon set covers every rung, so there is no remap table.
const STATUS_LABEL = {
    waiting: 'not watched', looking: 'watching for the zone', hit: 'ready to enter — confirm',
    long: 'in position', short: 'in position', closed: 'closed',
}
// The wake kinds only Hermes produces — the in-position era. Merged over the journal's shared
// labels (see MonitorJournal); the readiness ones are common to every monitor.
const REASON_LABEL = { entry: 'entered', in_position: 'managing', close: 'closed' }
// In-position management verdict → button label + human proposal line.
const MANAGE_LABEL = { move_stop: 'Move stop', take_partial: 'Take partial', exit_now: 'Exit now', let_run: 'Let it run' }
function proposalLine(verdict, p) {
    if (!p) return null
    if (verdict === 'move_stop')    return `New stop ${p.new_stop}${p.ref ? ` (${p.ref})` : ''}`
    if (verdict === 'take_partial') return `Close ${p.size_pct}% here`
    if (verdict === 'let_run')      return p.cancel_tp ? 'Cancel the take-profit' : `Raise the take-profit to ${p.new_tp}`
    if (verdict === 'exit_now')     return p.reason || 'Flatten the position now'
    return null
}
// The pending management proposal Hermes wants the user to accept (Phase 5, propose-everything).
function ManagementCard({ pending, busy, onAccept, onDismiss }) {
    const v = pending?.verdict
    if (!v) return null
    return (
        <div className={`kairos-panel__card kairos-panel__card--manage verdict--${v}`}>
            <div className="kairos-panel__card-head">
                <span className="kairos-panel__card-status">Kairos suggests</span>
                {/* The journal's verdict pill, borrowed: the same word means the same thing here. */}
                <span className={`monitor-journal__verdict verdict--${v}`}>{v}</span>
            </div>
            <div className="kairos-panel__card-row">{proposalLine(v, pending.proposal)}</div>
            {pending.proposal?.reason && v !== 'exit_now' && <div className="kairos-panel__card-note">{pending.proposal.reason}</div>}
            <div className="call-page__actions">
                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" disabled={busy} onClick={() => onAccept(v)}>{MANAGE_LABEL[v] ?? 'Accept'}</button>
                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" disabled={busy} onClick={onDismiss}>Dismiss</button>
            </div>
        </div>
    )
}
ManagementCard.propTypes = { pending: PropTypes.object, busy: PropTypes.bool, onAccept: PropTypes.func.isRequired, onDismiss: PropTypes.func.isRequired }

// Pop-out detail window for a Kairos call. Reuses the idea pop-out shell (IdeaPage.scss) — same
// chart-left / column-right layout — with the call form (CallDraft) in the right column instead of
// idea conditions. Data is injected by the opener (window.__callData / localStorage), API fallback.
export function CallPage() {
    // Hand-off, hydration and the API fallback live in the shared hook. The poll is the live
    // monitor journal: getCall carries monitor_state.timeline, so new Hermes wakes drop in while
    // the pop-out is open.
    const { id, entity: call, error: err, refresh } = useEntityPopup(
        'call', kairosService.getCall, { pollMs: 20_000, notFound: 'Call not found' },
    )
    const [busy, setBusy] = useState(false)
    const { positions, refresh: refreshPositions, closePosition } = usePositions()

    // Levels + indicators to draw on this call's chart (before the early returns — rules of hooks;
    // deriveCallOverlay tolerates a null call). Stable identity so the chart doesn't thrash.
    const callOverlay = useMemo(() => deriveCallOverlay(call), [call])

    async function act(action) {
        setBusy(true)
        try { await kairosService.actOnCall(id, action); await refresh() }
        catch (e) { console.error('[call-page] act', e) }
        finally { setBusy(false) }
    }
    async function del() {
        setBusy(true)
        try { await kairosService.deleteCall(id); window.close() }
        catch (e) { console.error('[call-page] delete', e); setBusy(false) }
    }

    if (err || !call) return <EntityPopupShell error={err} loading={!call} />

    const a          = call.monitor_state?.last_assessment
    const p          = a?.proposal
    const isReady    = isAwaitingConfirm(call.status)
    const expiring   = isInvalidated(call.invalidation_status)
    const ps         = call.position_state
    const inPosition = isLivePosition(call.status)
    const closed     = isTerminal(call.status)
    const pending    = ps?.pending_action
    // A live position's icon follows the DIRECTION, which position_state knows more reliably
    // than the status does on a call that was filled short.
    const iconStatus = (inPosition && ps?.entry?.direction === 'short') ? 'short' : call.status

    // Positions belonging to THIS call — matched by broker linkage, not by symbol. A confirmed
    // call carries its own brokerOrders (P3b self-shadow), so another entity holding the same
    // ticker is not this call's position and must not appear here.
    const callPositions = positionsForEntity(call, positions)

    // Chart timeframe = the rung Hermes actually assessed on, so the pop-out chart matches what
    // the monitor is reading (falls back to a horizon default until the first assessment runs).
    const chartTf = deriveCallChartInterval(call)

    return (
        <EntityPopupShell
            badge={<HermesBadge size={22} />}
            asset={call.asset}
            direction={call.bias}
            status={call.status}
            iconStatus={iconStatus}
            statusLabel={STATUS_LABEL[call.status] ?? call.status}
            meta={[
                call.trade_type ?? null,
                call.sizing?.max_size != null ? `max ${call.sizing.max_size}` : null,
                call.active_from ? `from ${new Date(call.active_from).toLocaleString()}` : null,
                call.valid_until ? `valid until ${new Date(call.valid_until).toLocaleString()}` : null,
            ]}
        >
            <div className="idea-dialog__main">
                <div className="idea-dialog__chart">
                    <PriceChart symbol={call.asset || 'SPY'} interval={chartTf} levels={callOverlay.levels} indicators={callOverlay.indicators} />
                </div>

                <div className="idea-dialog__conditions">
                    {(isReady || expiring) && (
                        <div className="call-page__actions">
                            {isReady && <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" disabled={busy} onClick={() => act('confirm')}>Confirm entry</button>}
                            {expiring && <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" disabled={busy} onClick={() => act('edit')}>Accept edit</button>}
                            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" disabled={busy} onClick={() => act('dismiss')}>Dismiss</button>
                        </div>
                    )}

                    {closed && ps?.reentry?.offered && (
                        <div className="kairos-panel__card kairos-panel__card--reentry">
                            <div className="kairos-panel__card-head"><span className="kairos-panel__card-status">stopped out — re-enter?</span></div>
                            {ps.reentry.why && <div className="kairos-panel__card-note">{ps.reentry.why}</div>}
                            <div className="call-page__actions">
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" disabled={busy} onClick={() => act('reentry')}>Re-enter</button>
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" disabled={busy} onClick={() => act('decline_reentry')}>Close</button>
                            </div>
                        </div>
                    )}

                    {inPosition && pending && (
                        <ManagementCard pending={pending} busy={busy} onAccept={v => act(v)} onDismiss={() => act('dismiss')} />
                    )}

                    {/* Closed only: the outcome summary. While in-position the live position + its Close
                        live in the PopoutFooter below (and management proposals in the ManagementCard),
                        so no duplicate position box / Exit button up here. */}
                    {ps && closed && <PositionPanel ps={ps} status={call.status} />}

                    {call.thesis && (
                        <div className="idea-dialog__field"><span>Thesis</span><p className="idea-dialog__notes">{call.thesis}</p></div>
                    )}

                    <CallDraft call={call} showHead={false} />

                    {isReady && p && (
                        <div className="kairos-panel__card kairos-panel__card--ready">
                            <div className="kairos-panel__card-head"><span className="kairos-panel__card-status">proposed entry</span></div>
                            <div className="kairos-panel__card-row">
                                Entry <b>{p.entry}</b> · Stop <b>{p.stop}</b> · TP <b>{p.take_profit?.[0]?.price ?? '—'}</b> · {p.size} · R:R {p.rr ?? '—'}
                            </div>
                            {p.rationale && <div className="kairos-panel__card-note">{p.rationale}</div>}
                        </div>
                    )}
                    {expiring && a?.edit_proposal?.why && (
                        <div className="kairos-panel__card kairos-panel__card--expiring"><div className="kairos-panel__card-note">{a.edit_proposal.why}</div></div>
                    )}

                    {call.monitor_state?.memo && (
                        <div className="idea-dialog__field"><span>Monitor note</span><p className="idea-dialog__notes">{call.monitor_state.memo}</p></div>
                    )}

                    <div className="idea-dialog__field">
                        <span>Monitor journal <em>(live)</em></span>
                        <MonitorJournal
                            timeline={call.monitor_state?.timeline}
                            empty="No monitor activity yet — the journal fills in as Kairos wakes to check this call."
                            reasonLabels={REASON_LABEL}
                        />
                    </div>
                </div>
            </div>

            <PopoutFooter
                positions={callPositions}
                closePosition={closePosition}
                onPositionsChanged={refreshPositions}
                onDelete={del}
                deleteTitle="Delete call"
            />
        </EntityPopupShell>
    )
}
