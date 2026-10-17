import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

// The unified chat's timeline (plan phase 7, 7c/7d): the opening question, one speaker tag per voice change,
// hand-offs, decisions (live only while the chain waits), cards drawn by the shared bubble, tap options under
// the last reply, Stop on the live turn, the brief request. The session hook is stubbed — its own tests
// cover the socket.

vi.mock('../../context/AuthContext.jsx', async (orig) => {
    const { authModule } = await import('../../testUtils/authStub.js')
    return authModule(await orig())
})
window.HTMLElement.prototype.scrollIntoView = vi.fn()
vi.mock('../../customHooks/useMicInput.js', () => ({ useMicInput: () => ({ isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }) }))
const resolveForEdit = vi.fn(async () => ({ id: 's1', asset: 'NVDA' }))
vi.mock('../../services/entityResolve.js', () => ({ resolveForEdit: (...a) => resolveForEdit(...a) }))
const openEntityPopup = vi.fn()
vi.mock('../EntityCard/entityPopup.js', () => ({ openEntityPopup: (...a) => openEntityPopup(...a) }))

let session
const send = vi.fn(async () => true)
const stop = vi.fn()
const choose = vi.fn(async () => null)
const startNew = vi.fn()
const resolveCard = vi.fn()
vi.mock('../../customHooks/useSession.js', () => ({ useSession: () => session }))

const { ChatTimeline } = await import('./ChatTimeline.jsx')

const base = (over = {}) => ({
    sessionId: 's1', status: 'active', rows: [], live: null, lastTurn: null, chain: null, floor: 'axl', agentState: {}, loadError: null,
    send, stop, choose, startNew, resolveCard, ...over,
})
const row = (seq, over = {}) => ({ seq, agent: 'axl', role: 'assistant', kind: 'msg', content: `r${seq}`, at: seq, ...over })

beforeEach(() => { session = base(); [send, stop, choose, startNew, resolveCard, openEntityPopup].forEach(f => f.mockClear()) })
afterEach(cleanup)

describe('ChatTimeline', () => {
    it('an empty session is Axl’s opening question; a tap goes to Axl as the user’s own words, with the accounts', async () => {
        render(<ChatTimeline accounts={[{ id: 'a1' }]} mainAccountId="a1" />)
        expect(screen.getByText('What would you like to do?')).toBeTruthy()
        await act(async () => { fireEvent.click(screen.getByText('Trade it')) })
        expect(send).toHaveBeenCalledWith('Trade it', { agent: 'axl', accounts: [{ id: 'a1' }], mainAccountId: 'a1' })
    })

    it('one speaker tag per voice change — not on every row, never on the user’s', () => {
        session = base({ rows: [
            row(1, { role: 'user', content: 'hi' }),
            row(2, { content: 'Hello' }),
            row(3, { content: 'Also' }),
            row(4, { agent: 'mentor', content: 'Mentor here' }),
        ] })
        const { container } = render(<ChatTimeline />)
        const tags = [...container.querySelectorAll('.chat-timeline__speaker-name')].map(n => n.textContent)
        expect(tags).toEqual(['Axl', 'Mentor'])
    })

    it('a hand-off names both sides and carries its brief', () => {
        session = base({ rows: [row(1, { kind: 'handoff', agent: 'portfolio', to: 'scanner', content: 'Source me semis.' })] })
        render(<ChatTimeline />)
        expect(screen.getByText('Atlas → Argus')).toBeTruthy()
        expect(screen.getByText('Source me semis.')).toBeTruthy()
    })

    it('a decision’s taps are live only while the chain waits on it — and post the choice', async () => {
        const decision = row(2, { kind: 'decision', content: 'Keep going?', ref: { choices: [{ id: 'more', label: 'Keep going' }] } })
        session = base({ rows: [row(1, { kind: 'decision', content: 'old', ref: { choices: [{ id: 'continue', label: 'Old tap' }] } }), decision], chain: { status: 'awaiting' } })
        render(<ChatTimeline />)
        expect(screen.getByText('Old tap').disabled).toBe(true)
        await act(async () => { fireEvent.click(screen.getByText('Keep going')) })
        expect(choose).toHaveBeenCalledWith('more')
        cleanup()
        session = base({ rows: [decision], chain: { status: 'done' } })
        render(<ChatTimeline />)
        expect(screen.getByText('Keep going').disabled).toBe(true)
    })

    it('a card row is drawn by the shared card bubble from its card; a gone card keeps its words', () => {
        session = base({ rows: [
            row(1, { kind: 'card', agent: 'axl', content: 'Want today’s brief?', ref: { msgId: 'm1', conversationId: 'c1', type: 'market_brief_offer' }, card: { payload: { day: '2026-10-17' }, actions: { primary: { label: 'Show me' } }, status: 'pending' } }),
            row(2, { kind: 'card', agent: 'mentor', content: 'NVDA setup expired', ref: { msgId: 'm2', type: 'setup_invalidation' }, card: null }),
        ] })
        const { container } = render(<ChatTimeline />)
        expect(container.querySelectorAll('.chat-timeline__card').length).toBe(2)
        expect(screen.getByText('NVDA setup expired')).toBeTruthy()
    })

    it('tap options sit under the last reply and go out as a turn; gone while a turn runs', async () => {
        session = base({ rows: [row(1, { role: 'user', content: 'hi' }), row(2, { ref: { suggestions: ['Show NVDA'] } })] })
        render(<ChatTimeline />)
        await act(async () => { fireEvent.click(screen.getByText('Show NVDA')) })
        expect(send).toHaveBeenCalledWith('Show NVDA', { accounts: [], mainAccountId: null })
        cleanup()
        session = base({ rows: [row(1, { ref: { suggestions: ['Show NVDA'] } })], live: { turnId: 't', agent: 'axl', text: '', status: 'running' } })
        render(<ChatTimeline />)
        expect(screen.queryByText('Show NVDA')).toBeNull()
    })

    it('the live turn streams under its speaker; the waiting chip names the tool; Stop stops it', () => {
        session = base({ rows: [row(1, { role: 'user', content: 'scan semis' })], live: { turnId: 't1', agent: 'scanner', text: '', reasoning: '', tool: null, status: 'running' }, floor: 'scanner' })
        const { container, rerender } = render(<ChatTimeline />)
        expect(container.querySelector('.chat-timeline__row--live .chat-timeline__speaker-name').textContent).toBe('Argus')
        expect(screen.getByText('thinking…')).toBeTruthy()
        session = { ...session, live: { ...session.live, text: 'Looking at' } }
        rerender(<ChatTimeline />)
        expect(screen.getByText('Looking at')).toBeTruthy()
        fireEvent.click(screen.getByLabelText('Stop response'))
        expect(stop).toHaveBeenCalled()
    })

    it('a failed turn says so; the placeholder names who holds the floor', () => {
        session = base({ rows: [row(1, { role: 'user', content: 'x' })], lastTurn: { status: 'error', message: 'That message did not go through' }, floor: 'mentor' })
        render(<ChatTimeline />)
        expect(screen.getByText('That message did not go through')).toBeTruthy()
        expect(screen.getByPlaceholderText('Message Mentor…')).toBeTruthy()
    })

    it('the brief request asks Axl for today’s brief, once', () => {
        const onBriefStart = vi.fn()
        render(<ChatTimeline briefRequest={1} onBriefStart={onBriefStart} />)
        expect(onBriefStart).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledWith("Today's market brief, please.", { agent: 'axl', brief: true, accounts: [], mainAccountId: null })
    })

    it('a reply that offered to show a setup draws its button; the ticket offer opens the ticket', async () => {
        const onOpenTicket = vi.fn()
        session = base({ rows: [
            row(1, { content: 'Here it is', ref: { show: { kind: 'setup', ref: 'NVDA' } } }),
            row(2, { content: 'Place it yourself', ref: { show: { kind: 'ticket', ref: 'AAPL' } } }),
        ] })
        render(<ChatTimeline onOpenTicket={onOpenTicket} />)
        fireEvent.click(await screen.findByText('Open the NVDA setup'))
        expect(openEntityPopup).toHaveBeenCalledWith('setup', { id: 's1', asset: 'NVDA' })
        fireEvent.click(screen.getByText('Open the order ticket for AAPL'))
        expect(onOpenTicket).toHaveBeenCalledWith('AAPL')
    })

    it('New session is offered only once there is something to file', () => {
        render(<ChatTimeline />)
        expect(screen.getByText('New session').disabled).toBe(true)
        cleanup()
        session = base({ rows: [row(1)] })
        render(<ChatTimeline />)
        fireEvent.click(screen.getByText('New session'))
        expect(startNew).toHaveBeenCalled()
    })
})

