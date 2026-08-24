// How a queued row READS and what Execute does with it — the per-type judgment, in one place.
//
// The list itself is deliberately blind: it renders rows and offers two buttons. Everything that
// differs between "enter NVDA" and "trim 30% of MU" lives here, because those two are not variants
// of one sentence — they are different asks with different destinations. Shared shell, per-type
// judgment; the same split the notification cards use.
//
// TWO DESTINATIONS, and the difference is real:
//
//   • an ENTRY (source 'entity') already has a confirm surface — the OrderConfirmDialog, with the
//     plan, the levels, the risk and the per-account sizing. Execute routes there and that dialog
//     places the order exactly as it always has. Adding a second way to place the same order is how
//     two paths drift apart.
//   • a QUEUED ACTION (source 'queue') has no such surface. It is a decision already taken —
//     "trim 30%" — with nothing left to fill in, so it gets a plain confirm and goes back through
//     the endpoint that replays it on the desk's own code.
//
// See docs/architecture/off-hours-queue.md.

import { ENTRY_CONFIRM_OPEN, SETUP_CONFIRM_OPEN, CALL_CONFIRM_OPEN } from '../../services/event-bus.service'

const pct = (f) => {
    const n = Number(f)
    if (!Number.isFinite(n) || n <= 0) return null
    // 0.3 → "30%". Trailing zeros dropped: "12.5%" survives, "30.0%" doesn't.
    return `${Number((n * 100).toFixed(1))}%`
}

/**
 * The one-line summary on the row. Says WHAT WILL HAPPEN, not what kind of record it is — the row
 * is a thing you are about to do, and "portfolio_item / add_to" is not a sentence anybody reads.
 */
export function actionLine(row) {
    const a     = row?.action ?? {}
    const asset = row?.asset ?? '—'
    switch (a.type) {
        case 'entry':  return `Enter ${asset}`
        // A monitor's exit can be a SLICE — a scaled target closes part of the position and leaves
        // the rest running. Saying "close all" over that is the difference between a row you can
        // trust and one you have to go and verify.
        case 'exit':   return Number(a.quantity) > 0
            ? `Close ${a.quantity} of ${asset}`
            : `Close all of ${asset}`
        case 'trim':   return pct(a.reduceFraction) ? `Trim ${pct(a.reduceFraction)} of ${asset}` : `Trim ${asset}`
        case 'add_to': return pct(a.addFraction)    ? `Add ${pct(a.addFraction)} to ${asset}`     : `Add to ${asset}`

        // A monitor's proposal the user accepted after the close. The LEVEL is the whole point of
        // the row: by the open the card that proposed it is gone, and "move the stop on NVDA" leaves
        // the user to guess where to — which is the one thing they already decided.
        case 'move_stop':    return Number.isFinite(a.proposal?.new_stop)
            ? `Move the ${asset} stop to ${a.proposal.new_stop}`
            : `Move the ${asset} stop`
        case 'take_partial': return Number.isFinite(a.proposal?.size_pct)
            ? `Bank ${Number(a.proposal.size_pct.toFixed(1))}% of ${asset}`
            : `Bank part of ${asset}`
        case 'exit_now':     return `Get flat on ${asset}`
        case 'let_run':      return a.proposal?.cancel_tp
            ? `Cancel the ${asset} target`
            : Number.isFinite(a.proposal?.new_tp)
                ? `Move the ${asset} target to ${a.proposal.new_tp}`
                : `Let ${asset} run`

        default:       return `${a.type ?? 'Action'} · ${asset}`
    }
}

/** Where it came from, for the row's second line. Empty rather than "unknown" when unstamped. */
export function originLine(row) {
    return row?.origin?.label ?? ''
}

/** Short verb for the Execute button, so the button says what it does. */
export function actionVerb(row) {
    return {
        entry: 'Enter', exit: 'Close', trim: 'Trim', add_to: 'Add',
        move_stop: 'Move stop', take_partial: 'Bank', exit_now: 'Get flat', let_run: 'Move target',
    }[row?.action?.type] ?? 'Execute'
}

/**
 * What Execute should do.
 *   { kind: 'event', event, payload } — hand off to the surface that already owns this
 *   { kind: 'confirm' }               — the queue's own confirm, then POST execute
 *   { kind: 'none', reason }          — nothing sensible to do (an origin the client can't route)
 */
