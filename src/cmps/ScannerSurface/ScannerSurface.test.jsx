import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// Argus's surface in the side pane (phase 8d). It draws ARGUS'S STATE ON THE SESSION; an angle is a turn, the lens is
// a hand edit, Generate / Update / Later are commits, and a radar cut's Prometheus read runs on its own route and is
// handed back as a hand edit. The session is a stub; the backend's suite covers what the server does with each.

const batchRead = vi.fn()
vi.mock('../../services/aether/aether.service.remote.js', () => ({ aetherService: { batchRead: (...a) => batchRead(...a) } }))

const { ScannerSurface } = await import('./ScannerSurface.jsx')

const LIST = { thesis: 'Semis on a pullback', period: { label: 'this week' }, candidates: [{ ticker: 'NVDA', direction: 'long' }, { ticker: 'MOS', direction: 'short' }] }

let session
let desk
const mount = (scanner, over = {}) => {
    session = {
        floor: 'scanner', live: null, agentState: { scanner }, agentRev: { scanner: 2 },
        send:   vi.fn(async () => true),
        commit: vi.fn(async () => ({ ok: true, result: { scan: { id: 's1' } } })),
        edit:   vi.fn(async () => ({ ok: true, result: {}, rev: 3 })),
        ...over,
    }
    desk = { availableAccounts: [], selectedAccounts: [], onSaved: vi.fn() }
    return render(<ScannerSurface session={session} deskProps={desk} />)
}

beforeEach(() => { batchRead.mockReset() })
afterEach(cleanup)

describe('ScannerSurface — before a list', () => {
    it('the angles compose ONE turn to Argus; the lens is a hand edit', async () => {
        mount({ profile: 'trading' })
        fireEvent.click(screen.getByText('Momentum'))
        fireEvent.click(screen.getByText('Breakouts'))
        fireEvent.click(screen.getByText('Scan these (2) →'))
        expect(session.send).toHaveBeenCalledWith('Scan for momentum setups + breakout setups — names that fit both angles', expect.objectContaining({ agent: 'scanner' }))
        fireEvent.click(screen.getByText('Investing'))
        expect(session.edit).toHaveBeenCalledWith('scanner', { profile: 'investing' })
    })

    it('no angles on the investing lens; no lens and no angles in a hand-off (one name, trading)', () => {
        mount({ profile: 'investing' })
        expect(screen.queryByText('Momentum')).toBeNull()
        expect(screen.getByText('Investing').className).toMatch(/is-active/)
        cleanup()
        mount({ handoff: true, handoffTo: 'mentor' })
        expect(screen.getByText(/finding one name to trade/)).toBeTruthy()
        expect(screen.queryByText('Investing')).toBeNull()
        expect(screen.queryByText('Momentum')).toBeNull()
    })
})

describe('ScannerSurface — a list', () => {
    it('shows the list and Generate is a COMMIT; the page re-reads the Scans tab after', async () => {
        mount({ pendingScan: LIST })
        expect(screen.getByText('Semis on a pullback')).toBeTruthy()
        expect(screen.getByText('this week')).toBeTruthy()
        fireEvent.click(screen.getByText('Generate list'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('scanner', 'generate', expect.any(Object)))
        await waitFor(() => expect(desk.onSaved).toHaveBeenCalledWith(expect.objectContaining({ agent: 'scanner', action: 'generate' })))
    })

    it('editing a saved list: Update and Later', async () => {
        mount({ pendingScan: LIST, editingScanId: 's1' })
        expect(screen.getByText('editing list —')).toBeTruthy()
        fireEvent.click(screen.getByText('Update list'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('scanner', 'update', expect.any(Object)))
        fireEvent.click(screen.getByText(/later/i))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('scanner', 'later', expect.any(Object)))
    })
})

describe('ScannerSurface — phase 8d CR', () => {
    it('a name on the list opens its chart; Later is not a save; a refused lens says so; angles reset once sent', async () => {
        const { rerender } = mount({ pendingScan: LIST, editingScanId: 's1' }, { edit: vi.fn(async () => ({ ok: false, reason: 'invalid_edit', message: 'That change is not valid' })) })
        desk = { ...desk, onTicker: vi.fn() }
        rerender(<ScannerSurface session={session} deskProps={desk} />)
        fireEvent.click(screen.getByText('NVDA'))
        expect(desk.onTicker).toHaveBeenCalledWith('NVDA')
        fireEvent.click(screen.getByText(/later/i))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('scanner', 'later', expect.any(Object)))
        expect(desk.onSaved).not.toHaveBeenCalled()
        fireEvent.click(screen.getByText('Investing'))
        expect((await screen.findByRole('alert')).textContent).toBe('That change is not valid')
        cleanup()
        mount({ profile: 'trading' })
        fireEvent.click(screen.getByText('Momentum'))
        fireEvent.click(screen.getByText('Scan this (1) →'))
        expect(screen.getByText('Momentum').getAttribute('aria-pressed')).toBe('false')
    })

    it('a stale hand-back is retried ON the revision the refusal named', async () => {
        batchRead.mockResolvedValue({ rows: [] })
        const edit = vi.fn()
            .mockResolvedValueOnce({ ok: false, reason: 'stale_state', message: 'x', extra: { rev: 7 } })
            .mockResolvedValueOnce({ ok: true, result: {}, rev: 8 })
        mount({ radar: true, pendingScan: LIST }, { edit })
        await waitFor(() => expect(edit).toHaveBeenCalledTimes(2))
        expect(edit.mock.calls[1][2]).toEqual({ rev: 7 })
    })

    it('a refused "Save without the read" does not strand the read: it lands and applies', async () => {
        let answer
        batchRead.mockReturnValue(new Promise(r => { answer = r }))
        mount({ radar: true, pendingScan: LIST }, { commit: vi.fn(async () => ({ ok: false, reason: 'save_failed', message: 'Could not save the list' })) })
        fireEvent.click(await screen.findByText('Save without the read'))
        await screen.findByRole('alert')
        answer({ rows: [] })
        await waitFor(() => expect(session.edit).toHaveBeenCalledWith('scanner', { read: { tickers: ['NVDA', 'MOS'], rows: [] } }))
    })

    it('a read answering after the surface closed is not handed back', async () => {
        let answer
        batchRead.mockReturnValue(new Promise(r => { answer = r }))
        const { unmount } = mount({ radar: true, pendingScan: LIST })
        await waitFor(() => expect(batchRead).toHaveBeenCalled())
        unmount()
        answer({ rows: [] })
        await new Promise(r => setTimeout(r, 20))
        expect(session.edit).not.toHaveBeenCalled()
    })

    it('a list whose read DROPPED names, re-emitted as it was first cut, is read again', async () => {
        batchRead.mockResolvedValue({ rows: [] })
        const { rerender } = mount({ radar: true, pendingScan: LIST })
        await waitFor(() => expect(batchRead).toHaveBeenCalledTimes(1))
        const narrowed = { ...LIST, candidates: [LIST.candidates[0]] }
        rerender(<ScannerSurface session={{ ...session, agentState: { scanner: { radar: true, pendingScan: narrowed, readCut: { dropped: [{ ticker: 'MOS' }], survived: true } } } }} deskProps={desk} />)
        rerender(<ScannerSurface session={{ ...session, agentState: { scanner: { radar: true, pendingScan: LIST } } }} deskProps={desk} />)
        await waitFor(() => expect(batchRead).toHaveBeenCalledTimes(2))
    })
})

