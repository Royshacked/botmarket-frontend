import PropTypes from 'prop-types'
import { HermesBadge } from '../AxlHub/AgentBadges.jsx'
import { BinIcon, EditIcon } from './TradeIdeaCards.jsx'
import { StatusIcon } from '../StatusIcon.jsx'
import { formatCreatedAt } from './tradeIdea.utils.js'

// A Kairos "call" row for the Axl Lists Calls tab — parity with IdeaCard: Hermes mark, a status
// badge, confirm (when ready), an edit/open pencil (pops out the detail window), and delete.
// Clicking the row opens the call pop-out — same as clicking an idea row.

const STATUS_LABEL = {
    waiting: 'watching', watching: 'near zone', ready: 'ready', expiring: 'expiring',
    confirmed: 'entered', expired: 'expired', dismissed: 'dismissed',
}

// Reuse the idea StatusIcon set — map each call status to the closest idea icon.
// (waiting→hourglass, watching→radar, ready→bullseye, confirmed→trend, expired/dismissed→flag;
// 'expiring' has no icon and falls back to its text label.)
const CALL_STATUS_ICON = {
    waiting: 'waiting', watching: 'looking', ready: 'hit',
    confirmed: 'long', expired: 'closed', dismissed: 'closed',
}

// Pop-out detail window for a call (mirrors openIdeaPopup): stash the data, open /call/:id.
function openCallPopup(call) {
    localStorage.setItem(`popup-call-${call.id}`, JSON.stringify(call))
    const popup = window.open(`/call/${call.id}`, `call-${call.id}`, 'width=1180,height=760')
    if (popup) popup.__callData = call
    return popup
}

function summary(call) {
    const p = call.monitor_state?.last_assessment?.proposal
    if (call.status === 'ready' && p) {
        return `Enter ${p.entry} · stop ${p.stop} · tp ${p.take_profit?.[0]?.price ?? '—'}${p.rr ? ` · R:R ${p.rr}` : ''}`
    }
    const z = call.entry_zones?.[0]
    if (!z) return '—'
    const more = call.entry_zones.length > 1 ? ` +${call.entry_zones.length - 1} more` : ''
    return `${z.side ?? call.bias ?? ''} ${z.lower}–${z.upper}${z.kind ? ` · ${z.kind}` : ''}${more}`.trim()
}

export function CallCard({ call, busy = false, onAct, onDelete, onSymbolClick }) {
    const isReady = call.status === 'ready'

    function handleCardClick(ev) {
        if (ev.target.closest('.idea-card__controls')) return   // buttons handle themselves
        if (ev.target.closest('.idea-card__sym')) return        // ticker → chart
        openCallPopup(call)
    }

    return (
        <article className={`idea-card idea-card--${call.status}`} onClick={handleCardClick} title="Open call">
            <div className="idea-card__icon" aria-hidden="true"><HermesBadge size={42} /></div>

            <div className="idea-card__body">
                <div className="idea-card__titleline">
                    <span
                        className="idea-card__sym"
                        onClick={e => { e.stopPropagation(); if (call.asset && onSymbolClick) onSymbolClick(call.asset) }}
                        style={{ cursor: call.asset ? 'pointer' : 'default' }}
                        title={call.asset ? `View ${call.asset} chart` : undefined}
                    >{call.asset || '—'}</span>
                    {call.bias && <span className={`idea-card__pill idea-card__pill--dir direction--${call.bias}`}>{call.bias}</span>}
                    {call.trade_type && <span className="idea-card__pill idea-card__pill--type">{call.trade_type}</span>}
                </div>
                <div className="idea-card__summary">
                    <span className="idea-card__summary-text">{summary(call)}</span>
                    <span className="idea-card__date"> · {formatCreatedAt(call.savedAt) || '—'}</span>
                </div>
            </div>

            <div className="idea-card__controls">
                <span className={`idea-card__status-badge status--${call.status}`} title={STATUS_LABEL[call.status] ?? call.status}>
                    <StatusIcon status={CALL_STATUS_ICON[call.status] ?? call.status} />
                </span>
                {isReady && (
                    <button className="idea-card__status-toggle status--waiting" disabled={busy} title="Confirm entry"
                        onClick={() => onAct(call.id, 'confirm')}>✓</button>
                )}
                <button className="idea-card__edit-btn" title="Open call" onClick={() => openCallPopup(call)}><EditIcon /></button>
                {onDelete && (
                    <button className="idea-card__delete" disabled={busy} title="Delete call" onClick={() => onDelete(call.id)}><BinIcon /></button>
                )}
            </div>
        </article>
    )
}

CallCard.propTypes = {
    call:          PropTypes.object.isRequired,
    busy:          PropTypes.bool,
    onAct:         PropTypes.func.isRequired,
    onDelete:      PropTypes.func,
    onSymbolClick: PropTypes.func,
}
