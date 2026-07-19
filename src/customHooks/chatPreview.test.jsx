import { describe, it, expect, vi } from 'vitest'
import { chatPreview } from './useChatWs.js'

// useChatWs pulls in the WS/chat services (axios) + a sound util at load time — stub them so
// importing chatPreview doesn't drag network/audio side effects into the test.
vi.mock('../services/chat/chatWs.service', () => ({ chatWsService: { connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn() } }))
vi.mock('../services/chat/chat.service', () => ({ chatService: { getConversations: vi.fn() } }))
vi.mock('../services/sound.service', () => ({ playNotify: vi.fn() }))

describe('chatPreview', () => {
    it('shows the human sender name from senderName (the A+C fix)', () => {
        expect(chatPreview({ senderId: 'u_42', senderName: 'Roy', content: 'did you see AVGO?' }))
            .toBe('💬 Roy: did you see AVGO?')
    })

    it('resolves a bot sender to its brand, ignoring senderName', () => {
        // 'kairos' is a known bot id → brand from agent meta (not the raw id).
        const out = chatPreview({ senderId: 'kairos', content: 'thesis expired' })
        expect(out.startsWith('💬 ')).toBe(true)
        expect(out).toMatch(/: thesis expired$/)
        expect(out).not.toMatch(/kairos/)   // brand, not the raw id
    })

    it('falls back to a nameless preview when a human sender has no senderName', () => {
        expect(chatPreview({ senderId: 'u_7', content: 'hey' })).toBe('💬 hey')
    })

    it('uses a type label when the message has no text (special cards)', () => {
        expect(chatPreview({ senderId: 'u_7', senderName: 'Roy', type: 'invalidation_alert', content: '' }))
            .toBe('💬 Roy: Trade alert')
    })

    it('collapses whitespace and truncates long bodies to 80 chars', () => {
        const long = 'x'.repeat(200)
        const out  = chatPreview({ senderId: 'u_7', senderName: 'Roy', content: long })
        expect(out).toBe(`💬 Roy: ${'x'.repeat(80)}`)
    })
})
