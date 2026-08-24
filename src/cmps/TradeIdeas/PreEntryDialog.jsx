import PropTypes from 'prop-types'
import { formatNum } from './tradeIdea.utils.js'
import { useMarketStatus } from '../../customHooks/useMarketStatus.js'
import { Modal } from '../Modal.jsx'
import './PreEntryDialog.scss'

/**
 * Arm-time pre-flight prompt.
 *
 * Shown when an idea is activated (status → 'looking') but its entry level is
 * ALREADY held on the last closed candle — so the monitor's rising-edge guard
 * will never fire (the breakout already happened). Rather than let the idea sit
 * silently forever, we surface the choice:
 *
 *   • Buy now — the level is met right now; enter at market (routes through the
 *     normal order-confirm flow, so accounts / market-hours / ownership all apply).
 *   • Edit    — the level was wrong; reopen the idea in chat to change it.
 *   • Reset   — keep watching, but re-arm from now so it fires on the *next*
 *     genuine cross (dip below → close back above).
 *
 * Closing (×) leaves the idea 'looking' unchanged.
 */
export function PreEntryDialog({ prompt, busy = false, onBuyNow, onEdit, onReset, onClose }) {
    const idea = prompt?.idea
    const { market, marketClosed } = useMarketStatus(idea?.asset, idea?.asset_class)

    if (!idea) return null

    const conditions = Array.isArray(idea.entry_conditions) ? idea.entry_conditions : []
    const logic      = (idea.entry_logic ?? 'AND').toUpperCase()

    return (
        <Modal
            ns="pre-entry"
            busy={busy}
            onClose={onClose}
            title="Already at your level"
            asset={idea.asset ?? '—'}
            direction={idea.direction}
            footer={<>
                <button
                    className="pre-entry__btn pre-entry__btn--reset"
                    onClick={() => onReset(idea)}
                    disabled={busy}
                    title="Keep watching — fire on the next genuine cross"
                >Reset</button>
                <button
                    className="pre-entry__btn pre-entry__btn--edit"
                    onClick={() => onEdit(idea)}
                    disabled={busy}
                    title="Reopen in chat to change the level"
                >Edit</button>
                <button
                    className="pre-entry__btn pre-entry__btn--buy"
                    onClick={() => onBuyNow(idea)}
                    disabled={busy}
                >{busy ? 'Working…' : 'Buy now'}</button>
            </>}
        >
                    <p className="pre-entry__lead">
                        Price is <strong>already</strong> on the trigger side of your entry
                        {prompt.close != null && <> (last close <strong>{formatNum(prompt.close)}</strong>)</>}.
                        The monitor waits for a <strong>fresh cross</strong>, so it won’t enter on its own.
                    </p>

                    {conditions.length > 0 && (
                        <div className="pre-entry__conditions">
                            <span className="pre-entry__conditions-label">Entry {conditions.length > 1 ? `(${logic})` : ''}</span>
                            <ul>
                                {conditions.map((c, i) => <li key={i}>{c.condition ?? String(c)}</li>)}
                            </ul>
                        </div>
                    )}

                    {marketClosed && (
                        <p className="pre-entry__market-closed">
                            🔒 Market is closed — “Buy now” will rest and fill when it opens
                            {market.nextOpenMs ? '.' : '.'}
                        </p>
                    )}
        </Modal>
    )
}

PreEntryDialog.propTypes = {
    prompt:   PropTypes.shape({ idea: PropTypes.object, close: PropTypes.number }),
    busy:     PropTypes.bool,
    onBuyNow: PropTypes.func.isRequired,
    onEdit:   PropTypes.func.isRequired,
    onReset:  PropTypes.func.isRequired,
    onClose:  PropTypes.func.isRequired,
}
