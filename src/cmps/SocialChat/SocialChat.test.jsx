import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act, cleanup } from '@testing-library/react'

// A message can be the FIRST in a conversation the list has never seen — a desk's thread is created
// by its first card. The live-update path maps over the conversations it already has, so such a
// message matched NOTHING: no row appeared, no count moved, and because useChatWs suppresses its
// own increment while the panel is open, the message went uncounted entirely until a reload.

const { listeners } = vi.hoisted(() => ({ listeners: {} }))

vi.mock('../../services/chat/chatWs.service', () => ({
    chatWsService: {
        on:  (ev, h) => { (listeners[ev] ??= new Set()).add(h) },
        off: (ev, h) => { listeners[ev]?.delete(h) },
    },
}))
vi.mock('../../services/chat/chat.service', () => ({
    chatService: {
        getConversations: vi.fn(),
        getMessages:      vi.fn().mockResolvedValue([]),
        markRead:         vi.fn().mockResolvedValue({ ok: true }),
    },
}))
vi.mock('../modelOptions', () => ({ readStoredModel: () => 'claude-opus-5' }))
vi.mock('./ConversationList', () => ({ ConversationList: () => <div data-testid="list" /> }))
// The window renders each message's resolution so the live-flip path below is observable.
vi.mock('./ChatWindow',       () => ({ ChatWindow:       ({ messages = [] }) => <div data-testid="window">{messages.map(m => `${m.id}:${m.status ?? '-'}:${m.resolveNote ?? '-'}`).join('|')}</div> }))

import { SocialChat }  from './SocialChat.jsx'
import { chatService } from '../../services/chat/chat.service'

// Every component below calls useAuth(); without a provider it is null and the
// destructure throws before the first assertion. See testUtils/authStub.js.
vi.mock('../../context/AuthContext.jsx', async (orig) => {
    const { authModule } = await import('../../testUtils/authStub.js')
    return authModule(await orig())
})

const conv = (id, unread = 0) => ({ id, unread, participants: ['u_1', 'u_2'], lastMessage: '' })
const fire = (ev, data) => listeners[ev]?.forEach(h => h(data))

beforeEach(() => {
    for (const k of Object.keys(listeners)) delete listeners[k]
    chatService.getConversations.mockResolvedValue([conv('c1', 0)])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('SocialChat live updates', () => {
    // A card's ask is satisfied on a DESK — the thesis is revised in Prometheus while the chat panel
    // sits open beside it. The server resolves the card and pushes `message_resolved`; the panel has
    // to flip that one card in place, or it reads "still waiting on you" until the panel is reopened.
    it('a message_resolved push collapses the card in the open conversation, note and all', async () => {
        chatService.getMessages.mockResolvedValue([
            { id: 'm1', conversationId: 'c1', type: 'coverage_event', status: 'pending', createdAt: 1 },
            { id: 'm2', conversationId: 'c1', type: 'text',           status: null,      createdAt: 2 },
        ])
        const { getByTestId } = render(<SocialChat currentUserId="u_1" initialConvId="c1" />)
        await waitFor(() => expect(getByTestId('window').textContent).toBe('m1:pending:-|m2:-:-'))

        act(() => { fire('message_resolved', { id: 'm1', conversationId: 'c1', status: 'done', resolvedAt: 3, resolveOutcome: 'revised', resolveNote: 'Re-modelled — PT 85 → 92' }) })
        expect(getByTestId('window').textContent).toBe('m1:done:Re-modelled — PT 85 → 92|m2:-:-')

        // A push for a conversation this panel is not showing changes nothing here.
        act(() => { fire('message_resolved', { id: 'm7', conversationId: 'c_other', status: 'done', resolveOutcome: 'completed' }) })
        expect(getByTestId('window').textContent).toBe('m1:done:Re-modelled — PT 85 → 92|m2:-:-')
    })

    it('counts a message into a conversation it already knows, without re-reading the list', async () => {
        const onUnreadChange = vi.fn()
        render(<SocialChat currentUserId="u_1" onUnreadChange={onUnreadChange} />)
        await waitFor(() => expect(onUnreadChange).toHaveBeenCalledWith(0))

        act(() => { fire('new_message', { conversationId: 'c1', id: 'm1', content: 'hi', createdAt: 1 }) })

        expect(onUnreadChange).toHaveBeenLastCalledWith(1)
        expect(chatService.getConversations).toHaveBeenCalledTimes(1)   // no needless refetch
    })

    it('RE-READS the list for a conversation it has never seen — otherwise the card is invisible', async () => {
        const onUnreadChange = vi.fn()
        render(<SocialChat currentUserId="u_1" onUnreadChange={onUnreadChange} />)
        await waitFor(() => expect(onUnreadChange).toHaveBeenCalledWith(0))

        // A desk posts its first card: the conversation was created server-side just now.
        chatService.getConversations.mockResolvedValue([conv('c1', 0), conv('c_new', 1)])
        await act(async () => { fire('new_message', { conversationId: 'c_new', id: 'm9', content: 'setup hit', createdAt: 2 }) })

        await waitFor(() => expect(onUnreadChange).toHaveBeenLastCalledWith(1))
        expect(chatService.getConversations).toHaveBeenCalledTimes(2)
    })

    it('a reconnected socket re-reads the list — it may have missed messages while down', async () => {
        const onUnreadChange = vi.fn()
        render(<SocialChat currentUserId="u_1" onUnreadChange={onUnreadChange} />)
        await waitFor(() => expect(onUnreadChange).toHaveBeenCalledWith(0))

        chatService.getConversations.mockResolvedValue([conv('c1', 3)])
        await act(async () => { fire('connected', null) })

        await waitFor(() => expect(onUnreadChange).toHaveBeenLastCalledWith(3))
    })
})
