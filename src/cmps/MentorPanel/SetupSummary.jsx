import PropTypes from 'prop-types'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip'
import { ZoneEditor } from './ZoneEditor'
import './SetupSummary.scss'

// The live worksheet — the setup as built so far, filling in turn by turn.
//
// Mentor re-emits the COMPLETE setup every turn, so this is a pure render of the current draft;
// there is no separate state to reconcile. The panel owns the draft and hands it down.
//
// Two things here earn their space because nothing else in the app shows them:
//   • the WATCH LIST, which is what Talos will actually check. The user should be able to see the
//     monitoring cost of their own setup — an undeclared dimension is never fetched, and a declared
//     one is paid for on every wake.
//
// It does NOT own Generate or readiness. Those live at the BOTTOM of the chat pane with the other
// agent actions (where Kairos puts its Generate too): the preview is a reference you glance up at,
// while the thing you press belongs where your attention already is — under the conversation.

const KIND_LABEL = {
    price_action: 'Price action',
    structure:    'Structure (SMC)',
    correlation:  'Correlation',
    market:       'Broad market',
    news:         'News',
    positioning:  'Positioning',
    fundamental:  'Fundamentals',
}

const fmtDate = (iso) => {
    if (!iso) return null
    try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
}

export function SetupSummary({ setup, onChange, readOnly = false }) {
    if (!setup?.asset) {
        return <div className="setup-summary setup-summary--empty">Your setup will build here as you talk it through.</div>
    }

    const dir = setup.direction ? setup.direction.toUpperCase() : null

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

            <ZoneEditor setup={setup} onChange={onChange} readOnly={readOnly} />

            <div className="setup-summary__metrics">
                {setup.rr != null && (
                    <span className="setup-summary__metric" title="Reward-to-risk, measured from the WORST edge of the entry band — never the midpoint.">
                        <span className="setup-summary__metric-k">R:R</span>
                        <span className={`setup-summary__metric-v${setup.rr < 1.5 ? ' is-thin' : ''}`}>{setup.rr}</span>
                    </span>
                )}
                {setup.quantity != null && (
                    <span className="setup-summary__metric">
                        <span className="setup-summary__metric-k">Size</span>
                        <span className="setup-summary__metric-v">{setup.quantity}</span>
                    </span>
                )}
                <ConvictionChip conviction={setup.conviction} />
            </div>

            {setup.watch?.length > 0 && (
                <section className="setup-summary__watch">
                    <h4 className="setup-summary__sub" title="What Talos will check when price reaches a zone. Only these are fetched — anything undeclared is never looked at.">
                        Talos watches
                    </h4>
                    {setup.watch.map((w, i) => (
                        <div className={`setup-summary__factor setup-summary__factor--${w.weight}`} key={`${w.kind}-${i}`}>
                            <span className="setup-summary__factor-kind">
                                {KIND_LABEL[w.kind] ?? w.kind}
                                {w.timeframe && <em> {w.timeframe}</em>}
                                {w.symbols?.length > 0 && <em> {w.symbols.join(', ')}</em>}
                            </span>
                            <span className="setup-summary__factor-look">{w.look_for}</span>
                        </div>
                    ))}
                </section>
            )}

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
