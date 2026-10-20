import { httpService } from '../http.service'

// Client for the thread API (see api/threads on the backend). Since the unified chat (phase 9, 2026-10-20) only
// Pythia's and Aether's panels keep their own chats here — save a draft, link it to what it produced, discard it.
// Every other desk talks in the session; the desks' list / get / pin / badge reads went with their panels.

const BASE = 'api/threads'

// Client-minted thread id — subject-independent, exists before the artifact does.
export const newThreadId = () => `thr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export const threadsService = { saveDraft, linkThread, discardThread }

/**
 * CLEAR a construction thread: throw away whatever was saved for it, and mint a fresh id to build on.
 *
 * WALKING AWAY and CLEARING are different acts, and only one of them leaves work behind. Every panel
 * treated them the same — a new id, and the old draft left to TTL-expire — so a conversation the user
 * had explicitly thrown away vanished from the panel but lived on the server for another fourteen
 * days: the hub went on marking that desk as unfinished, and went on holding its agent's other doors
 * closed, over a chat that no longer existed anywhere the user could see.
 *
 * Both panels that keep their own chats need this same mechanism, so it lives here once (the shared
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

async function discardThread(threadId) {
    try { return await httpService.delete(`${BASE}/${encodeURIComponent(threadId)}`) }
    catch { return null }
}
