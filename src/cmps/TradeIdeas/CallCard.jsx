import PropTypes from 'prop-types'
import { HermesBadge } from '../AxlHub/AgentBadges.jsx'
import { EntityCard, SymbolCell, Pill, StatusBadge, DeleteButton } from '../EntityCard/EntityCard.jsx'
import { formatCreatedAt, openCallPopup } from './tradeIdea.utils.js'
import { isAwaitingConfirm, isLivePosition, isTerminal } from '../../services/entityStatus.js'

// A Kairos "call" in the Lists surface. Renders into the shared EntityCard; what stays here is the
// call's own judgment — its status vocabulary and what the summary reads like at each phase.

// A call speaks the ONE shared ladder, so the StatusIcon set already covers every rung — the
// per-kind remap table this used to carry is gone along with the synonyms that needed it.
const STATUS_LABEL = {
    waiting: 'not watched', looking: 'watching', hit: 'ready — confirm',
    long: 'in position', short: 'in position', closed: 'closed',
}

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
    // An archived Kairos call still carries BANDS — `entry_zones`, `{lower, upper}`. The setup kind
    // moved off that shape on 2026-09-24; a frozen document did not, and rewriting the read here
    // would blank the level on every call the user still has.
    const z = call.entry_zones?.[0]
    if (!z) return '—'
    const more = call.entry_zones.length > 1 ? ` +${call.entry_zones.length - 1} more` : ''
    return `${z.side ?? call.bias ?? ''} ${z.lower}–${z.upper}${z.kind ? ` · ${z.kind}` : ''}${more}`.trim()
}

export function CallCard({ call, busy = false, onAct, onDelete, onSymbolClick }) {
    const isReady    = isAwaitingConfirm(call.status)
    const hasPending = isLivePosition(call.status) && !!call.position_state?.pending_action

    const title = (
        <>
            <SymbolCell symbol={call.asset} onSymbolClick={onSymbolClick} owned />
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

    const controls = (
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
            {/* A live position is delete-locked server-side (409 reason:'in_position') — the call is
                what Hermes manages the position THROUGH, so deleting it leaves an open position
                with nothing running its stop. Same rule as a setup and a holding. */}
            {onDelete && (
                <DeleteButton
                    onClick={() => onDelete(call.id)}
                    title="Delete call"
                    lockedReason={isLivePosition(call.status) ? 'In a live position — close it at the broker first' : null}
                    disabled={busy}
                />
            )}
        </>
    )

    return (
        <EntityCard
            status={call.status}
            badge={<HermesBadge size={34} />}
            title={title}
            summary={cardSummary}
            controls={controls}
            onOpen={() => openCallPopup(call)}
            cardTitle="Open call"
        />
    )
}

CallCard.propTypes = {
    call:          PropTypes.object.isRequired,
    busy:          PropTypes.bool,
    onAct:         PropTypes.func.isRequired,
    onDelete:      PropTypes.func,
    onSymbolClick: PropTypes.func,
}
