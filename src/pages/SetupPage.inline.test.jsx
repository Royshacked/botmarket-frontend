import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react'

// The setup pop-out, rendered IN the app (a phone) instead of in a window of its own. Three things
// on this page belong to a window and have to be answered differently in place — how it ends, how
// it reaches Mentor, and whether it shows a way out at all. Every one of them was silently broken
// on a phone before: a tab has no `window.opener`, so the re-draw button rendered as a memo, and
// `window.close()` after a delete is a no-op on a tab the script did not open.

const getSetup    = vi.fn()
const deleteSetup = vi.fn()
vi.mock('../services/mentor/mentor.service.remote', () => ({
    mentorService: {
        getSetup:            (...a) => getSetup(...a),
        deleteSetup:         (...a) => deleteSetup(...a),
        armSetup:            vi.fn().mockResolvedValue({}),
        disarmSetup:         vi.fn().mockResolvedValue({}),
        disarmRestingEntry:  vi.fn().mockResolvedValue({}),
        actOnSetup:          vi.fn().mockResolvedValue({}),
    },
}))
// klinecharts wants a canvas; jsdom has none, and the chart is not what this file is about.
vi.mock('../cmps/PriceChart/PriceChart.jsx', () => ({ PriceChart: () => <div data-testid="chart" /> }))
vi.mock('../customHooks/useJournal.js', () => ({
    useJournal: () => ({ rows: [], done: true, loading: false, loadOlder: vi.fn() }),
}))
vi.mock('../customHooks/usePositions.js', () => ({
    usePositions: () => ({ positions: [], refresh: vi.fn(), closePosition: vi.fn() }),
}))

const { SetupPage } = await import('./SetupPage.jsx')
const { eventBus, SETUP_INVALIDATION_EDIT } = await import('../services/event-bus.service')

// Armed, and its map has been invalidated — the state that offers "Re-draw it in Mentor".
const STALE = {
    id: 's1', asset: 'NVDA', direction: 'long', status: 'looking',
    invalidation_status: 'fired', invalidation_reason: 'broke the base',
    thesis: 'Basing under 250.',
}

beforeEach(() => {
    localStorage.clear()
    getSetup.mockReset().mockResolvedValue(STALE)
    deleteSetup.mockReset().mockResolvedValue({ ok: true })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

async function renderInline(onClose = vi.fn()) {
    render(<SetupPage entityId="s1" onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('NVDA')).toBeTruthy())
    return onClose
}

describe('SetupPage in the app', () => {
    it('loads the setup it was handed, not one read off the URL', async () => {
        await renderInline()
        expect(getSetup).toHaveBeenCalledWith('s1')
    })

    it('deleting leaves the page instead of calling window.close() on a tab that ignores it', async () => {
        const close = vi.spyOn(window, 'close').mockImplementation(() => {})
        const onClose = await renderInline()

        await act(async () => { fireEvent.click(screen.getByTitle('Delete setup')) })

        await waitFor(() => expect(deleteSetup).toHaveBeenCalledWith('s1'))
        await waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(close).not.toHaveBeenCalled()
    })

    // In place there is no bridge to cross: popupBridge exists to carry a pop-out's ask to the app
    // and re-emit it on this very bus. Here the page IS in the app, so it emits it directly and
    // MainPage's one handler takes it — the same handler a social-chat card lands on.
    it('the re-draw ask reaches Mentor on the app’s own event bus, and closes the page', async () => {
        const heard = vi.fn()
        const off = eventBus.on(SETUP_INVALIDATION_EDIT, heard)
        const onClose = await renderInline()

        await act(async () => { fireEvent.click(screen.getByText(/Re-draw it in Mentor/i)) })

        expect(heard).toHaveBeenCalledWith({ setupId: 's1' })
        expect(onClose).toHaveBeenCalled()
        off()
    })

    it('the re-draw button EXISTS here — on a phone `window.opener` is null and it used to be a memo', async () => {
        await renderInline()
        expect(screen.queryByText(/Open this setup from the app to re-draw it/i)).toBeNull()
    })

    it('a page that could not load still has a way back', async () => {
        getSetup.mockResolvedValue(null)
        const onClose = vi.fn()
        render(<SetupPage entityId="s1" onClose={onClose} />)

        await waitFor(() => expect(screen.getByText('Setup not found')).toBeTruthy())
        fireEvent.click(screen.getByLabelText('Back'))
        expect(onClose).toHaveBeenCalled()
    })
})
