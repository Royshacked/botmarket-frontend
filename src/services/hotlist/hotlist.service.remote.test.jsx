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

describe('hotlistService.getDayBoards', () => {
    beforeEach(() => httpService.get.mockReset())

    it('reads the day boards — the latest day by default, a given day by ?day=', async () => {
        httpService.get.mockResolvedValue({ day: '2026-11-11', boards: [{ id: 'hd_2026-11-11_open' }], days: ['2026-11-11'] })
        expect(await hotlistService.getDayBoards()).toEqual({ day: '2026-11-11', boards: [{ id: 'hd_2026-11-11_open' }], days: ['2026-11-11'] })
        expect(httpService.get).toHaveBeenLastCalledWith('api/hotlist/day')
        await hotlistService.getDayBoards('2026-11-10')
        expect(httpService.get).toHaveBeenLastCalledWith('api/hotlist/day?day=2026-11-10')
    })

    it('an empty answer is no boards, not a crash', async () => {
        httpService.get.mockResolvedValue(null)
        expect(await hotlistService.getDayBoards()).toEqual({ day: null, boards: [], days: [] })
    })
})
