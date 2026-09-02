import { useState, useCallback } from 'react'

/**
 * Collapse/expand state for a set of ids (portfolio groups, etc.). Starts with
 * everything collapsed; `toggle(id)` flips one id. Shared by the position and
 * portfolio group renderers so the identical Set-toggle idiom lives in one place.
 *
 * @returns {{ isExpanded: (id: string) => boolean, toggle: (id: string) => void }}
 */
export function useExpandedSet() {
    const [expanded, setExpanded] = useState(() => new Set())
    const toggle = useCallback(id => setExpanded(prev => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
    }), [])
    const isExpanded = useCallback(id => expanded.has(id), [expanded])
    return { isExpanded, toggle }
}
