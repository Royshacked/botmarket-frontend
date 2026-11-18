import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// useTradeIdeas: a server-side commit's announcement re-reads the list, and only the LATEST load writes it
// (CR 2026-11-18: a poll, a commit and a workspace switch can overlap; an older answer landing last put a stale list back).

const getIdeas = vi.fn()
vi.mock('../services/tradeIdeas/tradeIdeas.service.remote.js', () => ({
    IDEAS_CHANGED: 'tradeIdeas:changed',
    tradeIdeasService: { getIdeas: (...a) => getIdeas(...a), updateIdea: vi.fn() },
}))
vi.mock('./useAutoRefresh.js', () => ({ useAutoRefresh: () => {} }))   // no poll in the test

const { useTradeIdeas } = await import('./useTradeIdeas.js')

beforeEach(() => getIdeas.mockReset())

describe('useTradeIdeas', () => {
    it('IDEAS_CHANGED (a desk\'s commit on the server) re-reads the list at once', async () => {
        getIdeas.mockResolvedValue([{ id: 'book-leg' }])
        const { result } = renderHook(() => useTradeIdeas())
        act(() => { window.dispatchEvent(new Event('tradeIdeas:changed')) })
        await waitFor(() => expect(result.current.ideas).toEqual([{ id: 'book-leg' }]))
    })

    it('an older load that answers LAST does not overwrite the newer list', async () => {
        let answerOld
        getIdeas
            .mockImplementationOnce(() => new Promise(r => { answerOld = r }))   // the first load: slow
            .mockResolvedValueOnce([{ id: 'new' }])                                // the second: fast
        const { result } = renderHook(() => useTradeIdeas())
        let first
        await act(async () => { first = result.current.loadIdeas(); await result.current.loadIdeas() })
        expect(result.current.ideas).toEqual([{ id: 'new' }])
        await act(async () => { answerOld([{ id: 'old' }]); await first })
        expect(result.current.ideas).toEqual([{ id: 'new' }])
    })
})
