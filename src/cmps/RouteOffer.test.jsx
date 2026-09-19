import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

import { RouteOffer } from './RouteOffer.jsx'
import { readRoute, useRouteOffer } from '../customHooks/useRouteOffer.js'

afterEach(cleanup)

// The desk-to-desk hand-off, panel side: any desk's done payload may route (the same fields Axl's
// carries); the hook holds it, the offer shows it, the doorway is MainPage's. One shell for six
// panels, so what counts as "routes" and what the button says cannot drift between them.

describe('readRoute', () => {
    it('nothing routes → null; a route or an edit → the four fields, nulls filled', () => {
        expect(readRoute({ reply: 'hi' })).toBe(null)
        expect(readRoute(null)).toBe(null)
        expect(readRoute({ route: 'research', routeSymbol: 'NVDA', opening: 'Look.' }))
            .toEqual({ route: 'research', routeSymbol: 'NVDA', opening: 'Look.', edit: null })
        expect(readRoute({ edit: { kind: 'coverage', ref: 'c1', desk: 'research' } }))
            .toEqual({ route: null, routeSymbol: null, opening: null, edit: { kind: 'coverage', ref: 'c1', desk: 'research' } })
    })
})

describe('useRouteOffer', () => {
    it('captures a routing payload, ignores a plain one, clears on demand', () => {
        const { result } = renderHook(() => useRouteOffer())
        act(() => result.current.capture({ reply: 'plain' }))
        expect(result.current.offer).toBe(null)
        act(() => result.current.capture({ route: 'assist', routeSymbol: 'TSLA' }))
        expect(result.current.offer?.route).toBe('assist')
        act(() => result.current.capture({ reply: 'plain again' }))
        expect(result.current.offer?.route).toBe('assist', 'a plain turn does not wipe an offer — _send does, on purpose')
        act(() => result.current.clear())
        expect(result.current.offer).toBe(null)
    })
})

describe('RouteOffer', () => {
    const offer = { route: 'research', routeSymbol: 'NVDA', opening: 'Look at NVDA.', edit: null }

    it('names the desk by its agent brand and the symbol, and hands the offer to Go', () => {
        const onGo = vi.fn()
        render(<RouteOffer offer={offer} onGo={onGo} />)
        fireEvent.click(screen.getByRole('button', { name: 'Go to Prometheus · NVDA' }))
        expect(onGo).toHaveBeenCalledWith(offer)
    })

    it('an edit names the desk that owns the item', () => {
        render(<RouteOffer offer={{ route: null, routeSymbol: null, opening: null, edit: { kind: 'setup', ref: 's1', desk: 'assist' } }} />)
        expect(screen.getByRole('button', { name: 'Go to Mentor' })).toBeTruthy()
    })

    it('waits for the reply to land, and draws nothing for an unknown desk', () => {
        const { rerender } = render(<RouteOffer offer={offer} busy />)
        expect(screen.queryByRole('button')).toBe(null)
        rerender(<RouteOffer offer={{ ...offer, route: 'kairos' }} />)
        expect(screen.queryByRole('button')).toBe(null)
    })

    it('Not now dismisses', () => {
        const onDismiss = vi.fn()
        render(<RouteOffer offer={offer} onDismiss={onDismiss} />)
        fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
        expect(onDismiss).toHaveBeenCalledTimes(1)
    })
})
