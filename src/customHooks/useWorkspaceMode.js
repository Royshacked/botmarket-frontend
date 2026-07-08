import { useState, useCallback } from 'react'
import { paperService } from '../services/paper/paper.service.remote.js'
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
 *   - manual has no backend flag yet, so it's a local overlay (localStorage) — selecting
 *     it turns paper OFF (manual is broker-less, paper-off) and remembers the choice.
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
        const stored = readStored()
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
        try { await paperService.setMode(next === 'paper') } catch { /* view still switches */ }
        window.dispatchEvent(new CustomEvent('paper-mode-changed'))
        window.dispatchEvent(new CustomEvent('workspace-mode-changed'))
    }, [])

    const cycleWorkspace = useCallback(() => {
        setWorkspace(ORDER[(ORDER.indexOf(readStored() || workspace) + 1) % ORDER.length])
    }, [workspace, setWorkspace])

    return { workspace, cycleWorkspace, setWorkspace }
}
