import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { threadsService } from '../../services/threads/threads.service.remote.js'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import './ThreadHistory.scss'

// ── Unfinished-draft resume drawer ──────────────────────────────────────────────
// A hamburger toggle that opens a right-side drawer of the agent's DRAFT threads
// (unfinished conversations that crossed the substantive floor but never generated an
// artifact). Picking one resumes it; drafts can be pinned (kept from TTL expiry) or
// discarded. Linked threads are omitted — those are reachable through their generated
// idea/portfolio/scan via the normal update/edit flow.

function timeAgo(ts) {
    if (!ts) return ''
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 60) return 'just now'
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}

export function ThreadHistory({ agent, onResume }) {
    const [open,    setOpen]    = useState(false)
    const [closing, setClosing] = useState(false)
    const [drafts,  setDrafts]  = useState([])
    const [loading, setLoading] = useState(false)
    const meta = AGENTS[agent] || {}

    const load = useCallback(async () => {
        setLoading(true)
        const all = await threadsService.listThreads(agent)
        setDrafts(all.filter(t => t.tier === 'draft'))
        setLoading(false)
    }, [agent])

    // Load once for the badge count, and refresh each time the drawer opens.
    useEffect(() => { load() }, [load])
    useEffect(() => { if (open) load() }, [open, load])

    // Lock body scroll while the drawer is open.
    useEffect(() => {
        if (!open) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [open])

    async function handleDiscard(e, id) {
        e.stopPropagation()
        setDrafts(prev => prev.filter(t => t.threadId !== id))
        await threadsService.discardThread(id)
    }
    async function handlePin(e, id) {
        e.stopPropagation()
        await threadsService.pinThread(id)
        load()
    }
    function openDrawer() { setClosing(false); setOpen(true) }
    function requestClose() { setClosing(true) }
    // Unmount only after the slide-out finishes; ignore the enter animation's end event.
    function onExitEnd() { if (closing) { setOpen(false); setClosing(false) } }

    async function handleResume(id) {
        requestClose()
        await onResume?.(id)
    }

    return (
        <div className="thread-history">
            <button
                type="button"
                className="thread-history__toggle"
                onClick={openDrawer}
                title="Open chats"
                aria-label="Chats"
            >
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {/* two overlapping conversation bubbles */}
                    <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
                    <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
                </svg>
                {drafts.length > 0 && <span className="thread-history__badge">{drafts.length}</span>}
            </button>

            {open && createPortal(
                <div className="thread-drawer">
                    <div className={`thread-drawer__backdrop${closing ? ' is-closing' : ''}`} onClick={requestClose} />
                    <aside className={`thread-drawer__panel${closing ? ' is-closing' : ''}`} onAnimationEnd={onExitEnd} role="dialog" aria-label="Unfinished drafts">
                        <header className="thread-drawer__head">
                            <span className="thread-drawer__title">
                                {meta.icon && (
                                    <span className="thread-drawer__title-icon">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                            {meta.icon}
                                        </svg>
                                    </span>
                                )}
                                <span className="thread-drawer__title-brand">{meta.brand || 'Chats'}</span>
                                <span className="thread-drawer__title-sub">chats</span>
                            </span>
                            <button type="button" className="thread-drawer__close" onClick={requestClose} aria-label="Close">✕</button>
                        </header>
                        <div className="thread-drawer__body">
                            {loading && <div className="thread-drawer__empty">Loading…</div>}
                            {!loading && drafts.length === 0 && (
                                <div className="thread-drawer__empty">No conversations yet. Chats are saved here automatically once they take shape.</div>
                            )}
                            {!loading && drafts.map(t => (
                                <div key={t.threadId} className="thread-drawer__row" onClick={() => handleResume(t.threadId)} role="button" tabIndex={0}>
                                    <div className="thread-drawer__row-main">
                                        <span className="thread-drawer__row-title">{t.title || 'Untitled'}</span>
                                        <span className="thread-drawer__row-meta">{timeAgo(t.updatedAt)}</span>
                                    </div>
                                    <div className="thread-drawer__row-acts">
                                        <button type="button" className="thread-drawer__act" onClick={e => handlePin(e, t.threadId)} title="Keep (don't auto-expire)">📌</button>
                                        <button type="button" className="thread-drawer__act" onClick={e => handleDiscard(e, t.threadId)} title="Discard chat">✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>,
                document.body
            )}
        </div>
    )
}

ThreadHistory.propTypes = {
    agent:    PropTypes.string.isRequired,
    onResume: PropTypes.func,
}
