// ── One channel from a pop-out back to the app ────────────────────────────────
//
// The entity pop-outs (idea / call / setup) are real browser windows, not modals. Everything they
// have needed until now either talks to the SERVER (arm, dismiss, accept a proposal, close a
// position) or ends the window (delete → window.close). Re-drawing is the first action that has to
// happen somewhere else entirely: the plan is rewritten in Mentor's chat, which lives in the main
// window, and a second app booted inside a 1180px pop-out is not that chat.
//
// So this is the missing direction — pop-out asks, main window acts. ONE bridge rather than a
// setup-shaped hack, because a call's "Edit call" and an idea's edit want exactly this the moment
// anyone wires them (openEntityPopup already registers all three kinds through one opener; this is
// its return path).
//
// HOW IT LANDS: the message is re-emitted on the app's own eventBus under the SAME event name the
// social-chat cards use. So a pop-out asking for a re-draw and a card asking for a re-draw arrive at
// one handler, already written, with one behaviour — there is no second doorway to keep in step.
//
// WHY AN ALLOW-LIST: `postMessage` is reachable by anything holding a handle to this window, so the
// origin check alone would leave the app's whole event vocabulary open to whatever is on the other
// end. Only the events a pop-out legitimately raises are forwarded, and the payload is passed as
// data to a handler that re-reads the entity by id from the server anyway (see MainPage's doorways),
// so a forged id answers 404 rather than opening someone else's setup.

import { eventBus, SETUP_INVALIDATION_EDIT } from './event-bus.service'

const CHANNEL = 'ar2trade:popup'

// Exactly what is wired today, not what might be. A call's pop-out accepts Hermes's re-map on the
// SERVER ("Accept edit"), so it needs nothing from here; adding a kind is one line when one does.
const FORWARDABLE = new Set([
    SETUP_INVALIDATION_EDIT,   // setup pop-out → re-draw it in Mentor
])

/**
 * Called FROM a pop-out. Hands the ask to the window that opened it and brings that window forward,
 * because the work continues there and a user left staring at the pop-out would think nothing
 * happened.
 *
 * @returns {boolean} false when there is no opener to ask — a pop-out reached by a pasted URL has
 *   no app behind it, and the caller renders no button rather than one that can only fail.
 */
export function askOpener(event, payload = {}) {
    const opener = window.opener
    if (!opener || opener.closed || !FORWARDABLE.has(event)) return false
    opener.postMessage({ channel: CHANNEL, event, payload }, window.location.origin)
    try { opener.focus() } catch { /* focus is a courtesy, not the mechanism */ }
    return true
}

/** Is there an app window listening? What the pop-outs gate their hand-off buttons on. */
export const hasOpener = () => !!window.opener && !window.opener.closed

/**
 * Called ONCE in the main window. Returns an unsubscribe, so it drops straight into a useEffect.
 */
export function listenForPopupEvents() {
    function onMessage(e) {
        // Same-origin only. `window.location.origin` rather than a constant: the app is served from
        // the backend in production and from the Vite proxy in dev, and a hard-coded origin would
        // silently make this work in exactly one of them.
        if (e.origin !== window.location.origin) return
        const { channel, event, payload } = e.data ?? {}
        if (channel !== CHANNEL || !FORWARDABLE.has(event)) return
        eventBus.emit(event, payload ?? {})
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
}
