import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// The models card (2026-09-21): ONE card, the admin's, choosing the desks' and Talos's model for
// everyone — the admin included. Server state (house_settings), never localStorage; the ids it
// offers are the backend registries' keys (cmps/modelOptions.js). No per-user selector exists.

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
import { TALOS_MODEL_OPTIONS, MODEL_OPTIONS } from '../cmps/modelOptions.js'
import { waitFor } from '@testing-library/react'

beforeEach(() => {
    localStorage.clear(); queuePrefSync.mockClear(); auth.isAdmin = true
    houseApi.get.mockReset().mockResolvedValue({ chatModel: 'gpt-5.6-luna', talosModel: null })
    houseApi.set.mockReset().mockImplementation(async (patch) => ({ chatModel: 'gpt-5.6-luna', talosModel: null, ...patch }))
})
afterEach(cleanup)

describe('UserProfile — the one models card (admin, for everyone)', () => {
    it('a non-admin gets NO model selector at all — neither desks nor Talos — and no house read', () => {
        auth.isAdmin = false
        render(<UserProfile />)
        expect(screen.getByText('AI Preferences')).toBeTruthy()
        expect(screen.queryByRole('combobox')).toBeNull()
        expect(screen.getByText(/set by the house/)).toBeTruthy()
        expect(houseApi.get).not.toHaveBeenCalled()
    })

    it('an admin gets exactly two selects — the house desks model and the house Talos model — and no per-user one', async () => {
        render(<UserProfile />)
        await waitFor(() => expect(screen.getByLabelText('House chat model').disabled).toBe(false))
        expect(screen.getAllByRole('combobox')).toHaveLength(2)
        expect(screen.queryByLabelText('Chat model')).toBeNull()
        expect(screen.queryByLabelText('Talos model')).toBeNull()
        expect(screen.getByText(/yours included/)).toBeTruthy()
    })

    it('loads the house choice, showing the registry default where nothing is set, with every candidate offered', async () => {
        render(<UserProfile />)
        await waitFor(() => expect(screen.getByLabelText('House chat model').value).toBe('gpt-5.6-luna'))
        expect(screen.getByLabelText('House Talos model').value).toBe('claude-sonnet-4-6')
        expect([...screen.getByLabelText('House chat model').options].map(o => o.value)).toEqual(MODEL_OPTIONS.map(m => m.id))
        expect([...screen.getByLabelText('House chat model').options].map(o => o.value)).toContain('gpt-5.6-luna')
        expect([...screen.getByLabelText('House Talos model').options].map(o => o.value)).toEqual(TALOS_MODEL_OPTIONS.map(m => m.id))
        expect([...screen.getByLabelText('House Talos model').options].map(o => o.value)).not.toContain('claude-haiku-4-5-20251001')
    })

    it('a change writes ONLY that id to the server and shows what came back; nothing goes to localStorage', async () => {
        render(<UserProfile />)
        await waitFor(() => expect(screen.getByLabelText('House chat model').disabled).toBe(false))
        fireEvent.change(screen.getByLabelText('House Talos model'), { target: { value: 'gpt-5.6-luna' } })
        await waitFor(() => expect(houseApi.set).toHaveBeenCalledWith({ talosModel: 'gpt-5.6-luna' }))
        await waitFor(() => expect(screen.getByLabelText('House Talos model').value).toBe('gpt-5.6-luna'))
        expect(localStorage.getItem('hermesModel')).toBeNull()
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
