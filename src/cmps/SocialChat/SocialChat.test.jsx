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
vi.mock('./ChatWindow',       () => ({ ChatWindow:       () => <div data-testid="window" /> }))

import { SocialChat }  from './SocialChat.jsx'
import { chatService } from '../../services/chat/chat.service'

const conv = (id, unread = 0) => ({ id, unread, participants: ['u_1', 'u_2'], lastMessage: '' })
const fire = (ev, data) => listeners[ev]?.forEach(h => h(data))

beforeEach(() => {
    for (const k of Object.keys(listeners)) delete listeners[k]
    chatService.getConversations.mockResolvedValue([conv('c1', 0)])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('SocialChat live updates', () => {
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
