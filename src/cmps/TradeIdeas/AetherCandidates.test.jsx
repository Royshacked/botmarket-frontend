import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AetherCandidates } from './AetherCandidates.jsx'
import { ADMIN, MEMBER, authModule } from '../../testUtils/authStub.js'

// Discovery is the one leg of the engine that spends per press — an Opus call with web
// search for each event it selects, plus several hundred SEC requests — so it is off the
// schedule and behind requireAdmin. The button is the courtesy; the server is the guard.
// What is asserted here is that the courtesy holds and that a refusal reads correctly.

let AUTH = ADMIN
vi.mock('../../context/AuthContext.jsx', async (orig) => {
    const actual = await orig()
    return { ...actual, useAuth: () => AUTH }
})

const startDiscovery = vi.fn()
vi.mock('../../services/aether/aether.service.remote.js', () => ({
    aetherService: { startDiscovery: (...a) => startDiscovery(...a) },
}))

afterEach(() => { cleanup(); startDiscovery.mockReset(); AUTH = ADMIN })

const RUN = {
    run_id: 'Canada:2026-09-08',
    subject: 'Canada',
    event: 'Canada imposes retaliatory tariffs',
    event_category: 'trade',
    answer_shape: 'sized',
    event_date: '2026-09-08',
    candidates: [{ ticker: 'NUE', side: 'hurt', tier: 2, verdict: 'quantified', status: 'fresh' }],
}

const btn = () => screen.queryByRole('button', { name: /run discovery|already running|running —|starting|could not start/i })

describe('AetherCandidates run button', () => {

    it('is not offered to a signed-in member', () => {
        AUTH = MEMBER
        render(<AetherCandidates runs={[RUN]} />)
        expect(btn()).toBeNull()
    })

    it('survives a null auth context rather than taking the list down with it', () => {
        // The list itself is readable by every authenticated user, so a missing provider
        // must cost the button and nothing else.
        AUTH = null
        expect(() => render(<AetherCandidates runs={[RUN]} />)).not.toThrow()
        expect(screen.getByText('NUE')).toBeTruthy()
        expect(btn()).toBeNull()
    })

    it('is offered to an admin', () => {
        render(<AetherCandidates runs={[RUN]} />)
        expect(btn()).toBeTruthy()
    })

    it('is offered on the empty state too — that is when it matters most', () => {
        // Nothing has run, and an admin is the only one who can change that.
        render(<AetherCandidates runs={[]} />)
        expect(screen.getByText(/No events in the window/)).toBeTruthy()
        expect(btn()).toBeTruthy()
    })

    it('reports STARTED, not finished, and stops taking presses', async () => {
        // A run is minutes of model calls and EDGAR requests; it writes to Mongo when it
        // lands and the list polls it up on its own.
        startDiscovery.mockResolvedValue({ started: true, pid: 1 })
        render(<AetherCandidates runs={[RUN]} />)
        fireEvent.click(btn())

        await waitFor(() => expect(btn().textContent).toMatch(/names land in a few minutes/i))
        expect(btn().disabled).toBe(true)
        expect(startDiscovery).toHaveBeenCalledTimes(1)
    })

    it('a 409 reads as “already running”, never as a failure', async () => {
        // The server refuses a concurrent run because the selector reads recently-run
        // subjects at start-up: a second run would re-pick — and re-pay for — the first's
        // events. Calling that an error would invite exactly the retry it just refused.
        startDiscovery.mockRejectedValue({ response: { status: 409 } })
        render(<AetherCandidates runs={[RUN]} />)
        fireEvent.click(btn())

        await waitFor(() => expect(btn().textContent).toMatch(/already running/i))
        expect(btn().textContent).not.toMatch(/could not/i)
        expect(btn().disabled).toBe(true)
    })

    it('a real failure says so, keeps the server’s reason, and stays pressable', async () => {
        // 503 is "no engine on this host" — worth reading, and worth retrying after fixing.
        startDiscovery.mockRejectedValue({
            response: { status: 503, data: { error: 'AETHER_ENGINE_PATH not set' } },
        })
        render(<AetherCandidates runs={[RUN]} />)
        fireEvent.click(btn())

        await waitFor(() => expect(btn().textContent).toMatch(/could not start/i))
        expect(btn().getAttribute('title')).toBe('AETHER_ENGINE_PATH not set')
        expect(btn().disabled).toBe(false)
    })
})

describe('AetherCandidates list', () => {

    it('shows the event category as a chip', () => {
        render(<AetherCandidates runs={[RUN]} />)
        expect(screen.getByText('trade')).toBeTruthy()
    })

    it('shows no chip for a run stored before the label existed', () => {
        render(<AetherCandidates runs={[{ ...RUN, event_category: '' }]} />)
        expect(screen.queryByText('trade')).toBeNull()
        expect(screen.getByText('NUE')).toBeTruthy()
    })

    it('an unmeasured magnitude reads as absent, never as small', () => {
        // The whole reason the shock feed was retired: it showed "large"/"medium" on 170
        // cards and never "small", off a channel state three months stale.
        render(<AetherCandidates runs={[RUN]} />)
        expect(screen.getByTitle(/no figure stated in the filing/)).toBeTruthy()
    })
})
