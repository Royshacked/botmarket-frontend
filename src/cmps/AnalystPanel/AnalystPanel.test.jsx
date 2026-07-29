import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

const sendStream = vi.fn().mockResolvedValue(undefined)
vi.mock('../../services/analyst/analyst.service.remote.js', () => ({
    analystService: {
        sendStream:       (...a) => sendStream(...a),
        initiateCoverage: vi.fn(),
        updateCoverage:   vi.fn(),
    },
}))
vi.mock('../../customHooks/useMicInput.js', () => ({
    useMicInput: () => ({ isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }),
}))

const { AnalystPanel } = await import('./AnalystPanel.jsx')

const lastCall = () => sendStream.mock.calls.at(-1)

beforeEach(() => { sendStream.mockClear() })
afterEach(cleanup)

// Axl routes "let's research NVDA" here with the ticker already resolved. Prometheus must OPEN on
// that name — the whole point of the hand-off is that the user doesn't say NVDA twice.
describe('AnalystPanel — Axl hand-off seed', () => {
    it('a seeded ticker starts the research turn on its own', async () => {
        render(<AnalystPanel seed={{ key: 1, message: 'Research NVDA for coverage.' }} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history, opts] = lastCall()
        expect(history.at(-1)).toEqual({ role: 'user', content: 'Research NVDA for coverage.' })
        // A bare ticker carries no Argus candidate — that seed belongs to the scan hand-off.
        expect(opts.seed).toBe(null)
    })

    it('no seed → the desk waits for the user (the intro, not a turn)', async () => {
        render(<AnalystPanel />)

        expect(sendStream).not.toHaveBeenCalled()
        expect(screen.getByText('Prometheus')).toBeTruthy()
    })

    it('an Argus candidate still hands over its structured seed, not just the words', async () => {
        render(<AnalystPanel scanResult={{ key: 'k1', ticker: 'AMD', sector: 'Semis', thesis: 'AI cycle' }} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history, opts] = lastCall()
        expect(history.at(-1)).toEqual({ role: 'user', content: 'Research AMD for coverage.' })
        expect(opts.seed).toMatchObject({ ticker: 'AMD', sector: 'Semis', thesis: 'AI cycle' })
        expect(opts.chatState.active_symbol).toBe('AMD')
    })
})
