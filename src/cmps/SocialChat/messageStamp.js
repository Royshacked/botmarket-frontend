// The per-message stamp shown under every bubble.
//
// Date AND time, always. A feed of bare clock times reads as "today" whatever its age, and these
// threads are notification history you scroll back through — "13:44" on a card from three weeks
// ago is actively misleading. Today's messages say so in words rather than repeating the date on
// every line of the conversation you're actually having.
//
// Its own module (like cardResolution.js): exporting a plain function from ChatWindow.jsx breaks
// React Fast Refresh for every importer of that file.
export function formatTime(ms) {
    if (!ms) return ''
    const d     = new Date(ms)
    const time  = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const today = new Date()
    const isSameDay = (a, b) => a.toDateString() === b.toDateString()
    if (isSameDay(d, today)) return `Today ${time}`

    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (isSameDay(d, yesterday)) return `Yesterday ${time}`

    // Drop the year for this year's messages — it's noise until it isn't.
    const date = d.toLocaleDateString([], d.getFullYear() === today.getFullYear()
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' })
    return `${date} ${time}`
}
