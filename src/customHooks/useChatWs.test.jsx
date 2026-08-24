import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'

// The unread badge used to live on WS pushes alone: seeded once at mount, then only ever
// incremented by a live `new_message`. A WebSocket has no memory — anything that arrived while the
// socket was down (the reconnect window, a server restart, a sleeping laptop) was never pushed
// again, so the badge drifted down and STAYED there. The count only appeared when you opened the
// chat, because opening it does a REST read. These pin the reconciliation that replaced that.

const { listeners } = vi.hoisted(() => ({ listeners: {} }))

vi.mock('../services/chat/chatWs.service', () => ({
    chatWsService: {
        connect:    vi.fn(),
        disconnect: vi.fn(),
        on:  (ev, h) => { (listeners[ev] ??= new Set()).add(h) },
        off: (ev, h) => { listeners[ev]?.delete(h) },
    },
}))
vi.mock('../services/chat/chat.service', () => ({ chatService: { getConversations: vi.fn() } }))
vi.mock('../services/sound.service',     () => ({ playNotify: vi.fn() }))
vi.mock('../services/event-bus.service', () => ({ showUserMsg: vi.fn() }))
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))

import { useChatWs }  from './useChatWs.js'
import { chatService } from '../services/chat/chat.service'

const convs = (...counts) => counts.map((unread, i) => ({ id: `c${i}`, unread }))
const fire  = (ev, data) => listeners[ev]?.forEach(h => h(data))

beforeEach(() => {
    for (const k of Object.keys(listeners)) delete listeners[k]
    chatService.getConversations.mockResolvedValue(convs(0))
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('useChatWs — the unread badge', () => {
    it('seeds from the server on app open, without opening the chat', async () => {
        chatService.getConversations.mockResolvedValue(convs(2, 1))
        const { result } = renderHook(() => useChatWs('u_1'))

        await waitFor(() => expect(result.current.unread).toBe(3))
    })

    it('RE-READS on a (re)connected socket — the messages missed while it was down', async () => {
        chatService.getConversations.mockResolvedValue(convs(0))
        const { result } = renderHook(() => useChatWs('u_1'))
        await waitFor(() => expect(result.current.unread).toBe(0))

        // Socket drops, two cards land, socket comes back. Neither was ever pushed to this client.
        chatService.getConversations.mockResolvedValue(convs(2))
        await act(async () => { fire('connected', null) })

        await waitFor(() => expect(result.current.unread).toBe(2))
    })

    it('re-reads when the tab comes back to the foreground', async () => {
        const { result } = renderHook(() => useChatWs('u_1'))
        await waitFor(() => expect(result.current.unread).toBe(0))

        chatService.getConversations.mockResolvedValue(convs(4))
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })

        await waitFor(() => expect(result.current.unread).toBe(4))
    })

    it('re-reads when the network returns', async () => {
        const { result } = renderHook(() => useChatWs('u_1'))
        await waitFor(() => expect(result.current.unread).toBe(0))

        chatService.getConversations.mockResolvedValue(convs(1, 1, 1))
        await act(async () => { window.dispatchEvent(new Event('online')) })

        await waitFor(() => expect(result.current.unread).toBe(3))
    })

    it('never clobbers the number while the chat panel is open — the panel owns it there', async () => {
        const { result } = renderHook(() => useChatWs('u_1'))
        await waitFor(() => expect(result.current.unread).toBe(0))

        act(() => { result.current.setShowChat(true) })
        act(() => { result.current.setUnread(7) })          // what the open panel mirrored out

        chatService.getConversations.mockResolvedValue(convs(2))   // a stale read mid-session
        await act(async () => { fire('connected', null) })

        expect(result.current.unread).toBe(7)
    })

    it('leaves no listeners behind on unmount', async () => {
        const { unmount } = renderHook(() => useChatWs('u_1'))
        await waitFor(() => expect(listeners.connected?.size).toBe(1))

        unmount()
        expect(listeners.connected?.size ?? 0).toBe(0)

        // A late event on a dead hook must not re-read (nor throw).
        chatService.getConversations.mockClear()
        fire('connected', null)
        window.dispatchEvent(new Event('online'))
        document.dispatchEvent(new Event('visibilitychange'))
        expect(chatService.getConversations).not.toHaveBeenCalled()
    })

    it('a signed-out user is never read for, and shows nothing', async () => {
        const { result } = renderHook(() => useChatWs(null))
        expect(result.current.unread).toBe(0)
        expect(chatService.getConversations).not.toHaveBeenCalled()
    })

    it('a failed read keeps the last good count rather than blanking the badge', async () => {
        chatService.getConversations.mockResolvedValue(convs(5))
        const { result } = renderHook(() => useChatWs('u_1'))
        await waitFor(() => expect(result.current.unread).toBe(5))

        chatService.getConversations.mockRejectedValue(new Error('offline'))
        await act(async () => { fire('connected', null) })

        expect(result.current.unread).toBe(5)
    })
})
