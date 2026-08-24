import { httpService } from './http.service'

/**
 * Stopping an agent turn — and why it needs saying at all.
 *
 * Aborting the fetch closes the SSE connection, and the server used to read that as "stop". So it could
 * not tell STOP from WALKING AWAY, and leaving a desk mid-answer killed the turn along with the work the
 * user had already paid for.
 *
 * Now the client mints an id per turn and sends it with the request. Closing the connection means only
 * "nobody is watching" — the turn finishes and saves itself. Stopping means calling this.
 */

export const newTurnId = () => `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

/**
 * Ask the server to abort a turn. Best-effort by design: the local abort has already stopped the UI, so
 * a failure here means the turn finishes and is saved — a wasted call, never a broken interface.
 */
export async function stopTurn(turnId) {
    if (!turnId) return false
    try {
        const res = await httpService.post(`api/turns/${encodeURIComponent(turnId)}/stop`, {})
        return res?.stopped === true
    } catch { return false }
}
