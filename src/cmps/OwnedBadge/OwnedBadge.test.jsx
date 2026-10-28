import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { OwnedBadge, OwnedSymbolsProvider } from './OwnedBadge.jsx'
import { SymbolCell } from '../EntityCard/EntityCard.jsx'
import { ownedSymbols } from '../../services/ownedSymbols.js'

// The mark on a ticker that is already the user's (Roy, 2026-10-28).
const owned = ownedSymbols({ positions: [{ symbol: 'AAPL' }], setups: [{ asset: 'AAPL', status: 'looking' }, { asset: 'MSFT', status: 'looking' }] })
const wrap = (ui) => render(<OwnedSymbolsProvider value={owned}>{ui}</OwnedSymbolsProvider>)

describe('OwnedBadge', () => {
    afterEach(cleanup)

    it('marks a name the user holds or plans, in words, with its hover', () => {
        wrap(<OwnedBadge symbol="aapl" />)
        const b = screen.getByLabelText(/^Yours:/)
        expect(b.textContent).toBe('positionsetup')
        expect(b.title).toBe('Yours: an open position · in your setups')
    })

    it('leaves out the kind a list of the user\'s own already is — and says nothing for a name not theirs', () => {
        wrap(<><OwnedBadge symbol="MSFT" except="setup" /><OwnedBadge symbol="TSLA" /></>)
        expect(screen.queryByLabelText(/^Yours:/)).toBeNull()
    })

    it('outside the provider nothing is marked', () => {
        render(<OwnedBadge symbol="AAPL" />)
        expect(screen.queryByLabelText(/^Yours:/)).toBeNull()
    })

    it('the shared ticker cell carries it only when asked — beside the symbol, not inside its chart click', () => {
        wrap(<><SymbolCell symbol="AAPL" owned /><SymbolCell symbol="MSFT" /></>)
        expect(screen.getAllByLabelText(/^Yours:/)).toHaveLength(1)
        expect(screen.getByText('AAPL').contains(screen.getByLabelText(/^Yours:/))).toBe(false)
    })
})
