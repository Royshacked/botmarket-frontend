import { describe, it, expect, vi, beforeEach } from 'vitest'

// .jsx for vitest's scope (see vite.config). Pythia's long admin runs (code review 2026-10-11): each runs
// up to ten minutes on the server, so it gets a timeout past that, a second click while one is in flight
// is refused in the module (where a remounted button still sees it), and a client timeout reads as
// "still running", never as a failure that invites a second paid run.

const post = vi.fn()
vi.mock('../http.service', () => ({
    httpService: { post: (...a) => post(...a), get: vi.fn() },
    apiError: (err) => err?.response?.data?.error ?? err?.message ?? 'error',
}))

const { strategyService, INDUSTRIES_CHANGED } = await import('./strategy.service.remote.js')

beforeEach(() => { post.mockReset() })

describe('the long admin runs', () => {
    it('runs with a timeout past the server\'s ten minutes and announces when it lands', async () => {
        post.mockResolvedValueOnce({ ok: true })
        const heard = vi.fn()
        window.addEventListener(INDUSTRIES_CHANGED, heard)
        await strategyService.assessNow('45301020')
        window.removeEventListener(INDUSTRIES_CHANGED, heard)
        const [url, body, opts] = post.mock.calls[0]
        expect(url).toBe('api/strategy/assessments/45301020/run')
        expect(body).toEqual({})
        expect(opts.timeout).toBeGreaterThan(10 * 60 * 1000)
        expect(heard).toHaveBeenCalledTimes(1)
    })

    it('a second click while one is in flight is refused without a request', async () => {
        let release
        post.mockImplementationOnce(() => new Promise(r => { release = r }))
        const first = strategyService.assessTheme('th_ai')
        expect(strategyService.isRunning('theme:th_ai')).toBe(true)
        const second = await strategyService.assessTheme('th_ai').catch(e => e)
        expect(second.code).toBe('already_running')
        expect(strategyService.runError(second)).toMatch(/already running/)
        expect(post).toHaveBeenCalledTimes(1)
        release({ ok: true })
        await first
        expect(strategyService.isRunning('theme:th_ai')).toBe(false)
    })

    it('a client timeout reads as still running; a server refusal carries its detail', async () => {
        post.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
        const timedOut = await strategyService.proposeThemes().catch(e => e)
        expect(strategyService.runError(timedOut)).toMatch(/still running on the server/)
        expect(strategyService.isRunning('propose_themes')).toBe(false)

        expect(strategyService.runError({ response: { status: 409, data: {} } })).toMatch(/already running/)
        expect(strategyService.runError({ response: { status: 422, data: { detail: 'no news' } } })).toBe('no news')
        expect(strategyService.runError({ response: { status: 500, data: { error: 'boom' } } })).toBe('boom')
    })
})

describe('the week', () => {
    it('runs the week (force only when asked) and announces, without a long timeout: the server answers at once', async () => {
        post.mockResolvedValue({ ok: true, outcome: 'started' })
        const heard = vi.fn()
        window.addEventListener(INDUSTRIES_CHANGED, heard)
        await strategyService.runWeek()
        await strategyService.runWeek({ force: true })
        window.removeEventListener(INDUSTRIES_CHANGED, heard)
        expect(post.mock.calls).toEqual([['api/strategy/weekly/run', {}], ['api/strategy/weekly/run', { force: true }]])
        expect(heard).toHaveBeenCalledTimes(2)
    })
})
