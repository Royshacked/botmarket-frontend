import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// The Monitors card (2026-09-20): the admin's Talos model menu. Admin-only, writes `hermesModel`,
// and the ids it offers are the backend's TALOS_MODELS keys (cmps/modelOptions.js).

// A mutable auth value, hoisted so the mock factory can see it and a test can flip isAdmin.
const auth = vi.hoisted(() => ({
    user: { _id: 'u1', id: 'u1', username: 'roy_shacked', fullname: 'Roy', role: 'admin' },
    isAdmin: true, isLoading: false, setUser: () => {}, signout: () => {},
}))
vi.mock('../context/AuthContext.jsx', async (orig) => {
    const { authModule } = await import('../testUtils/authStub.js')
    return authModule(await orig(), auth)
})
vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
    useLocation: () => ({ hash: '#ai', pathname: '/profile' }),
}))
vi.mock('../customHooks/useWorkspaceMode', () => ({ useWorkspaceMode: () => ({ mode: 'paper' }) }))
vi.mock('../services/broker/broker.service.remote.js', () => ({
    brokerService: {
        listConnections:    vi.fn().mockResolvedValue({ ctrader: false, ibkr: false }),
        getTradingAccounts: vi.fn().mockResolvedValue({ accounts: [], selectedAccountId: '' }),
    },
}))
// The house models (2026-09-21): admin-only server state — read on load, written per change.
const houseApi = vi.hoisted(() => ({
    get: vi.fn(),
    set: vi.fn(),
}))
vi.mock('../services/user/user.service.remote.js', () => ({
    userService: {
        getTokenUsage:  vi.fn().mockResolvedValue({ month: '2026-09', totalCost: 1, budgetUsd: 20, percentUsed: 5 }),
        getHouseModels: (...a) => houseApi.get(...a),
        setHouseModels: (...a) => houseApi.set(...a),
    },
}))
vi.mock('../services/paper/paper.service.remote.js',   () => ({ paperService:  { listAccounts: vi.fn().mockResolvedValue([]) } }))
vi.mock('../services/manual/manual.service.remote.js', () => ({ manualService: { listAccounts: vi.fn().mockResolvedValue([]) } }))
const queuePrefSync = vi.fn()
vi.mock('../services/preferences.service.js', () => ({ queuePrefSync: (...a) => queuePrefSync(...a) }))
vi.mock('../cmps/ThemeSwitcher/ThemeSwitcher',         () => ({ ThemeSwitcher:     () => null }))
vi.mock('../cmps/AccentSwitcher/AccentSwitcher',       () => ({ AccentSwitcher:    () => null }))
vi.mock('../cmps/CandleColorPicker/CandleColorPicker', () => ({ CandleColorPicker: () => null }))
vi.mock('../cmps/ModeSwitcher/ModeSwitcher',           () => ({ ModeSwitcher:      () => null }))
vi.mock('../cmps/PaceSlider.jsx',                      () => ({ PaceSlider:        () => null }))
vi.mock('../cmps/PushAlerts/PushAlertsSection.jsx',    () => ({ PushAlertsSection: () => null }))

import { UserProfile } from './UserProfile.jsx'
import { TALOS_MODEL_KEY, TALOS_MODEL_OPTIONS, MODEL_OPTIONS } from '../cmps/modelOptions.js'
import { waitFor } from '@testing-library/react'

beforeEach(() => {
    localStorage.clear(); queuePrefSync.mockClear(); auth.isAdmin = true
    houseApi.get.mockReset().mockResolvedValue({ chatModel: 'gpt-5.6-luna', talosModel: null })
    houseApi.set.mockReset().mockImplementation(async (patch) => ({ chatModel: 'gpt-5.6-luna', talosModel: null, ...patch }))
})
afterEach(cleanup)

