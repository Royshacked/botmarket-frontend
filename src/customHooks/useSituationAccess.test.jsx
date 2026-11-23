import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { AuthContext } from '../context/AuthContext'
import { useSituationAccess, _resetSituationAccess } from './useSituationAccess.js'
import { situationService } from '../services/situation/situation.service.remote.js'

vi.mock('../services/situation/situation.service.remote.js', () => ({ situationService: { access: vi.fn() } }))

function Probe() { return <span>{useSituationAccess() ? 'yes' : 'no'}</span> }
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const withUser = (user, n = 1) => render(<AuthContext.Provider value={{ user }}>{Array.from({ length: n }, (_, i) => <Probe key={i} />)}</AuthContext.Provider>)

afterEach(() => { cleanup(); _resetSituationAccess(); vi.clearAllMocks() })

describe('useSituationAccess', () => {
    it('is false until the server says yes; two askers share ONE request', async () => {
        situationService.access.mockResolvedValue(true)
        withUser({ _id: 'roy' }, 2)
        expect(screen.getAllByText('no')).toHaveLength(2)
        await flush()
        expect(screen.getAllByText('yes')).toHaveLength(2)
        expect(situationService.access).toHaveBeenCalledTimes(1)
    })

    it('off the list, or signed out, it stays false — and a signed-out user is never asked about', async () => {
        situationService.access.mockResolvedValue(false)
        withUser({ _id: 'someone' })
        await flush()
        expect(screen.getByText('no')).toBeTruthy()
        cleanup()
        withUser(null)
        await flush()
        expect(situationService.access).toHaveBeenCalledTimes(1)
    })
})
