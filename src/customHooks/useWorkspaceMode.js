import { useState, useCallback } from 'react'
import { paperService } from '../services/paper/paper.service.remote.js'
import { workspaceService } from '../services/workspace/workspace.service.remote.js'
import { useAutoRefresh } from './useAutoRefresh.js'
import { useWindowEvent } from './useWindowEvent.js'

/**
 * The current WORKSPACE view — 'live' | 'paper' | 'manual'. Generalizes the old two-way
 * paper/live split into three sibling workspaces (see ideaWorkspace in tradeIdea.utils).
 * It scopes what the ideas list / monitor / order-confirm show; it is a VIEW switch, not
 * a router — the account bound to an idea is what actually routes it.
 *
 * Source of truth per mode:
 *   - paper/live ride the backend paper `enabled` flag (paper ON ⇔ 'paper' workspace), so
 *     this stays perfectly in sync with the existing profile toggle + PAPER badge.
 *   - manual has no broker connection to derive itself from (it is broker-LESS by definition), so
 *     selecting it turns paper OFF and remembers the choice. localStorage stays the client's
 *     synchronous source of truth — resolveWorkspace below is called from the account/position
 *     hooks, which cannot await — and the choice is ALSO written to the server.
 *
 * WHY THE SERVER NEEDS TO KNOW. It used to be told nothing, so it derived the workspace from the
 * paper flag alone and read a user sitting in MANUAL as sitting in LIVE. That is now wrong in a way
 * that reaches the user: every desk is handed the current workspace each turn, and a desk that
 * thinks manual is live will describe orders being placed that the app cannot place at all. The
 * write is best-effort — if it fails the view still switches and the server falls back to its old
 * paper-or-live answer, which is where it was before.
 *
 * Switching dispatches 'paper-mode-changed' (re-syncs accounts/positions/badge exactly as
 * the profile toggle does) plus 'workspace-mode-changed' (so sibling instances of this
 * hook converge).
 *
 * @param {string} [userId]  only fetch when logged in — an authed call while logged out
 *                           would trip the httpService 401 redirect.
 * @returns {{ workspace: 'live'|'paper'|'manual', cycleWorkspace: () => void, setWorkspace: (w: string) => void }}
 */
const KEY   = 'ar2trade:workspace'
const ORDER = ['live', 'paper', 'manual']

const readStored  = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const writeStored = (w) => { try { localStorage.setItem(KEY, w) } catch { /* private mode */ } }

/**
 * Derive the active workspace from the paper-connected flag (listConnections.paper === the
 * paper `enabled` toggle) plus the locally remembered choice — the same reconcile the hook
 * does. Pure, for the account/position hooks that already hold listConnections and must
 * isolate accounts/positions by workspace (paper ON wins, else remembered 'manual', else 'live').
 * @param {boolean} paperConnected
 * @returns {'live'|'paper'|'manual'}
 */
export function resolveWorkspace(paperConnected) {
    if (paperConnected) return 'paper'
    return readStored() === 'manual' ? 'manual' : 'live'
}

export function useWorkspaceMode(userId) {
    const [workspace, setWs] = useState(() => readStored() || 'live')

    // Reconcile with the backend paper flag. Paper ON always wins (matches the profile
    // toggle + badge); otherwise honor a remembered 'manual'; else 'live'. Idempotent, so
    // the periodic refocus refresh + the 'paper-mode-changed' listener can both call it.
    const refresh = useCallback(async () => {
        if (!userId) { setWs('live'); return }
        let stored = readStored()
        try {
            // Adopt the server's remembered choice when this browser has none — a second device, or
            // cleared storage, should land the user back in the workspace they were working in
            // rather than silently in live.
            if (!stored) {
                const { stored: remote } = await workspaceService.get()
                if (remote) { stored = remote; writeStored(remote) }
            }
        } catch { /* no remote choice available — the local one still decides below */ }
        try {
            const st = await paperService.getState()
            if (st?.enabled)            setWs('paper')
            else if (stored === 'manual') setWs('manual')
            else                          setWs('live')
        } catch {
            setWs(stored || 'live')   // paper API down — trust the last local choice
        }
    }, [userId])

    useAutoRefresh(refresh)
    useWindowEvent('paper-mode-changed',     refresh)
    useWindowEvent('workspace-mode-changed', () => setWs(readStored() || 'live'))

    // User action: switch workspace. Persist locally, drive the paper flag (ON only for
    // the paper workspace), then broadcast once the flag write has landed so listeners
    // read the settled state.
    const setWorkspace = useCallback(async (next) => {
        if (!ORDER.includes(next)) return
        writeStored(next)
        setWs(next)
        // Both writes are best-effort and independent: the paper flag is what live-vs-paper is
        // derived from, the stored choice is what separates manual from live. Losing either leaves
        // the server on its previous answer, never on a wrong one.
        try { await paperService.setMode(next === 'paper') } catch { /* view still switches */ }
        try { await workspaceService.set(next) } catch { /* the desks fall back to paper-or-live */ }
        window.dispatchEvent(new CustomEvent('paper-mode-changed'))
        window.dispatchEvent(new CustomEvent('workspace-mode-changed'))
    }, [])

    const cycleWorkspace = useCallback(() => {
        setWorkspace(ORDER[(ORDER.indexOf(readStored() || workspace) + 1) % ORDER.length])
    }, [workspace, setWorkspace])

    return { workspace, cycleWorkspace, setWorkspace }
}
