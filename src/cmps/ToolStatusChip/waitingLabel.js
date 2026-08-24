/**
 * The ONE label for a waiting turn, so the wait is never told twice.
 *
 * useChatStream.begin() appends the empty streaming bubble the moment you hit send, and onStatus
 * fires while that bubble is still wordless — so panels that drew a placeholder INSIDE the bubble
 * and the tool status BELOW it showed both at once ("thinking…" stacked over "fetching candles…").
 * The tool status is the more useful of the two, so it wins; the desk's own word is the fallback
 * while nothing more specific is known, and once tokens arrive there is nothing to say at all.
 *
 * Lives beside ToolStatusChip rather than inside it: a module that exports both a component and a
 * plain function loses fast refresh.
 *
 * @param {object[]} messages       the thread (a wordless streaming row = still waiting)
 * @param {string}   streamStatus   live tool status, '' between tools (onToken clears it)
 * @param {string}   [placeholder]  the desk's own waiting word
 * @returns {string} what to show, '' for nothing
 */
export function waitingLabel({ messages = [], streamStatus = '', placeholder = 'thinking…' }) {
    if (streamStatus) return streamStatus
    return messages.some(m => m.streaming && !m.content) ? placeholder : ''
}
