import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote'

// THE HOTLIST BADGE (backend docs/design/proteus.md §8.2, step 5, 2026-11-13): what each name obeys, in a word or two —
// "50 MA", "sweeps lows", "nothing" — on the timeframes its row's horizon trades on, from the technical analyst's stored
// measured profile. Clicking it opens his read in the chat.
//
// One provider at the Hotlist panel holds the badges and the opener. A badge asks for its own name when it mounts; the
// asks made in one tick are batched into ONE request per horizon — so a view only says WHERE the mark goes, and a list of
// 80 rows is one call, not 80. Outside a provider (a test, a pop-out) nothing is asked and nothing shows.

const NO_PROVIDER = { badges: new Map(), request: null, onOpen: null }
const BehaviourContext = createContext(NO_PROVIDER)

const norm = (s) => String(s ?? '').trim().toUpperCase()
const keyOf = (horizon, symbol) => `${horizon ?? ''}:${norm(symbol)}`

export function BehaviourProvider({ onOpen = null, children, _fetch = hotlistService.getBehaviour }) {
    const [badges, setBadges] = useState(() => new Map())
    const asked = useRef(new Set())        // horizon:symbol already asked this mount — a re-render never refetches
    const pending = useRef(new Map())      // horizon → Set of symbols waiting for this tick's flush
    const timer = useRef(null)
    const flush = useCallback(() => {
        timer.current = null
        const batches = [...pending.current.entries()]
        pending.current = new Map()
        if (typeof _fetch !== 'function') return   // a host (or a test's mock service) with no badge source: no badges
        for (const [horizon, set] of batches) {
            const want = [...set]
            Promise.resolve().then(() => _fetch(want, horizon)).then((got) => {
                setBadges(prev => {
                    const next = new Map(prev)
                    for (const s of want) next.set(keyOf(horizon, s), got?.[s] ?? null)
                    return next
                })
            }).catch(() => {})
        }
    }, [_fetch])
    const request = useCallback((symbol, horizon) => {
        const sym = norm(symbol), k = keyOf(horizon, sym)
        if (!sym || asked.current.has(k)) return
        asked.current.add(k)
        if (!pending.current.has(horizon)) pending.current.set(horizon, new Set())
        pending.current.get(horizon).add(sym)
        if (!timer.current) timer.current = setTimeout(flush, 0)
    }, [flush])
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
    const value = useMemo(() => ({ badges, request, onOpen }), [badges, request, onOpen])
    return <BehaviourContext.Provider value={value}>{children}</BehaviourContext.Provider>
}
BehaviourProvider.propTypes = { onOpen: PropTypes.func, children: PropTypes.node, _fetch: PropTypes.func }

/** The mark beside a ticker — nothing while unknown or not profiled yet (the server queues those for next time). */
export function BehaviourBadge({ symbol, horizon }) {
    const { badges, request, onOpen } = useContext(BehaviourContext)
    useEffect(() => { request?.(symbol, horizon) }, [symbol, horizon, request])
    const b = badges.get(keyOf(horizon, symbol))
    if (!b?.badge) return null
    // holds (a line it respects — the rare, strong signal) · trait (what it does when nothing holds: 'fakes 74%') · nothing
    const kind = b.kind ?? (b.badge === 'nothing' ? 'nothing' : 'holds')
    const cls = `behaviour-badge behaviour-badge--${kind}`
    const label = `How it trades: ${b.badge}`
    return onOpen
        ? <button type="button" className={cls} title={b.tip} aria-label={label} onClick={(e) => { e.stopPropagation(); onOpen(norm(symbol)) }}>{b.badge}</button>
        : <span className={cls} title={b.tip} aria-label={label}>{b.badge}</span>
}
BehaviourBadge.propTypes = { symbol: PropTypes.string, horizon: PropTypes.string }
