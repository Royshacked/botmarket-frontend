import { useState, useEffect } from 'react'

/**
 * Tracks the active design-trial id (see designService.js). applyDesign() writes it
 * to the `data-design` attribute on <html> ('current' = no attribute); this hook
 * mirrors that into React state and re-renders when it changes, so a component can
 * render a different tree per design (e.g. the Ideas tab as cards vs a table) without
 * a reload. Structural CSS can restyle surfaces for free, but only a live re-render
 * can swap the underlying DOM.
 *
 * @returns {string} the active design id — 'current' when no override is set.
 */
export function useDesign() {
    const [design, setDesign] = useState(() => document.documentElement.getAttribute('data-design') || 'current')

    useEffect(() => {
        const root = document.documentElement
        const obs = new MutationObserver(() => {
            setDesign(root.getAttribute('data-design') || 'current')
        })
        obs.observe(root, { attributes: true, attributeFilter: ['data-design'] })
        return () => obs.disconnect()
    }, [])

    return design
}
