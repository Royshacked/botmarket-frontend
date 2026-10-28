import { createContext, useContext } from 'react'
import PropTypes from 'prop-types'
import { OWNED_LABEL, ownedParts, ownedTitle } from '../../services/ownedSymbols.js'
import './OwnedBadge.scss'

// THE MARK on a ticker that is already the user's — a position, a setup, a portfolio holding (Roy, 2026-10-28). One
// context, filled once by MainPage (services/ownedSymbols), read by every list: the lists only say WHERE the mark goes.
// Outside the provider (a test, a pop-out) the map is empty and nothing is marked.

const OwnedSymbolsContext = createContext(new Map())

export function OwnedSymbolsProvider({ value, children }) {
    return <OwnedSymbolsContext.Provider value={value}>{children}</OwnedSymbolsContext.Provider>
}
OwnedSymbolsProvider.propTypes = { value: PropTypes.instanceOf(Map).isRequired, children: PropTypes.node }

/**
 * The words beside a ticker — "position", "setup", "portfolio" — or nothing. `except`: the kind(s) a list of the user's
 * own leaves out (Your trades does not mark every row "setup").
 */
export function OwnedBadge({ symbol, except = [] }) {
    const entry = useContext(OwnedSymbolsContext).get(String(symbol ?? '').trim().toUpperCase())
    const parts = ownedParts(entry, except)
    if (!parts.length) return null
    const title = ownedTitle(entry, parts)
    return (
        <span className="owned-badge" title={`Yours: ${title}`} aria-label={`Yours: ${title}`}>
            {parts.map(k => <span key={k} className={`owned-badge__part owned-badge__part--${k}`}>{OWNED_LABEL[k]}</span>)}
        </span>
    )
}
OwnedBadge.propTypes = { symbol: PropTypes.string, except: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]) }
