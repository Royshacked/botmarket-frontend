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
