import PropTypes from 'prop-types'
import { TalosBadge } from '../cmps/AxlHub/AgentBadges.jsx'
import { EntityPopupShell } from '../cmps/EntityCard/EntityPopupShell.jsx'
import { PopoutFooter } from '../cmps/TradeIdeas/PopoutFooter.jsx'
import { MonitorJournal } from '../cmps/TradeIdeas/MonitorJournal.jsx'
import { positionsForEntity } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { PriceChart } from '../cmps/PriceChart/PriceChart.jsx'
import { ConvictionChip } from '../cmps/ConvictionChip/ConvictionChip'
import { setupIcon, isSetupArmed, canArmSetup } from '../cmps/TradeIdeas/setupStatus.js'
import { useEntityPopup } from '../customHooks/useEntityPopup.js'
import { usePositions } from '../customHooks/usePositions.js'
import { mentorService } from '../services/mentor/mentor.service.remote'
import './IdeaPage.scss'      // the shared pop-out shell (header + chart 70 / column 30)
import './SetupPage.scss'     // setup-only bits (zones, watch list, timeline)

// The `setup` pop-out. Setups previously had NO window — clicking one switched the chat tab —
// because giving them one meant hand-writing a fourth copy of the hand-off, the hydration ladder
// and the popup chrome. With those shared, the page is just this kind's content.
//
// What a setup is FOR is different from an idea or a call: it has no condition tree, only ZONES,
// and `watch[]` is what Talos picked its tools from. Both are shown verbatim rather than
// summarised — the zones are the entity, and the watch list is why the monitor looks where it does.

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

export function SetupPage() {
    // Polled because Talos writes to monitor_state (memo + timeline) while the window is open.
    const { id, entity: setup, error, refresh } = useEntityPopup(
        'setup', mentorService.getSetup, { pollMs: 20_000, notFound: 'Setup not found' },
    )
    const { positions, refresh: refreshPositions, closePosition } = usePositions()

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

    // Positions belonging to THIS setup — matched by broker linkage, not by symbol. Talos stamps
    // brokerOrders onto the setup when it fires, so a portfolio holding on the same ticker is a
    // different entity and must not show up here (it also made PopoutFooter delete-lock a setup
    // that owned no position at all).
    const setupPositions = positionsForEntity(setup, positions)

    const canToggle = canArmSetup(setup.status) || isSetupArmed(setup.status)

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
                    <PriceChart symbol={setup.asset || 'SPY'} interval={setup.timeframe || 'day'} />
                </div>

                <div className="idea-dialog__conditions setup-page__panel">
                    {setup.thesis && <p className="setup-page__thesis">{setup.thesis}</p>}

                    <ZoneRow label="Entry"  zones={setup.entry_zones} tone="entry" />
                    <ZoneRow label="Stop"   zones={setup.stop_zones}  tone="stop" />
                    <ZoneRow label="Target" zones={setup.tp_zones}    tone="tp" />

                    <div className="setup-page__metrics">
                        <ConvictionChip conviction={setup.conviction} />
                        {setup.mode && <span className="setup-page__mode">{setup.mode}</span>}
                        {setup.brokerSymbol && <span className="setup-page__broker">trades as {setup.brokerSymbol}</span>}
                    </div>

                    {/* watch[] is the setup's defining field: it is what Talos picks its tools from. */}
                    {Array.isArray(setup.watch) && setup.watch.length > 0 && (
                        <div className="setup-page__watch">
                            <span className="setup-page__section-label">Watching</span>
                            <ul>{setup.watch.map((w, i) => <li key={i}>{typeof w === 'string' ? w : (w.what ?? JSON.stringify(w))}</li>)}</ul>
                        </div>
                    )}

                    {setup.monitor_state?.memo && (
                        <p className="setup-page__memo">{setup.monitor_state.memo}</p>
                    )}

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