describe('UserProfile — the Monitors (Talos) model card', () => {
    it('offers the five candidates to an admin, defaulting to Sonnet 4.6', () => {
        render(<UserProfile />)
        const select = screen.getByLabelText('Talos model')
        expect(select.value).toBe('claude-sonnet-4-6')
        expect([...select.options].map(o => o.value)).toEqual(TALOS_MODEL_OPTIONS.map(m => m.id))
        expect([...select.options].map(o => o.value)).not.toContain('claude-haiku-4-5-20251001')
    })

    it('a pick writes hermesModel and syncs the snapshot', () => {
        render(<UserProfile />)
        fireEvent.change(screen.getByLabelText('Talos model'), { target: { value: 'gpt-5.6-luna' } })
        expect(localStorage.getItem(TALOS_MODEL_KEY)).toBe('gpt-5.6-luna')
        expect(screen.getByLabelText('Talos model').value).toBe('gpt-5.6-luna')
        expect(queuePrefSync).toHaveBeenCalledTimes(1)
    })

    it('reads a stored choice back, and ignores a stored id it does not offer', () => {
        localStorage.setItem(TALOS_MODEL_KEY, 'mistral-medium-3.5')
        const { unmount } = render(<UserProfile />)
        expect(screen.getByLabelText('Talos model').value).toBe('mistral-medium-3.5')
        unmount()
        localStorage.setItem(TALOS_MODEL_KEY, 'claude-haiku-4-5-20251001')
        render(<UserProfile />)
        expect(screen.getByLabelText('Talos model').value).toBe('claude-sonnet-4-6')
    })

    it('a non-admin gets NO model selector at all — neither desks nor Talos — and no house read', () => {
        auth.isAdmin = false
        render(<UserProfile />)
        expect(screen.getByText('AI Preferences')).toBeTruthy()
        expect(screen.queryByRole('combobox')).toBeNull()
        expect(screen.getByText(/set by the house/)).toBeTruthy()
        expect(houseApi.get).not.toHaveBeenCalled()
    })

    it("the admin's own chat select offers the Luna candidate", () => {
        render(<UserProfile />)
        const chat = screen.getByLabelText('Chat model')
        expect([...chat.options].map(o => o.value)).toContain('gpt-5.6-luna')
    })
})

describe('UserProfile — the House models card (admin)', () => {
    it('loads the house choice, showing the registry default where nothing is set', async () => {
        render(<UserProfile />)
        await waitFor(() => expect(screen.getByLabelText('House chat model').value).toBe('gpt-5.6-luna'))
        expect(screen.getByLabelText('House Talos model').value).toBe('claude-sonnet-4-6')
        expect([...screen.getByLabelText('House chat model').options].map(o => o.value)).toEqual(MODEL_OPTIONS.map(m => m.id))
        expect([...screen.getByLabelText('House Talos model').options].map(o => o.value)).toEqual(TALOS_MODEL_OPTIONS.map(m => m.id))
    })

    it('a change writes ONLY that id to the server and shows what came back; nothing goes to localStorage', async () => {
        render(<UserProfile />)
        await waitFor(() => expect(screen.getByLabelText('House chat model').disabled).toBe(false))
        fireEvent.change(screen.getByLabelText('House Talos model'), { target: { value: 'gpt-5.6-luna' } })
        await waitFor(() => expect(houseApi.set).toHaveBeenCalledWith({ talosModel: 'gpt-5.6-luna' }))
        await waitFor(() => expect(screen.getByLabelText('House Talos model').value).toBe('gpt-5.6-luna'))
        expect(localStorage.getItem(TALOS_MODEL_KEY)).toBeNull()
        expect(queuePrefSync).not.toHaveBeenCalled()
    })

    it('a failed save rolls the select back and says so', async () => {
        houseApi.set.mockRejectedValue(new Error('403'))
        render(<UserProfile />)
        await waitFor(() => expect(screen.getByLabelText('House chat model').disabled).toBe(false))
        fireEvent.change(screen.getByLabelText('House chat model'), { target: { value: 'claude-opus-5' } })
        await waitFor(() => expect(screen.getByText(/was not saved/)).toBeTruthy())
        expect(screen.getByLabelText('House chat model').value).toBe('gpt-5.6-luna')
    })
})
