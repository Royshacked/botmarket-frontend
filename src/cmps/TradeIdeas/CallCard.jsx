import PropTypes from 'prop-types'
import { HermesBadge } from '../AxlHub/AgentBadges.jsx'
import { EntityCard, SymbolCell, Pill, StatusBadge, EditButton, DeleteButton, BuildingIcon } from '../EntityCard/EntityCard.jsx'
import { formatCreatedAt, openCallPopup } from './tradeIdea.utils.js'
import { isAwaitingConfirm, isLivePosition, isTerminal, isPreEntry } from '../../services/entityStatus.js'

// A Kairos "call" in the Lists surface. Renders into the shared EntityCard; what stays here is the
// call's own judgment — its status vocabulary, what the summary reads like at each phase, and when
// the pencil edits vs merely opens.

// A call speaks the ONE shared ladder, so the StatusIcon set already covers every rung — the
// per-kind remap table this used to carry is gone along with the synonyms that needed it.
const STATUS_LABEL = {
    waiting: 'not watched', looking: 'watching', hit: 'ready — confirm',
    long: 'in position', short: 'in position', closed: 'closed',
}

// Pre-entry, the call can be re-worked in the Kairos chat — including when its thesis has gone
// stale, since invalidation only ever latches PRE-ENTRY, so an invalidated call is pre-entry by
// definition. Testing the latch as well would be worse than redundant: a closed call that still
// carries a stale latch would read as editable.
//
// Once a position is live or the call is closed the pencil just opens the pop-out — mid-position
// edits go via management cards, not the chat.
const isChatEditable = (call) => isPreEntry(call.status)

const fmtR = r => (r == null ? '—' : `${r > 0 ? '+' : ''}${r}R`)

function summary(call) {
    const p  = call.monitor_state?.last_assessment?.proposal
    const ps = call.position_state
    if (isAwaitingConfirm(call.status) && p) {
        return `Enter ${p.entry} · stop ${p.stop} · tp ${p.take_profit?.[0]?.price ?? '—'}${p.rr ? ` · R:R ${p.rr}` : ''}`
    }
    if (isLivePosition(call.status) && ps) {
        return `in @${ps.entry?.fill_price ?? ps.entry?.intended ?? '—'} · stop ${ps.stop?.current ?? '—'} · ${fmtR(ps.metrics?.r_multiple_now)}`
    }
    if (isTerminal(call.status) && ps?.outcome) {
        const o = ps.outcome
        return `${o.reason ?? 'closed'} · ${fmtR(o.r_multiple)}${o.pnl != null ? ` · P&L ${o.pnl}` : ''}`
    }
    const z = call.entry_zones?.[0]
    if (!z) return '—'
    const more = call.entry_zones.length > 1 ? ` +${call.entry_zones.length - 1} more` : ''
    return `${z.side ?? call.bias ?? ''} ${z.lower}–${z.upper}${z.kind ? ` · ${z.kind}` : ''}${more}`.trim()
}

export function CallCard({ call, busy = false, onAct, onDelete, onEdit, onSymbolClick }) {
    const isReady     = isAwaitingConfirm(call.status)
    const isBuilding  = call.status === 'building'   // live draft (not yet saved) — hammer row
    const canChatEdit = !!onEdit && isChatEditable(call)
    const hasPending  = isLivePosition(call.status) && !!call.position_state?.pending_action

    const title = (
        <>
            <SymbolCell symbol={call.asset} onSymbolClick={onSymbolClick} />
            {call.bias && <Pill variant="dir" className={`direction--${call.bias}`}>{call.bias}</Pill>}
            {call.trade_type && <Pill variant="type">{call.trade_type}</Pill>}
        </>
    )

    const cardSummary = (
        <>
            <span className="idea-card__summary-text">{summary(call)}</span>
            <span className="idea-card__date"> · {formatCreatedAt(call.savedAt) || '—'}</span>
        </>
    )

    // Generate lives in the Kairos panel, so a draft offers no actions — just the hammer.
    const controls = isBuilding ? <BuildingIcon className="idea-row__building-bot" /> : (
        <>
            {hasPending && (
                <span className="idea-card__manage-dot" title={`Kairos suggests: ${call.position_state.pending_action.verdict}`}>⚑</span>
            )}
            <StatusBadge status={call.status} label={STATUS_LABEL[call.status] ?? call.status} />
            {isReady && (
                <button
                    className="idea-card__status-toggle status--waiting"
                    disabled={busy}
                    title="Confirm entry"
                    onClick={e => { e.stopPropagation(); onAct(call.id, 'confirm') }}
                >✓</button>
            )}
            <EditButton
                onClick={() => (canChatEdit ? onEdit(call) : openCallPopup(call))}
                title={canChatEdit ? 'Edit in chat' : 'Open call (editing off in position)'}
                locked={!canChatEdit}
            />
            {onDelete && <DeleteButton onClick={() => onDelete(call.id)} title="Delete call" disabled={busy} />}
        </>
    )

    return (
        <EntityCard
            status={call.status}
            badge={<HermesBadge size={34} />}
            title={title}
            summary={cardSummary}
            controls={controls}
            onOpen={isBuilding ? undefined : () => openCallPopup(call)}
            cardTitle={isBuilding ? 'Building…' : 'Open call'}
        />
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
