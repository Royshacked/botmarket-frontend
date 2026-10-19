import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { sessionService } from '../../services/session/session.service.remote'
import { apiError } from '../../services/http.service'
import { TimelineRow, SpeakerTag } from './TimelineRow.jsx'
import { startsRun, isEndedLine } from './timelineRows.js'
import { DeleteConfirmDialog } from '../DeleteConfirmDialog.jsx'
import { ChatInputRow } from '../ChatInputRow.jsx'

const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/**
 * The past sessions (plan phase 7, 7d — replaces the per-desk ThreadHistory for the main chat): a list of
 * archived sessions, each opening with its rows as they were — no taps, no card buttons. The live session is the
 * one in the chat; it is not listed here. An open one has the input under it: writing there PICKS IT BACK UP
 * (design §3.5 "…or resumes it"; Roy, 2026-10-19 — it opened with no prompt box) — it becomes the live session,
 * the live one goes to History, and the message is its next turn.
 */
export function SessionHistory({ scope = 'main', onClose, onResume = null, busy = false, api = sessionService }) {
    const [sessions, setSessions] = useState(null)
    const [open, setOpen]         = useState(null)    // { session, rows }
    const [error, setError]       = useState(null)
    const [draft, setDraft]       = useState('')
    const [resuming, setResuming] = useState(false)

    async function resume() {
        const text = draft.trim()
        if (!text || !open || !onResume || resuming || busy) return
        setResuming(true)
        setError(null)
        const err = await onResume(open.session.sessionId, text)
        setResuming(false)
        if (err) { setError(err); return }
        onCloseRef.current()
    }
    const closeRef   = useRef(null)
    // Read through a ref: the parent re-renders on every streamed token, and a new onClose each time must not
    // re-run the focus below and steal focus back to the close button.
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose

    // The delete ask (the shared DeleteConfirmDialog): the session it is about, and whether the delete is in flight.
    const [asking, setAsking]     = useState(null)
    const [deleting, setDeleting] = useState(false)
    const askingRef = useRef(null)
    askingRef.current = asking

    // A dialog: focus lands on it once, and Escape closes it — the delete ask first, when it is up (one Esc, one layer).
    useEffect(() => {
        closeRef.current?.focus()
        // Captured and claimed, so the drawers under it (DrawerShell: the side pane, the detail panel) let this Esc be
        // — one Esc closes one layer.
        const onKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return
            e.preventDefault()
            if (askingRef.current) setAsking(null)
            else onCloseRef.current()
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
    }, [])

    useEffect(() => {
        let live = true
        api.list(scope)
            .then(list => { if (live) setSessions((list ?? []).filter(s => s.status === 'archived')) })
            .catch(err => { if (live) setError(apiError(err, 'Could not load past sessions')) })
        return () => { live = false }
    }, [api, scope])

    async function show(session) {
        setError(null)
        // Without the opening "✓ … back with Axl" line: it was for the moment the session began, not its record.
        try { setOpen({ session, rows: ((await api.messages(session.sessionId)) ?? []).filter(r => !isEndedLine(r)) }) }
        catch (err) { setError(apiError(err, 'Could not open that session')) }
    }

    /** Delete a past session (Roy, 2026-10-18) — asked first, in the app's delete dialog; gone for good, its work is not. */
    async function remove() {
        const session = asking
        if (!session) return
        setDeleting(true)
        setError(null)
        try {
            await api.remove(session.sessionId)
            setSessions(list => (list ?? []).filter(s => s.sessionId !== session.sessionId))
            setOpen(o => (o?.session.sessionId === session.sessionId ? null : o))
        } catch (err) { setError(apiError(err, 'Could not delete that session')) }
        finally { setDeleting(false); setAsking(null) }
    }

    return (
        <div className="chat-timeline__history" role="dialog" aria-modal="true" aria-label="Past sessions">
            <div className="chat-timeline__history-head">
                {open
                    ? <button type="button" className="chat-timeline__history-back" onClick={() => { setOpen(null); setDraft('') }}>← All sessions</button>
                    : <span className="chat-timeline__history-title">Past sessions</span>}
                {open && <button type="button" className="chat-timeline__history-delete" onClick={() => setAsking(open.session)}>Delete</button>}
                <button type="button" className="chat-timeline__history-close" onClick={onClose} aria-label="Close" ref={closeRef}>×</button>
            </div>
            {error && <p className="chat-timeline__note chat-timeline__note--error">{error}</p>}
            {open ? (
                <>
                    <div className="chat-timeline__history-thread">
                        {open.rows.map((row, i) => (
                            <div key={row.seq} className={`chat-timeline__row chat-timeline__row--${row.role}`}>
                                {startsRun(row, open.rows[i - 1]) && <SpeakerTag agent={row.agent} />}
                                <TimelineRow row={row} readOnly onChoose={async () => null} />
                            </div>
                        ))}
                    </div>
                    {onResume && (
                        <div className="chat-timeline__history-resume">
                            <p className="chat-timeline__note">
                                {busy ? 'Wait for the reply in your current chat to finish, then you can pick this one up.'
                                    : 'Write here to pick this session back up — your current chat moves to History.'}
                            </p>
                            <ChatInputRow
                                prefix="axl"
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); resume() } }}
                                placeholder="Continue this session…"
                                onSend={resume}
                                sendDisabled={!draft.trim() || resuming || busy}
                                micDisabled
                                textareaDisabled={resuming}
                            />
                        </div>
                    )}
                </>
            ) : sessions === null ? (
                <p className="chat-timeline__note">Loading…</p>
            ) : sessions.length === 0 ? (
                <p className="chat-timeline__note">No past sessions yet. “New session” files the current chat here.</p>
            ) : (
                <ul className="chat-timeline__history-list">
                    {sessions.map(s => (
                        <li key={s.sessionId} className="chat-timeline__history-row">
                            <button type="button" className="chat-timeline__history-item" onClick={() => show(s)}>
                                <span className="chat-timeline__history-name">{s.title || 'Untitled session'}</span>
                                <span className="chat-timeline__history-date">{fmtDate(s.archivedAt ?? s.updatedAt)}</span>
                            </button>
                            <button type="button" className="chat-timeline__history-delete" onClick={() => setAsking(s)} aria-label={`Delete ${s.title || 'session'}`} title="Delete this session">✕</button>
                        </li>
                    ))}
                </ul>
            )}
            {asking && (
                <DeleteConfirmDialog
                    title="Delete session"
                    subject={asking.title || 'Untitled session'}
                    deleting={deleting}
                    confirmLabel="Delete session"
                    onConfirm={remove}
                    onCancel={() => { if (!deleting) setAsking(null) }}
                    lead="The conversation is deleted for good. Anything it saved — a setup, a book, a list, coverage — stays where it is."
                />
            )}
        </div>
    )
}

SessionHistory.propTypes = {
    scope:    PropTypes.string,
    onClose:  PropTypes.func.isRequired,
    // (sessionId, text) → an error to show, or null. Absent → read-only.
    onResume: PropTypes.func,
    busy:     PropTypes.bool,
    api:      PropTypes.object,
}
