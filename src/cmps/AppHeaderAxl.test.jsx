import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// THE LISTS in the phone's menu (Roy, 2026-10-29: "in mobile — add lists to the hamburger menu"): the Floor's lists, each
// opening its window; an admin's list for an admin only; none outside the Floor design, where nothing renders them.

// The header's ambient stream asks for reduced motion; jsdom has no matchMedia.
window.matchMedia ??= () => ({ matches: true, addEventListener() {}, removeEventListener() {} })

const design = vi.hoisted(() => ({ value: 'floor' }))
vi.mock('../customHooks/useDesign.js', () => ({ useDesign: () => design.value }))
vi.mock('../customHooks/useChatWs', () => ({ useChatWs: () => ({ unread: 0, setUnread: vi.fn(), showChat: false, setShowChat: vi.fn(), pendingConvId: null, setPendingConvId: vi.fn(), pendingMsgId: null, setPendingMsgId: vi.fn() }) }))
vi.mock('../customHooks/useWorkspaceMode', () => ({ useWorkspaceMode: () => ({ workspace: 'live', setWorkspace: vi.fn() }) }))
vi.mock('./MarketClocks', () => ({ MarketClocks: () => null }))
vi.mock('./SocialChat/SocialChat', () => ({ SocialChat: () => null }))
const openPanel = vi.fn()
vi.mock('./DetailPanel/detailPanel.store.js', async (orig) => ({ ...(await orig()), openPanel: (...a) => openPanel(...a) }))

const { AppHeaderAxl } = await import('./AppHeaderAxl.jsx')
const { AuthContext } = await import('../context/AuthContext.jsx')
const { ADMIN, MEMBER } = await import('../testUtils/authStub.js')

const mount = (auth = MEMBER) => render(
    <MemoryRouter><AuthContext.Provider value={auth}><AppHeaderAxl /></AuthContext.Provider></MemoryRouter>,
)
afterEach(() => { cleanup(); openPanel.mockClear(); design.value = 'floor' })

describe('AppHeaderAxl — the lists in the menu', () => {
    it('lists the Floor\'s lists; a tap opens its window and closes the menu', () => {
        mount()
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
        const lists = screen.getByRole('navigation', { name: 'Lists' })
        const names = [...lists.querySelectorAll('button')].map(b => b.textContent)
        expect(names).toEqual(['Positions', 'Awaiting orders', 'Your trades', 'Your portfolios', 'Watchlists', 'Hotlist', 'Calendar', 'Forecasts'])
        fireEvent.click(screen.getByRole('button', { name: 'Hotlist' }))
        expect(openPanel).toHaveBeenCalledWith('hotlist')
        expect(screen.getByRole('button', { name: 'Open menu' }).getAttribute('aria-expanded')).toBe('false')
    })

    it('an admin has the research queue too', () => {
        mount(ADMIN)
        expect(screen.getByRole('button', { name: 'Research queue' })).toBeTruthy()
    })

    it('outside the Floor design there are no lists to open — none in the menu', () => {
        design.value = 'current'
        mount()
        expect(screen.queryByRole('navigation', { name: 'Lists' })).toBeNull()
    })
})
