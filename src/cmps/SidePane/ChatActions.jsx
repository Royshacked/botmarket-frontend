import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { isHandheld } from '../EntityCard/entityPopup.js'
import { useSidePane } from './sidePane.store.js'

// A DESK'S BUTTONS UNDER THE CHAT, ON A PHONE (Roy, 2026-10-28: "the buttons of generate, update and so on — they
// should appear at the bottom of the chat box when enabled"; phone only). On a phone the work sheet stays down while the
// desk talks (sidePane.store `collapsed`), so the bar a surface draws at its bottom — Generate, Update, Arm, Later — is
// portalled to the slot above the chat's input instead, and the slot shows only what can be pressed (ChatActions.scss).
// The sheet up, or a desktop, the bar stays where the surface draws it. The slot is one element, set by the chat
// timeline; a module store like the pane's, since the surfaces and the timeline are far apart.

let slot = null
const subs = new Set()
const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn) }

/** The slot's ref callback (ChatActionSlot). */
function setChatActionSlot(el) {
    if (el === slot) return
    slot = el
    subs.forEach(fn => fn())
}

/** Wrap a desk surface's action bar: under the chat on a phone with the sheet down, else in place. */
export function ChatActions({ children }) {
    const { collapsed } = useSidePane()
    const el = useSyncExternalStore(subscribe, () => slot, () => slot)
    if (collapsed && el && isHandheld()) return createPortal(children, el)
    return children
}
ChatActions.propTypes = { children: PropTypes.node }

/** The slot itself — rendered once, above the chat's input. */
export function ChatActionSlot() {
    return <div className="chat-actions" ref={setChatActionSlot} aria-label="Desk actions" />
}
