// The `?chat=<conversation>&msg=<message>` landing a notification tap opens the app on. PURE, so
// the parse is testable without the hook (useChatWs) that acts on it.

/**
 * @param {string} search  window.location.search
 * @returns {{ convId: string, msgId: string|null, search: string }|null}
 *   `search` is the query string with the landing removed (empty, or `?…` of what remains), for
 *   the address-bar rewrite that keeps a reload from re-opening the chat.
 */
export function readChatLanding(search) {
    const params = new URLSearchParams(search ?? '')
    const convId = params.get('chat')
    if (!convId) return null
    const msgId = params.get('msg') || null
    params.delete('chat'); params.delete('msg')
    const rest = params.toString()
    return { convId, msgId, search: rest ? `?${rest}` : '' }
}
