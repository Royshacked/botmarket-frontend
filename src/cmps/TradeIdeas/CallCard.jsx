import PropTypes from 'prop-types'
import { HermesBadge } from '../AxlHub/AgentBadges.jsx'
import { BinIcon, EditIcon } from './TradeIdeaCards.jsx'
import { StatusIcon } from '../StatusIcon.jsx'
import { formatCreatedAt, openCallPopup } from './tradeIdea.utils.js'

// A Kairos "call" row for the Axl Lists Calls tab — parity with IdeaCard: Hermes mark, a status
// badge, confirm (when ready), an edit/open pencil (pops out the detail window), and delete.
// Clicking the row opens the call pop-out — same as clicking an idea row.

const STATUS_LABEL = {
    waiting: 'watching', watching: 'near zone', ready: 'ready', expiring: 'expiring',
    confirmed: 'awaiting fill', in_position: 'in position', closed: 'closed',
    expired: 'expired', dismissed: 'dismissed',
}

// Reuse the idea StatusIcon set — map each call status to the closest idea icon.
// (waiting→hourglass, watching→radar, ready→bullseye, in_position→trend, closed→flag;
// 'expiring' has no icon and falls back to its text label.)
const CALL_STATUS_ICON = {
    waiting: 'waiting', watching: 'looking', ready: 'hit',
    confirmed: 'hit', in_position: 'long', closed: 'closed', expired: 'closed', dismissed: 'closed',
}

// Pre-entry calls — and expired ones — can be re-worked in the Kairos chat (the pencil = "Edit in
// chat", parity with ideas). Re-mapping an expired thesis re-arms the monitor (updateKairosCall
// resets it to 'waiting'), matching the social-chat expiry card's "Edit call". Once a position is
// live (confirmed/in_position) or the call is closed/dismissed, the pencil just opens the pop-out —
// editing the plan mid-position is handled via management cards, not the chat.
const CHAT_EDITABLE = new Set(['waiting', 'watching', 'ready', 'expiring', 'expired'])

const fmtR = r => (r == null ? '—' : `${r > 0 ? '+' : ''}${r}R`)

function summary(call) {
    const p  = call.monitor_state?.last_assessment?.proposal
    const ps = call.position_state
    if (call.status === 'ready' && p) {
        return `Enter ${p.entry} · stop ${p.stop} · tp ${p.take_profit?.[0]?.price ?? '—'}${p.rr ? ` · R:R ${p.rr}` : ''}`
    }
    if (call.status === 'in_position' && ps) {
        return `in @${ps.entry?.fill_price ?? ps.entry?.intended ?? '—'} · stop ${ps.stop?.current ?? '—'} · ${fmtR(ps.metrics?.r_multiple_now)}`
    }
    if (call.status === 'closed' && ps?.outcome) {
        const o = ps.outcome
        return `${o.reason ?? 'closed'} · ${fmtR(o.r_multiple)}${o.pnl != null ? ` · P&L ${o.pnl}` : ''}`
    }
    const z = call.entry_zones?.[0]
    if (!z) return '—'
    const more = call.entry_zones.length > 1 ? ` +${call.entry_zones.length - 1} more` : ''
    return `${z.side ?? call.bias ?? ''} ${z.lower}–${z.upper}${z.kind ? ` · ${z.kind}` : ''}${more}`.trim()
}

export function CallCard({ call, busy = false, onAct, onDelete, onEdit, onSymbolClick }) {
    const isReady = call.status === 'ready'
    const isBuilding = call.status === 'building'   // live draft (not yet saved) — hammer row
    const canChatEdit = !!onEdit && CHAT_EDITABLE.has(call.status)
    const hasPending = call.status === 'in_position' && !!call.position_state?.pending_action

    function handleCardClick(ev) {
        if (isBuilding) return                                  // building row is not clickable
        if (ev.target.closest('.idea-card__controls')) return   // buttons handle themselves
        if (ev.target.closest('.idea-card__sym')) return        // ticker → chart
        openCallPopup(call)
    }

    return (
        <article className={`idea-card idea-card--${call.status}`} onClick={handleCardClick} title={isBuilding ? 'Building…' : 'Open call'}>
            <div className="idea-card__icon" aria-hidden="true"><HermesBadge size={34} /></div>

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
                {isBuilding ? (
                    // Live draft in chat — hammer, no actions (Generate lives in the Kairos panel).
                    <svg className="idea-row__building-bot" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" title="Building…" aria-hidden="true">
                        {/* hammer — building in progress */}
                        <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/>
                        <path d="m18 15 4-4"/>
                        <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586z"/>
                    </svg>
                ) : (
                    <>
                        {hasPending && <span className="idea-card__manage-dot" title={`Kairos suggests: ${call.position_state.pending_action.verdict}`}>⚑</span>}
                        <span className={`idea-card__status-badge status--${CALL_STATUS_ICON[call.status] ?? call.status}`} title={STATUS_LABEL[call.status] ?? call.status}>
                            <StatusIcon status={CALL_STATUS_ICON[call.status] ?? call.status} />
                        </span>
                        {isReady && (
                            <button className="idea-card__status-toggle status--waiting" disabled={busy} title="Confirm entry"
                                onClick={() => onAct(call.id, 'confirm')}>✓</button>
                        )}
                        <button
                            className={`idea-card__edit-btn${canChatEdit ? '' : ' idea-card__edit-btn--locked'}`}
                            title={canChatEdit ? 'Edit in chat' : 'Open call (editing off in position)'}
                            onClick={e => { e.stopPropagation(); canChatEdit ? onEdit(call) : openCallPopup(call) }}
                        ><EditIcon /></button>
                        {onDelete && (
                            <button className="idea-card__delete" disabled={busy} title="Delete call" onClick={() => onDelete(call.id)}><BinIcon /></button>
                        )}
                    </>
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
    onEdit:        PropTypes.func,
    onSymbolClick: PropTypes.func,
}
