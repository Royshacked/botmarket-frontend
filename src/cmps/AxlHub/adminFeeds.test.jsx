import { describe, it, expect } from 'vitest'
import { ADMIN_BOT_IDS, isAdminBotId, BOT_IDS, RETIRED_BOT_IDS } from './agentMeta.jsx'

// The admin-only feeds. SocialChat drops a conversation whose participant is one of these for a
// non-admin, and the backend (chat.service ADMIN_BOT_IDS) hides the same threads server-side —
// the two lists must say the same thing, so this pins what the client says.
describe('admin-only feeds', () => {
    it('Pythia (strategy) and Prometheus (analyst) are the admin-only feeds', () => {
        expect(ADMIN_BOT_IDS).toEqual(['strategy', 'analyst'])
        expect(isAdminBotId('strategy')).toBe(true)
        expect(isAdminBotId('analyst')).toBe(true)
    })

    it('every other live bot stays a feed for everyone', () => {
        for (const id of BOT_IDS.filter(id => !ADMIN_BOT_IDS.includes(id))) {
            expect(isAdminBotId(id)).toBe(false)
        }
        expect(isAdminBotId('u_1')).toBe(false)
    })

    it('an admin-only feed is a LIVE feed, never a retired one', () => {
        for (const id of ADMIN_BOT_IDS) {
            expect(BOT_IDS).toContain(id)
            expect(RETIRED_BOT_IDS).not.toContain(id)
        }
    })
})

// The BOT_ID list itself, pinned against the backend’s.
//
// These two arrays are one fact in two repos and nothing enforces it — a cross-repo import is not
// available here, so this is a PIN, not a live cross-check: it fails when THIS side changes and
// says where to look, which is the half that is checkable. The backend list lives in
// api/chat/chat.service.js.
//
// They had drifted: aether was here and not there. Nothing posts under it server-side, so
// postBotCard would have fallen back to Axl (its comment: "a missing entry doesn’t error, it
// misattributes"), and because it is also absent from ADMIN_BOT_IDS an admin-only desk’s feed
// would have appeared in a trader’s sidebar.
describe('the bot registry', () => {
    it('matches the backend BOT_IDS exactly (api/chat/chat.service.js)', () => {
        expect(BOT_IDS).toEqual(['axl', 'portfolio', 'scanner', 'kairos', 'mentor', 'analyst', 'strategy'])
    })

    // Aether is admin-only everywhere else in the app. If it ever gains a notifier it needs four
    // entries — both BOT_IDS and both ADMIN_BOT_IDS — so a half-add cannot leak the feed.
    it('has no aether feed, because nothing posts one', () => {
        expect(BOT_IDS).not.toContain('aether')
    })
})
