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
// KLineCharts wants a real canvas — Mentor's trade chart draws a stub here.
vi.mock('../PriceChart/PriceChart.jsx', () => ({ PriceChart: ({ symbol }) => <div data-testid="price-chart" data-symbol={symbol} /> }))

let session
const send = vi.fn(async () => true)
const stop = vi.fn()
const choose = vi.fn(async () => null)
const startNew = vi.fn()
vi.mock('../../customHooks/useSession.js', () => ({ useSession: () => session }))

const { ChatTimeline } = await import('./ChatTimeline.jsx')
const { VIEW_LABELS } = await import('./ShowOffer.jsx')

const base = (over = {}) => ({
    sessionId: 's1', status: 'active', rows: [], live: null, lastTurn: null, chain: null, floor: 'axl', agentState: {}, loadError: null,
    send, stop, choose, startNew, ...over,
})
const row = (seq, over = {}) => ({ seq, agent: 'axl', role: 'assistant', kind: 'msg', content: `r${seq}`, at: seq, ...over })

beforeEach(() => { session = base(); [send, stop, choose, startNew, openEntityPopup].forEach(f => f.mockClear()) })
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

    it('a running tool names the stock it is on — and still shows under text already streamed (2026-10-19)', () => {
        const live = { turnId: 't1', agent: 'scanner', text: '', reasoning: '', tool: 'get_candles', targets: ['SCCO'], status: 'running' }
        session = base({ rows: [row(1, { role: 'user', content: 'pick one' })], live, floor: 'scanner' })
        const { rerender } = render(<ChatTimeline />)
        expect(screen.getByText('Reading price action · SCCO…')).toBeTruthy()
        session = { ...session, live: { ...live, text: 'Validating the twelve.', tool: 'get_indicators', targets: ['FCX'] } }
        rerender(<ChatTimeline />)
        expect(screen.getByText('Validating the twelve.')).toBeTruthy()
        expect(screen.getByText('Computing indicators · FCX…')).toBeTruthy()
        session = { ...session, live: { ...session.live, tool: null, targets: null } }
        rerender(<ChatTimeline />)
        expect(screen.queryByText(/Computing indicators/)).toBeNull()
        expect(screen.queryByText('thinking…')).toBeNull()      // text streaming, no tool: no chip
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
    it('a hand-off names both sides — no speaker tag over it — and the reply after it is tagged again', () => {
        session = base({ rows: [
            row(1, { content: 'Hello' }),
            row(2, { kind: 'handoff', agent: 'axl', to: 'axl', content: 'Brief' }),
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

describe('phase 7 CR (frontend)', () => {
    it('a first message that did not go through says so on the empty chat', () => {
        session = base({ lastTurn: { status: 'error', message: 'offline' } })
        render(<ChatTimeline />)
        expect(screen.getByText('What would you like to do?')).toBeTruthy()
        expect(screen.getByText('offline')).toBeTruthy()
    })

    it('a typed message that failed comes back to the box', async () => {
        send.mockResolvedValueOnce(false)
        session = base({ rows: [row(1)] })
        render(<ChatTimeline />)
        const box = screen.getByPlaceholderText('Ask Axl anything, or say what you’d like to do…')
        fireEvent.change(box, { target: { value: 'hello there' } })
        await act(async () => { fireEvent.click(screen.getByTitle('Send')) })
        expect(box.value).toBe('hello there')
    })

    it('a waiting message can be cancelled', () => {
        const cancelQueued = vi.fn()
        session = base({ rows: [row(1)], live: { turnId: 'a', agent: 'axl', text: 'x', status: 'running' }, queuedTurn: { turnId: 'b', agent: 'axl', text: 'later' }, cancelQueued })
        render(<ChatTimeline />)
        fireEvent.click(screen.getByText('Cancel'))
        expect(cancelQueued).toHaveBeenCalled()
    })

    it('the brief waits while a message is already waiting', () => {
        const onBriefStart = vi.fn()
        session = base({ rows: [row(1)], live: { turnId: 'a', agent: 'axl', text: 'x', status: 'running' }, queuedTurn: { turnId: 'b', agent: 'axl', text: 'later' } })
        render(<ChatTimeline briefRequest={1} onBriefStart={onBriefStart} />)
        expect(onBriefStart).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
    })

    it("8e: the desks the header offers (an admin's Pythia and Aether) open beside the chat; none offered, none shown", () => {
        const onOpenDesk = vi.fn()
        render(<ChatTimeline desks={[{ agent: 'strategy', label: 'Pythia' }, { agent: 'aether', label: 'Aether' }]} onOpenDesk={onOpenDesk} />)
        fireEvent.click(screen.getByRole('button', { name: 'Pythia' }))
        fireEvent.click(screen.getByRole('button', { name: 'Aether' }))
        expect(onOpenDesk.mock.calls).toEqual([['strategy'], ['aether']])
        cleanup()
        render(<ChatTimeline />)
        expect(screen.queryByRole('button', { name: 'Pythia' })).toBeNull()
    })
})

describe('a session a commit opened (Roy, 2026-10-18)', () => {
    const ended = (over = {}) => row(1, { kind: 'sealed', agent: 'axl', content: '✓ Mentor built NVDA setup — saved to your Setups. You\'re back with Axl.', ref: { kind: 'setup', ids: ['s9'], ended: true }, ...over })

    it('is a fresh start: the saved line ABOVE Axl\'s greeting and opening taps', () => {
        session = base({ rows: [ended()] })
        const { container } = render(<ChatTimeline />)
        expect(container.querySelector('.chat-timeline__empty .chat-timeline__ended').textContent).toMatch(/back with Axl/)
        expect(screen.getByText('Trade it')).toBeTruthy()
        expect(container.querySelector('.chat-timeline__title').textContent).toBe('Chat')
    })

    it('a saved setup opens in its own window — where it is armed', () => {
        session = base({ rows: [ended()] })
        render(<ChatTimeline />)
        fireEvent.click(screen.getByRole('button', { name: 'Open the setup to arm it' }))
        expect(openEntityPopup).toHaveBeenCalledWith('setup', 's9')
    })

    it('anything else saved has no button; once the user speaks the line is GONE — it was for the fresh start only', () => {
        session = base({ rows: [ended({ ref: { kind: 'scan', ids: ['x'], ended: true } })] })
        render(<ChatTimeline />)
        expect(screen.queryByRole('button', { name: /Open the setup/ })).toBeNull()
        cleanup()
        session = base({ rows: [ended(), row(2, { role: 'user', content: 'hi' }), row(3, { content: 'Hello — what next?' })] })
        const { container } = render(<ChatTimeline />)
        expect(screen.queryByText('Trade it')).toBeNull()
        expect(container.querySelector('.chat-timeline__ended')).toBeNull()
        expect(screen.queryByText(/back with Axl/)).toBeNull()
        // The reply is tagged as Axl's run as ever — the hidden line is not a row it follows.
        expect([...container.querySelectorAll('.chat-timeline__speaker-name')].map(n => n.textContent)).toEqual(['Axl'])
    })
})

describe('the speaker tag (Roy, 2026-10-19)', () => {
    it('the agent’s name beside its glyph, its role small under the name; Axl by his name alone', () => {
        session = base({ rows: [
            row(1, { content: 'Hello' }),
            row(2, { agent: 'mentor', content: 'NVDA — here is the plan' }),
            row(3, { agent: 'portfolio', content: 'The book' }),
            row(4, { agent: 'scanner', content: 'A list' }),
            row(5, { agent: 'analyst', content: 'A thesis' }),
        ] })
        const { container } = render(<ChatTimeline />)
        const tags = [...container.querySelectorAll('.chat-timeline__speaker')].map(t => ({
            name: t.querySelector('.chat-timeline__speaker-label .chat-timeline__speaker-name').textContent,
            role: t.querySelector('.chat-timeline__speaker-label .chat-timeline__speaker-role')?.textContent ?? null,
        }))
        expect(tags).toEqual([
            { name: 'Axl', role: null },
            { name: 'Mentor', role: 'Trade agent' },
            { name: 'Atlas', role: 'Investment agent' },
            { name: 'Argus', role: 'Scan agent' },
            { name: 'Prometheus', role: 'Analyst agent' },
        ])
    })
})

describe('the house views open from Axl (Roy, 2026-10-19)', () => {
    const shown = (kind, ref = null) => row(2, { content: kind === 'calendar' ? "Here's the calendar." : "Here's the forecast heat map.", ref: { show: { kind, ref } } })

    it('"show me the calendar" — it opens as the turn ends, once; the row keeps a button to open it again', () => {
        const onOpenView = vi.fn()
        session = base({ rows: [row(1, { role: 'user', content: 'show me the calendar' }), shown('calendar')], lastTurn: { turnId: 't1', status: 'done', payload: { show: { kind: 'calendar', ref: null } } } })
        const { rerender } = render(<ChatTimeline onOpenView={onOpenView} />)
        expect(onOpenView).toHaveBeenCalledWith('calendar', null)
        rerender(<ChatTimeline onOpenView={onOpenView} />)
        expect(onOpenView).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByText('Open the calendar'))
        expect(onOpenView).toHaveBeenCalledTimes(2)
    })

    it('"show me the heat map" on a name — the map opens on it', () => {
        const onOpenView = vi.fn()
        session = base({ rows: [shown('heatmap', 'NVDA')], lastTurn: { turnId: 't2', status: 'done', payload: { show: { kind: 'heatmap', ref: 'NVDA' } } } })
        render(<ChatTimeline onOpenView={onOpenView} />)
        expect(onOpenView).toHaveBeenCalledWith('heatmap', 'NVDA')
        expect(screen.getByText('Open the forecast heat map on NVDA')).toBeTruthy()
    })

    it('a reload (no live turn) does not reopen it, nor does a setup show or a failed turn', () => {
        const onOpenView = vi.fn()
        session = base({ rows: [shown('calendar')], lastTurn: null })
        render(<ChatTimeline onOpenView={onOpenView} />)
        cleanup()
        session = base({ rows: [], lastTurn: { turnId: 't3', status: 'done', payload: { show: { kind: 'setup', ref: 's1' } } } })
        render(<ChatTimeline onOpenView={onOpenView} />)
        cleanup()
        session = base({ rows: [], lastTurn: { turnId: 't4', status: 'error', payload: { show: { kind: 'calendar' } } } })
        render(<ChatTimeline onOpenView={onOpenView} />)
        expect(onOpenView).not.toHaveBeenCalled()
    })

    // Every Floor list is a view too (Roy, 2026-10-22): "show me my trades" opens the Trades window.
    it('a list shown by Axl opens as the turn ends, and its row keeps a button', () => {
        const onOpenView = vi.fn()
        session = base({ rows: [row(2, { content: 'Here are your trades.', ref: { show: { kind: 'trades', ref: null } } })],
            lastTurn: { turnId: 't5', status: 'done', payload: { show: { kind: 'trades', ref: null } } } })
        render(<ChatTimeline onOpenView={onOpenView} />)
        expect(onOpenView).toHaveBeenCalledWith('trades', null)
        fireEvent.click(screen.getByText('Open your trades'))
        expect(onOpenView).toHaveBeenCalledTimes(2)
    })

    // Every list, through Axl (Roy, 2026-10-22).
    it('every list has its words on the button', () => {
        for (const kind of ['positions', 'orders', 'trades', 'portfolios', 'watchlists', 'hotlist', 'board', 'research']) expect(VIEW_LABELS[kind]).toMatch(/^Open /)
    })
})

// INFO over the chat (Roy, 2026-10-29: "add an info tab when chatting") — a phone's button; the CSS hides it wider.
describe('ChatTimeline — Info', () => {
    it("the header's Info opens what the desk you are talking to does, over the chat; × closes it", () => {
        session = base({ floor: 'analyst', rows: [row(1, { agent: 'analyst', content: 'On it.' })] })
        render(<ChatTimeline />)
        fireEvent.click(screen.getByRole('button', { name: 'Info' }))
        expect(screen.getByRole('dialog', { name: 'Info' })).toBeTruthy()
        expect(screen.getByRole('heading', { name: /^Talking with Prometheus/ })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(screen.queryByRole('dialog', { name: 'Info' })).toBeNull()
    })
})

describe('ChatTimeline — Mentor’s trade chart (2026-10-31)', () => {
    const PLAN = { asset: 'NXST', direction: 'long', timeframe: 'day', scenarios: [{ id: 's1', entry_legs: [{ price: 28.8 }], stop_legs: [{ price: 26.9 }], target_legs: [{ price: 31.6 }] }] }
    const mentor = (readiness) => ({ mentor: { draft: PLAN, view: { readiness } } })

    it('Generate lit → the trade is drawn at the end of the thread, from the session alone (no pane needed)', () => {
        session = base({ floor: 'mentor', rows: [row(1, { agent: 'mentor', content: 'Ready.' })], agentState: mentor({ ready: true, missing: [] }) })
        const { container } = render(<ChatTimeline accounts={[{ id: 'a1' }]} />)
        const chart = container.querySelector('.chat-timeline__thread .mentor-trade-chart')
        expect(chart).toBeTruthy()
        expect(chart.previousElementSibling.textContent).toContain('Ready.')
        expect(screen.getByTestId('price-chart').dataset.symbol).toBe('NXST')
    })

    it('not lit, or no account marked → no chart', () => {
        session = base({ floor: 'mentor', rows: [row(1, { agent: 'mentor' })], agentState: mentor({ ready: false, missing: ['a size'] }) })
        render(<ChatTimeline accounts={[{ id: 'a1' }]} />)
        expect(screen.queryByTestId('price-chart')).toBeNull()
        cleanup()
        session = base({ floor: 'mentor', rows: [row(1, { agent: 'mentor' })], agentState: mentor({ ready: true, missing: [] }) })
        render(<ChatTimeline accounts={[]} />)
        expect(screen.queryByTestId('price-chart')).toBeNull()
    })
})
