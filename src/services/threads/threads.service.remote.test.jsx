import { describe, it, expect, vi, beforeEach } from 'vitest'

// .jsx despite holding no JSX: vitest is scoped to that extension (see vite.config), and this needs
// module mocking to keep the HTTP layer out — which the plain node runner cannot do.
//
// CLEARING is not WALKING AWAY. Every panel treated them alike — mint a new id, leave the old draft
// to TTL-expire — so a conversation the user threw away stayed on the server for another fourteen
// days, marking its desk as unfinished and holding that agent's other doors shut over a chat that
// existed nowhere the user could see.

const post = vi.fn().mockResolvedValue({ ok: true })
const del  = vi.fn().mockResolvedValue({ ok: true })
vi.mock('../http.service', () => ({
    httpService: { post: (...a) => post(...a), delete: (...a) => del(...a), get: vi.fn() },
}))

const { clearThread, newThreadId, threadsService } = await import('./threads.service.remote.js')

beforeEach(() => { post.mockClear(); del.mockClear() })

describe('clearThread', () => {
    it('discards what was saved and hands back a fresh thread to build on', () => {
        const ref = { current: 'thr_old' }

        const next = clearThread(ref)

        expect(del).toHaveBeenCalledWith('api/threads/thr_old')
        expect(next).not.toBe('thr_old')
        expect(ref.current).toBe(next)   // written to the ref AND returned — either reads fine
    })

    it('a conversation that was never persisted clears without asking the server to delete nothing', () => {
        // Below the substantive floor there IS no thread; the id was minted and never used.
        const ref = { current: null }

        const next = clearThread(ref)

        expect(del).not.toHaveBeenCalled()
        expect(next).toMatch(/^thr_/)
        expect(ref.current).toBe(next)
    })

    it('survives being handed nothing at all', () => {
        expect(clearThread(undefined)).toMatch(/^thr_/)
        expect(clearThread(null)).toMatch(/^thr_/)
        expect(del).not.toHaveBeenCalled()
    })

    it('the fresh id is a real new thread, not the one just discarded', () => {
        const ref = { current: newThreadId() }
        const spent = ref.current

        clearThread(ref)

        expect(ref.current).not.toBe(spent)
        expect(del).toHaveBeenCalledWith(`api/threads/${spent}`)
    })
})

// A desk RUN ending is not the same act as clearing one chat: the artifact exists, and every
// conversation that fed it is spent. The thread that AUTHORED it is not a draft any more — it was
// linked to the artifact — so this cannot reach it.
describe('discardPipelineDrafts', () => {
    it('asks for one desk by key', async () => {
        await threadsService.discardPipelineDrafts('trade')
        expect(del).toHaveBeenCalledWith('api/threads/pipeline/trade')
    })

    it('encodes the key, so a desk name can never walk up the path', async () => {
        await threadsService.discardPipelineDrafts('../threads')
        expect(del).toHaveBeenCalledWith('api/threads/pipeline/..%2Fthreads')
    })

    it('a failing request answers null instead of throwing into the walk home', async () => {
        // It is fired as the user leaves for the hub; a rejection there would surface as an unhandled
        // rejection over a desk they have already finished with.
        del.mockRejectedValueOnce(new Error('offline'))
        expect(await threadsService.discardPipelineDrafts('trade')).toBe(null)
    })
})