describe('ScannerSurface — a radar cut', () => {
    it('the read runs BY ITSELF and hands its rows back as an edit of THAT list; the bar waits for it', async () => {
        let answer
        batchRead.mockReturnValue(new Promise(r => { answer = r }))
        mount({ radar: true, pendingScan: LIST })
        await waitFor(() => expect(batchRead).toHaveBeenCalledWith(['NVDA', 'MOS']))
        expect(screen.getByText('Prometheus is reading 2…')).toBeTruthy()
        expect(screen.queryByText('Generate list')).toBeNull()
        answer({ rows: [{ ticker: 'MOS', keep: false }] })
        await waitFor(() => expect(session.edit).toHaveBeenCalledWith('scanner', { read: { tickers: ['NVDA', 'MOS'], rows: [{ ticker: 'MOS', keep: false }] } }))
    })

    it('the server\'s verdict is drawn: what was dropped and the caveats on what stayed', () => {
        mount({ radar: true, pendingScan: { ...LIST, candidates: [{ ticker: 'NVDA', direction: 'long', prometheus: { direction: 'short' } }] }, readCut: { dropped: [{ ticker: 'MOS', verdict: 'contradicted' }], survived: true } })
        expect(batchRead).not.toHaveBeenCalled()
        expect(screen.getByText(/Prometheus dropped 1 — MOS contradicted\./)).toBeTruthy()
        expect(screen.getByText(/1 kept with a caveat/)).toBeTruthy()
        expect(screen.getByText('record disagrees')).toBeTruthy()
    })

    it('Save without the read saves now, and the read that lands after is NOT applied', async () => {
        let answer
        batchRead.mockReturnValue(new Promise(r => { answer = r }))
        mount({ radar: true, pendingScan: LIST })
        fireEvent.click(await screen.findByText('Save without the read'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('scanner', 'generate', expect.any(Object)))
        answer({ rows: [] })
        await new Promise(r => setTimeout(r, 20))
        expect(session.edit).not.toHaveBeenCalled()
    })

    it('the same names re-emitted (the verdict cleared) are read again', async () => {
        batchRead.mockResolvedValue({ rows: [] })
        const cut = { dropped: [], survived: true }
        const { rerender } = mount({ radar: true, pendingScan: LIST })
        await waitFor(() => expect(batchRead).toHaveBeenCalledTimes(1))
        rerender(<ScannerSurface session={{ ...session, agentState: { scanner: { radar: true, pendingScan: LIST, readCut: cut } } }} deskProps={desk} />)
        rerender(<ScannerSurface session={{ ...session, agentState: { scanner: { radar: true, pendingScan: { ...LIST } } } }} deskProps={desk} />)
        await waitFor(() => expect(batchRead).toHaveBeenCalledTimes(2))
    })

    it('a failed read says so and offers Try again; a list that moved on is quiet', async () => {
        batchRead.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ rows: [] })
        mount({ radar: true, pendingScan: LIST }, { edit: vi.fn(async () => ({ ok: false, reason: 'stale_read', message: 'x' })) })
        await screen.findByText(/The read failed/)
        fireEvent.click(screen.getByText('Try again'))
        await waitFor(() => expect(session.edit).toHaveBeenCalled())
        expect(screen.queryByText(/The read failed/)).toBeNull()
    })
})
