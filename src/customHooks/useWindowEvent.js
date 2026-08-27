import { useEffect } from 'react'

/**
 * Subscribe to a window event for the lifetime of the component. `handler` must
 * be stable (useCallback) so it isn't re-bound every render. Replaces the
 * identical addEventListener/removeEventListener effects in useBrokerAccounts,
 * usePaperMode, and useTextPace.
 *
 * @param {string} event
 * @param {(e: Event) => void} handler
 */
export function useWindowEvent(event, handler) {
    useEffect(() => {
        window.addEventListener(event, handler)
        return () => window.removeEventListener(event, handler)
    }, [event, handler])
}
