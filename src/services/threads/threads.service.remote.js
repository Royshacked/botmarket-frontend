import { httpService } from '../http.service'

// Client for the generic thread API (see api/threads on the backend). Agents whose
// server never holds the full conversation (idea, scanner) drive their own draft
// persistence through here; the backend enforces the substantive floor + TTL/LRU.

const BASE = 'api/threads'

// Client-minted thread id — subject-independent, exists before the artifact does.
export const newThreadId = () => `thr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export const threadsService = { saveDraft, linkThread, listThreads, listUnfinished, getThread, discardThread, discardPipelineDrafts, pinThread }

/**
 * CLEAR a construction thread: throw away whatever was saved for it, and mint a fresh id to build on.
 *
 * WALKING AWAY and CLEARING are different acts, and only one of them leaves work behind. Every panel
 * treated them the same — a new id, and the old draft left to TTL-expire — so a conversation the user
 * had explicitly thrown away vanished from the panel but lived on the server for another fourteen
 * days: the hub went on marking that desk as unfinished, and went on holding its agent's other doors
 * closed, over a chat that no longer existed anywhere the user could see.
 *
 * Four panels need this same mechanism, so it lives here once rather than four times (the shared
 * mechanism rule). Fire-and-forget, and safe on a thread that was never persisted — a conversation
 * below the substantive floor was never written, and the delete simply matches nothing.
 *
 * The new id is written to the ref AND returned, so a caller can use whichever reads better.
 */
export function clearThread(threadIdRef) {
    const spent = threadIdRef?.current
    if (spent) threadsService.discardThread(spent)
    const next = newThreadId()
    if (threadIdRef) threadIdRef.current = next
    return next
}

/**
 * Unfinished work across every desk — what the route badges read. Drafts only, each saying whether it
 * is waiting on the user (`yourTurn`).
 *
 * A conversation the user walked away from was ALWAYS saved and resumable; nothing outside the desk
 * ever said so, which is how a half-finished portfolio quietly became invisible. [] on failure, so a
 * badge that cannot load is absent rather than wrong.
 */
async function listUnfinished() {
    try {
        const res = await httpService.get(`${BASE}/unfinished`)
        return Array.isArray(res.threads) ? res.threads : []
    } catch { return [] }
}

async function saveDraft({ threadId, agent, messages, phase = null, subjectType = null, state = null, mandate = null, pipeline = null }) {
    try {
        // `pipeline` is the DESK this conversation belongs to. An agent is shared between desks, so
        // without it an unfinished build cannot be told from a standalone chat at the same agent.
        return await httpService.post(`${BASE}/draft`, { threadId, agent, messages, phase, subjectType, state, mandate, pipeline })
    } catch (err) {
        console.error('[threads] saveDraft failed', err)
        return null
    }
}

async function linkThread(threadId, { subjectType = null, subjectId, artifactName = null }) {
    try {
        return await httpService.post(`${BASE}/${encodeURIComponent(threadId)}/link`, { subjectType, subjectId, artifactName })
    } catch (err) {
        console.error('[threads] linkThread failed', err)
        return null
    }
}

async function listThreads(agent = null) {
    try {
        const data = await httpService.get(`${BASE}${agent ? `?agent=${encodeURIComponent(agent)}` : ''}`)
        return Array.isArray(data.threads) ? data.threads : []
    } catch { return [] }
}

async function getThread(threadId) {
    try {
        const data = await httpService.get(`${BASE}/${encodeURIComponent(threadId)}`)
        return data.thread ?? null
    } catch { return null }
}

async function discardThread(threadId) {
    try { return await httpService.delete(`${BASE}/${encodeURIComponent(threadId)}`) }
    catch { return null }
}

/**
 * A desk RUN finished — drop the drafts that fed it. Drafts only: the conversation that authored the
 * artifact was linked to it and is reached by editing that artifact, not by resuming the desk.
 */
async function discardPipelineDrafts(pipeline) {
    try { return await httpService.delete(`${BASE}/pipeline/${encodeURIComponent(pipeline)}`) }
    catch { return null }
}

async function pinThread(threadId) {
    try { return await httpService.post(`${BASE}/${encodeURIComponent(threadId)}/pin`, {}) }
    catch { return null }
}