describe('speaker runs around self-named rows', () => {
    it('a card carries its own tag — no speaker tag over it — and the reply after it is tagged again', () => {
        session = base({ rows: [
            row(1, { content: 'Hello' }),
            row(2, { kind: 'card', agent: 'axl', content: 'Brief?', ref: { msgId: 'm', type: 'unknown_type' }, card: { status: 'pending' } }),
            row(3, { content: 'Anything else?' }),
        ] })
        const { container } = render(<ChatTimeline />)
        const tags = [...container.querySelectorAll('.chat-timeline__speaker-name')].map(n => n.textContent)
        expect(tags).toEqual(['Axl', 'Axl'])
    })
})

describe('phase 7 CR', () => {
    it('the user can speak while a turn runs — the message waits, and says so', async () => {
        session = base({ rows: [row(1, { role: 'user', content: 'go' })], live: { turnId: 'chn_1', agent: 'mentor', text: 'Working', status: 'running' }, chain: { status: 'running' }, floor: 'mentor' })
        const { rerender } = render(<ChatTimeline />)
        const box = screen.getByPlaceholderText('Message Mentor…')
        fireEvent.change(box, { target: { value: 'use AMD instead' } })
        expect(screen.queryByLabelText('Stop response')).toBeNull()
        await act(async () => { fireEvent.click(screen.getByTitle('Send')) })
        expect(send).toHaveBeenCalledWith('use AMD instead', { accounts: [], mainAccountId: null })
        session = { ...session, queuedTurn: { turnId: 't2', agent: 'mentor', text: 'use AMD instead' } }
        rerender(<ChatTimeline />)
        expect(screen.getByText('use AMD instead')).toBeTruthy()
        expect(screen.getByText(/Sends when Mentor finishes — the chain will pause for it/)).toBeTruthy()
    })

    it('while a desk holds the floor, "Ask Axl instead" sends the next message to Axl', async () => {
        session = base({ rows: [row(1, { agent: 'portfolio', content: 'Objective?' })], floor: 'portfolio' })
        render(<ChatTimeline />)
        fireEvent.click(screen.getByText('Ask Axl instead'))
        const box = screen.getByPlaceholderText('Ask Axl anything, or say what you’d like to do…')
        fireEvent.change(box, { target: { value: 'what is a stop?' } })
        await act(async () => { fireEvent.click(screen.getByTitle('Send')) })
        expect(send).toHaveBeenCalledWith('what is a stop?', { accounts: [], mainAccountId: null, agent: 'axl' })
        expect(screen.getByPlaceholderText('Message Atlas…')).toBeTruthy()
    })
})
