import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useSeedTurn } from './useSeedTurn.js'

// The hand-off seed every desk shares: Axl routes a ticker to Prometheus, a calendar row opens
// Mentor on a catalyst. The whole contract is "one hand-off, one turn" — a seed that fires twice
// double-sends a message the user only meant once, and one that never re-fires leaves the second
// hand-off of the same name silently dead.

afterEach(cleanup)

describe('useSeedTurn', () => {
    it('sends the seeded message once, and NOT again on re-render', () => {
        const send = vi.fn()
        const seed = { key: 1, message: 'Research NVDA for coverage.' }
        const { rerender } = renderHook(({ s }) => useSeedTurn(s, send), { initialProps: { s: seed } })

        expect(send).toHaveBeenCalledExactlyOnceWith('Research NVDA for coverage.')
        rerender({ s: seed })
        rerender({ s: { ...seed } })          // same key, new object identity — still one hand-off
        expect(send).toHaveBeenCalledTimes(1)
    })

    it('a NEW key sends again — the same name can be handed over twice', () => {
        const send = vi.fn()
        const { rerender } = renderHook(({ s }) => useSeedTurn(s, send), {
            initialProps: { s: { key: 1, message: 'Research NVDA for coverage.' } },
        })
        rerender({ s: { key: 2, message: 'Research NVDA for coverage.' } })

        expect(send).toHaveBeenCalledTimes(2)
    })

    it('no seed / no message → no turn (a desk opened by button starts empty)', () => {
        const send = vi.fn()
        const { rerender } = renderHook(({ s }) => useSeedTurn(s, send), { initialProps: { s: null } })
        rerender({ s: { key: 1 } })
        rerender({ s: { key: 2, message: '' } })

        expect(send).not.toHaveBeenCalled()
    })

    it('calls the LATEST send — the panel re-creates it every render', () => {
        const stale = vi.fn()
        const fresh = vi.fn()
        const { rerender } = renderHook(
            ({ s, fn }) => useSeedTurn(s, fn),
            { initialProps: { s: null, fn: stale } },
        )
        rerender({ s: { key: 1, message: 'Research NVDA for coverage.' }, fn: fresh })

        expect(stale).not.toHaveBeenCalled()
        expect(fresh).toHaveBeenCalledOnce()
    })
})
