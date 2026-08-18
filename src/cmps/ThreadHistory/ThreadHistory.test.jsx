import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const listThreads = vi.fn()
vi.mock('../../services/threads/threads.service.remote', () => ({
    threadsService: { listThreads: (...a) => listThreads(...a) },
}))

const { ThreadHistory } = await import('./ThreadHistory.jsx')

// THE BUG THIS FILE EXISTS FOR (found by hand, 2026-08-18 — no automated test could see it).
//
// Resuming a thread while its desk was mid-turn LOOKED like it worked and did not. The panel set
// the loaded history, and the stream still writing overwrote it on the very next token; the user
// saw an empty desk, and the thread appeared seconds later when the turn's typewriter drain finally
// stopped. It read as "resume is broken".
//
// The root cause was upstream of this component: MainPage declared its per-desk loading state as
// `const [, setScannerLoading]` — the VALUE discarded — and never wired the other three desks at
// all, so nothing on the page knew a desk was busy. This is the half that makes the answer visible.

const draft = (over = {}) => ({ threadId: 't1', tier: 'draft', title: 'NVDA breakout', updatedAt: 1, ...over })

const open = async (props = {}) => {
    render(<ThreadHistory agent="scanner" {...props} />)
    await act(async () => {})                       // the badge load
    await act(async () => { fireEvent.click(screen.getByLabelText('Chats')) })
}

beforeEach(() => { listThreads.mockResolvedValue([draft()]) })
afterEach(cleanup)

describe('ThreadHistory', () => {
    it('resumes a draft when the desk is idle', async () => {
        const onResume = vi.fn()
        await open({ onResume })
        await act(async () => { fireEvent.click(screen.getByText('NVDA breakout')) })
        expect(onResume).toHaveBeenCalledWith('t1')
    })

    it('does NOT resume while the desk is mid-turn — the stream would overwrite it', async () => {
        const onResume = vi.fn()
        await open({ onResume, busy: true })
        await act(async () => { fireEvent.click(screen.getByText('NVDA breakout')) })
        expect(onResume).not.toHaveBeenCalled()
    })

    it('says WHY, rather than looking broken', async () => {
        // A row that silently does nothing is the failure being fixed. The drawer names the desk and
        // the condition, so the user knows to wait rather than to click again.
        await open({ busy: true })
        expect(screen.getByText(/still answering/i)).toBeTruthy()
    })

    it('marks the row disabled for assistive tech, not just visually', async () => {
        await open({ busy: true })
        expect(screen.getByText('NVDA breakout').closest('[role="button"]').getAttribute('aria-disabled')).toBe('true')
    })

    it('defaults to NOT busy, so a caller that never passes it is unaffected', async () => {
        // Four of the five desks were wired in the same commit as this prop; a sixth added later
        // must not be silently un-resumable because someone forgot to pass `busy`.
        const onResume = vi.fn()
        await open({ onResume })
        await act(async () => { fireEvent.click(screen.getByText('NVDA breakout')) })
        expect(onResume).toHaveBeenCalled()
    })
})
