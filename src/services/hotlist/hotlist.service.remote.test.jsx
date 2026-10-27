import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../http.service', () => ({ httpService: { get: vi.fn() } }))
import { httpService } from '../http.service'
import { hotlistService } from './hotlist.service.remote.js'

describe('hotlistService.getBook', () => {
    beforeEach(() => httpService.get.mockReset())

    it('passes the chain\'s picks through — dropping them made "Argus’s names" read as not loaded', async () => {
        const picks = { swing: [{ symbol: 'CHN', state: 'done' }], long_term: [] }
        httpService.get.mockResolvedValue({ asof: '2026-10-23', swing: [], long_term: [], picks, record: {} })
        expect((await hotlistService.getBook()).picks).toEqual(picks)
    })

    it('keeps picks null when the server could not read them (the list says so), not an empty chain', async () => {
        httpService.get.mockResolvedValue({ asof: '2026-10-23', swing: [], long_term: [], picks: null, record: {} })
        expect((await hotlistService.getBook()).picks).toBeNull()
        httpService.get.mockResolvedValue(null)
        expect(await hotlistService.getBook()).toEqual({ asof: null, swing: [], long_term: [], picks: null, record: {} })
    })
})
