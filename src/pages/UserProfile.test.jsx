import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

// useAuth() without a provider is null and the destructure throws. See testUtils/authStub.js.
vi.mock('../context/AuthContext.jsx', async (orig) => {
    const { authModule } = await import('../testUtils/authStub.js')
    return authModule(await orig(), {
        user: { _id: 'u1', id: 'u1', username: 'roy_shacked', fullname: 'Roy Shacked', role: 'admin' },
        isAdmin: true, isLoading: false, setUser: () => {}, signout: () => {},
    })
})

// The open tab is the URL hash. `navigate({ hash })` is the only way the page moves it, so the
// mock writes the hash back into the location the page reads on its next render.
let hash = ''
const navigate = vi.fn(to => { if (to && typeof to === 'object' && 'hash' in to) hash = to.hash })
vi.mock('react-router', () => ({
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: '/profile', hash }),
}))

// The active workspace comes from the header switch; the page only READS it.
let workspace = 'paper'
vi.mock('../customHooks/useWorkspaceMode', () => ({
    useWorkspaceMode: () => ({ workspace, setWorkspace: vi.fn(), cycleWorkspace: vi.fn() }),
}))

// Network-backed data the page and its venue sections load on mount.
vi.mock('../services/broker/broker.service.remote.js', () => ({
    brokerService: {
        listConnections:    vi.fn().mockResolvedValue({ ctrader: false, ibkr: false }),
        getTradingAccounts: vi.fn().mockResolvedValue({ accounts: [], selectedAccountId: '' }),
        setSelectedAccount: vi.fn(), disconnect: vi.fn(), getConnectUrl: () => '#',
    },
}))
vi.mock('../services/user/user.service.remote.js', () => ({
    userService: { getTokenUsage: vi.fn().mockResolvedValue({ month: '2026-09', totalCost: 1, budgetUsd: 20, percentUsed: 5 }) },
}))
const listPaper = vi.fn().mockResolvedValue([])
vi.mock('../services/paper/paper.service.remote.js', () => ({
    paperService: { listAccounts: (...a) => listPaper(...a) },
}))
vi.mock('../services/manual/manual.service.remote.js', () => ({
    manualService: { listAccounts: vi.fn().mockResolvedValue([]) },
}))
vi.mock('../services/preferences.service.js', () => ({ queuePrefSync: vi.fn() }))

// Appearance widgets paint from the live palette / localStorage — not what this file tests.
vi.mock('../cmps/ThemeSwitcher/ThemeSwitcher',         () => ({ ThemeSwitcher:     () => null }))
vi.mock('../cmps/AccentSwitcher/AccentSwitcher',       () => ({ AccentSwitcher:    () => null }))
vi.mock('../cmps/CandleColorPicker/CandleColorPicker', () => ({ CandleColorPicker: () => null }))
vi.mock('../cmps/ModeSwitcher/ModeSwitcher',           () => ({ ModeSwitcher:      () => null }))
vi.mock('../cmps/PaceSlider.jsx',                      () => ({ PaceSlider:        () => null }))

import { UserProfile } from './UserProfile.jsx'

function renderPage() {
    return render(<UserProfile />)
}

const navItem = label =>
    [...screen.getByRole('navigation').querySelectorAll('button')].find(b => b.textContent.trim() === label)

afterEach(() => { cleanup(); workspace = 'paper'; hash = ''; navigate.mockClear(); listPaper.mockClear() })

describe('UserProfile — identity hero', () => {
    it('opens with avatar monogram, full name, handle, role and sign out', () => {
        renderPage()
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Roy Shacked')
        expect(screen.getByText('RS')).toBeTruthy()
        expect(screen.getByText('@roy_shacked')).toBeTruthy()
        expect(screen.getByText('Admin')).toBeTruthy()
        expect(screen.getByText('Sign out')).toBeTruthy()
    })

    it('names the active workspace as a chip', () => {
        renderPage()
        expect(screen.getByText('Paper workspace')).toBeTruthy()
    })
})

describe('UserProfile — nav + one open section', () => {
    it('lists every section under its group, and opens Account by default', () => {
        renderPage()
        const nav = screen.getByRole('navigation', { name: 'Profile sections' })
        expect(nav.textContent).toContain('Preferences')
        expect(nav.textContent).toContain('Trading venues')
        const items = [...nav.querySelectorAll('button')].map(b => b.textContent.trim())
        expect(items).toEqual(['Account', 'Appearance', 'AI', 'Usage', 'Brokers', 'Paper', 'Manual'])
        expect(navItem('Account').getAttribute('aria-current')).toBe('page')
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Account')
        expect(screen.queryByText('Connect cTrader')).toBeNull()
    })

    it('opens the section named in the URL hash', () => {
        hash = '#brokers'
        renderPage()
        expect(navItem('Brokers').getAttribute('aria-current')).toBe('page')
        expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Brokers')
        expect(screen.getByText('Connect cTrader')).toBeTruthy()
    })

    it('falls back to Account for an unknown hash', () => {
        hash = '#nope'
        renderPage()
        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Account')
    })

    it('selecting a tab navigates to its hash and shows only that section', async () => {
        const { rerender } = renderPage()
        fireEvent.click(navItem('Paper'))
        expect(navigate).toHaveBeenCalledWith({ hash: '#paper' })
        rerender(<UserProfile />)
        expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Paper Trading')
        expect(screen.queryByText('Account')).toBeTruthy() // still in the nav…
        expect(screen.queryByText('Edit Profile')).toBeNull() // …but its section is closed
    })

    it('re-selecting the open tab does not push another history entry', () => {
        renderPage()
        fireEvent.click(navItem('Account'))
        expect(navigate).not.toHaveBeenCalled()
    })

    it('a venue section only loads when its tab is opened', async () => {
        const { rerender } = renderPage()
        expect(listPaper).not.toHaveBeenCalled()
        fireEvent.click(navItem('Paper'))
        rerender(<UserProfile />)
        await waitFor(() => expect(listPaper).toHaveBeenCalledTimes(1))
    })
})

describe('UserProfile — venues follow the workspace but are never disabled', () => {
    it('dots the venue that matches the active workspace in the nav, and only that one', () => {
        renderPage()
        const dots = document.querySelectorAll('.user-profile__nav-dot')
        expect(dots).toHaveLength(1)
        expect(dots[0].closest('button').textContent).toContain('Paper')
    })

    it('badges the open venue section when it is the active workspace', () => {
        workspace = 'live'
        hash = '#brokers'
        renderPage()
        expect(screen.getByText('Active').closest('h2').textContent).toContain('Brokers')
        expect(screen.getByText('Live workspace')).toBeTruthy()
    })

    it('keeps a non-active venue interactive', async () => {
        hash = '#brokers' // standing in paper, opening the live venue
        const { container } = renderPage()
        expect(screen.queryByText('Active')).toBeNull()
        expect(container.querySelector('.user-profile__section--inactive')).toBeNull()
        expect(container.querySelector('[aria-disabled]')).toBeNull()
        await waitFor(() => expect(screen.getByText('Connect cTrader').disabled).toBe(false))
    })
})