export function executeRoute(row) {
    if (row?.source === 'queue') return { kind: 'confirm' }

    // An entity awaiting confirmation: route by the KIND that authored it, because each kind's
    // confirm lives in its own surface (the call pop-out, the setup dialog, the order dialog).
    const id = row?.origin?.entityId ?? row?.id
    switch (row?.origin?.kind) {
        case 'call':  return { kind: 'event', event: CALL_CONFIRM_OPEN,  payload: { callId: id } }
        case 'setup': return { kind: 'event', event: SETUP_CONFIRM_OPEN, payload: { setupId: id } }
        case 'idea':
        case 'portfolio_item':
            return { kind: 'event', event: ENTRY_CONFIRM_OPEN, payload: { ideaId: id } }
        default:
            return { kind: 'none', reason: 'unknown_origin' }
    }
}

/** The confirm dialog's copy for a queued action. One sentence, no hedging — it was decided already. */
export function confirmCopy(row) {
    const a     = row?.action ?? {}
    const asset = row?.asset ?? 'this position'
    switch (a.type) {
        case 'exit': {
            const slice = Number(a.quantity) > 0
            return {
                title: slice ? 'Close part of the position' : 'Close position',
                body:  `${slice ? `Close ${a.quantity} of your ${asset} position` : `Close your whole ${asset} position`} at market. `
                     + `Decided while the market was shut${originLine(row) ? ` — ${originLine(row)}` : ''}.`,
                cta:   'Close now',
            }
        }
        case 'trim':
            return {
                title: 'Trim position',
                body:  `Reduce your ${asset} position by ${pct(a.reduceFraction) ?? 'the agreed share'} at market. Decided while the market was shut${originLine(row) ? ` — ${originLine(row)}` : ''}.`,
                cta:   'Trim now',
            }
        case 'add_to':
            return {
                title: 'Add to position',
                body:  `Increase your ${asset} position by ${pct(a.addFraction) ?? 'the agreed share'} at market. Decided while the market was shut${originLine(row) ? ` — ${originLine(row)}` : ''}.`,
                cta:   'Add now',
            }
        // The management verbs. Each says the LEVEL back, because the proposal was accepted hours ago
        // against a chart the user is no longer looking at — confirming "move the stop" without the
        // number is asking them to trust their memory of it.
        case 'move_stop':
            return {
                title: 'Move the stop',
                body:  `Move your ${asset} stop to ${a.proposal?.new_stop ?? 'the level you accepted'}`
                     + `${a.proposal?.ref ? ` (${a.proposal.ref})` : ''}. Accepted while the market was shut.`,
                cta:   'Move it now',
            }
        case 'take_partial':
            return {
                title: 'Bank a partial',
                body:  `Close ${a.proposal?.size_pct != null ? `${Number(a.proposal.size_pct.toFixed(1))}%` : 'the agreed share'} of your ${asset} position at market. Accepted while the market was shut.`,
                cta:   'Bank it now',
            }
        case 'exit_now':
            return {
                title: 'Get flat',
                body:  `Close your whole ${asset} position at market. Accepted while the market was shut${originLine(row) ? ` — ${originLine(row)}` : ''}.`,
                cta:   'Get flat now',
            }
        case 'let_run':
            return {
                title: a.proposal?.cancel_tp ? 'Cancel the target' : 'Move the target',
                body:  a.proposal?.cancel_tp
                    ? `Cancel the resting take-profit on ${asset} and let it run. Accepted while the market was shut.`
                    : `Move your ${asset} target out to ${a.proposal?.new_tp ?? 'the level you accepted'}. Accepted while the market was shut.`,
                cta:   a.proposal?.cancel_tp ? 'Cancel it now' : 'Move it now',
            }
        default:
            return { title: 'Execute', body: `Run this ${asset} action at market.`, cta: 'Execute' }
    }
}

/** Server refusals, in words. Anything unmapped falls through as itself rather than "failed". */
export const EXECUTE_ERRORS = {
    market_closed:  'The market closed again — it stays queued for the next open.',
    not_ready:      'Its market has not opened yet.',
    already_running: 'Already running — give it a moment.',
    add_too_small:  'Too small to place: it rounds down to zero shares.',
    trim_too_small: 'Too small to place: it rounds down to zero shares.',
    no_position:    'That position is no longer open.',
    not_live:       'That holding is not in a position.',
    no_origin_handler: 'This item came from a desk that can no longer run it.',
    // A management action replayed at the open. Hours passed, so the position it was accepted
    // against may simply not be there any more — which is an outcome, not a fault.
    not_found:        'That position is gone — nothing left to change.',
    no_position_link: 'No open position at the broker to change.',
    execution_failed: 'The broker refused it. Nothing was changed.',
    broker_unreachable: 'Could not reach the broker. It stays queued.',
}
