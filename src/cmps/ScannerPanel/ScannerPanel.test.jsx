import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

const sendStream = vi.fn().mockResolvedValue(undefined)
vi.mock('../../services/scanner/scanner.service.remote.js', () => ({
    scannerService: { sendStream: (...a) => sendStream(...a) },
}))
vi.mock('../../services/threads/threads.service.remote.js', () => ({
    threadsService: { saveDraft: vi.fn(), getThread: vi.fn().mockResolvedValue(null) },
    newThreadId:    () => 'thr_test',
}))
vi.mock('../../customHooks/useMicInput.js', () => ({
    useMicInput: () => ({ isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }),
}))

const { ScannerPanel } = await import('./ScannerPanel.jsx')

const lastCall = () => sendStream.mock.calls.at(-1)

beforeEach(() => { sendStream.mockClear() })
afterEach(cleanup)

// The setup chips (Momentum, Breakouts, Squeeze plays…) are TRADING angles. A portfolio scan asks a
// different question — a sector mandate or a horizon, usually already supplied by Atlas — so putting
// them under an investing thesis offers the wrong shortcut on the one turn that has no use for it.
describe('ScannerPanel — the thesis-phase angle strip', () => {
    // Play a Phase-1 turn to completion: that is the state the strip is gated on. The reply has to
    // finish TYPING, not just arrive — the strip waits for a settled assistant turn, and the Stop
    // button vanishing is what says the drain is done (an absence assertion made mid-drain would
    // pass for the wrong reason).
    async function finishThesisTurn() {
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [, opts] = lastCall()
        await act(async () => {
            opts.onPhase(1)
            opts.onToken('Angle?')
            opts.onDone({ reply: 'Angle?' })
        })
        await waitFor(
            () => expect(screen.queryByRole('button', { name: 'Stop response' })).toBe(null),
            { timeout: 4000 },
        )
    }

    it('shows under a TRADING thesis — the angles are that lens', async () => {
        render(<ScannerPanel scanSeed={{ key: 1, message: 'Find me something to trade.', profile: 'trading' }} />)
        await finishThesisTurn()
        expect(await screen.findByRole('button', { name: 'Momentum' })).toBeTruthy()
    })

    it('stays away from a PORTFOLIO scan, seeded by Atlas as investing', async () => {
        render(<ScannerPanel scanSeed={{ key: 2, message: 'Screen the Technology sleeve.', profile: 'investing' }} />)
        await finishThesisTurn()
        expect(screen.queryByRole('button', { name: 'Momentum' })).toBe(null)
    })

    it('stays away when the panel itself is the portfolio pipeline', async () => {
        render(<ScannerPanel pipeline="portfolio" scanSeed={{ key: 3, message: 'Long-term quality names.' }} />)
        await finishThesisTurn()
        expect(screen.queryByRole('button', { name: 'Momentum' })).toBe(null)
    })
})

// Updating an investing list leaves the edit session OPEN (the list stays pending so it can be
// refined again) while also raising the research hand-off. Both footers rendered at once: four
// buttons asking two different questions, and two of them navigated away — one of those out of an
// edit the user had not finished.
describe('ScannerPanel — the research offer does not stack on the edit bar', () => {
    const savedList = {
        thesis:     'Quality compounders',
        candidates: [
            { ticker: 'MSFT', direction: 'long' },
            { ticker: 'ASML', direction: 'long' },
        ],
    }

    // Reopen a saved investing list, refine it (a turn is what makes the edit dirty, which is what
    // puts "Update list" on screen), then press Update.
    async function reopenAndUpdate(handlers = {}) {
        render(
            <ScannerPanel
                pipeline="portfolio"
                chatRestore={{ key: 1, scanId: 'scn_1', scan: savedList, messages: [] }}
                scanSeed={{ key: 1, message: 'Drop the richest name.', profile: 'investing' }}
                {...handlers}
            />,
        )
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [, opts] = lastCall()
        await act(async () => {
            opts.onToken('Done.')
            opts.onDone({ reply: 'Done.' })
        })
        const update = await screen.findByRole('button', { name: 'Update list' }, { timeout: 4000 })
        await act(async () => { fireEvent.click(update) })
    }

    it('the offer owns the footer — the edit bar stands down while it is up', async () => {
        await reopenAndUpdate({ onUpdateList: vi.fn() })

        expect(await screen.findByRole('button', { name: /Send top 2 to research/ })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Update list' })).toBe(null)
        expect(screen.queryByRole('button', { name: "I'll do it later" })).toBe(null)
    })

    it('declining mid-edit puts the edit bar back instead of walking out of the edit', async () => {
        const onResearchLater = vi.fn()
        await reopenAndUpdate({ onUpdateList: vi.fn(), onResearchLater })

        const notNow = await screen.findByRole('button', { name: 'Not now' })
        await act(async () => { fireEvent.click(notNow) })

        // The session is still open and still refinable — and nobody was navigated anywhere.
        expect(await screen.findByRole('button', { name: 'Update list' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Send top 2 to research/ })).toBe(null)
        expect(onResearchLater).not.toHaveBeenCalled()
    })

    it('accepting hands over the list that was just saved', async () => {
        const onResearchList = vi.fn()
        await reopenAndUpdate({ onUpdateList: vi.fn(), onResearchList })

        const send = await screen.findByRole('button', { name: /Send top 2 to research/ })
        await act(async () => { fireEvent.click(send) })

        expect(onResearchList).toHaveBeenCalledTimes(1)
        expect(onResearchList.mock.calls[0][0].candidates.map(c => c.ticker)).toEqual(['MSFT', 'ASML'])
    })
})
