// BOTTOM LINES (Roy, 2026-11-21: "in the Hotlist, when I click a row I get very long stories — I want bottom lines and a
// chat button if the user wants to chat about it and get the full info"). A row's page says each thing in ONE line; the
// whole story is Axl's, in the chat. Pure.

const MAX = 180

/**
 * The first sentence of a text, at most `max` characters (cut at a word, with an ellipsis). Null for nothing.
 * A sentence ends at . ! or ? followed by a space and a capital or a digit — so "$9.50" and "e.g. this" do not end one.
 */
export function bottomLine(text, max = MAX) {
    const s = String(text ?? '').replace(/\s+/g, ' ').trim()
    if (!s) return null
    const END = /[.!?](?=\s+[A-Z0-9"“(])/
    const end = s.search(END)
    let first = end >= 0 ? s.slice(0, end + 1) : s
    // A verdict word as its own sentence ("Now. The stock is…") says nothing the tile does not: carry on into the next.
    if (end >= 0 && first.split(' ').length <= 2) {
        const rest = s.slice(end + 1).trimStart()
        const next = rest.search(END)
        first = `${first} ${next >= 0 ? rest.slice(0, next + 1) : rest}`
    }
    if (first.length <= max) return first
    const cut = first.slice(0, max - 1)
    const at = cut.lastIndexOf(' ')
    return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:—–-]\s*$/, '')}…`
}

/** The next dated catalyst from today on, as one line ("Dec 14 — Expected earnings report…"). Null when none. */
export function nextCatalyst(catalysts, today = new Date().toISOString().slice(0, 10)) {
    const list = (Array.isArray(catalysts) ? catalysts : [])
        .map(k => (typeof k === 'string' ? { date: null, note: k } : { date: k?.date ?? null, note: k?.note ?? '' }))
        .filter(k => k.note)
    const dated = list.filter(k => /^\d{4}-\d{2}-\d{2}/.test(String(k.date ?? '')) && String(k.date) >= today)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    const k = dated[0] ?? null
    if (!k) return null
    const when = new Date(`${String(k.date).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    return `${when} — ${bottomLine(k.note, 120)}`
}

/** The first kill criterion, as the thesis's risk in one line. */
export function firstRisk(kills) {
    const k = (Array.isArray(kills) ? kills : [])[0]
    return k ? bottomLine(typeof k === 'string' ? k : k?.text ?? k?.note ?? JSON.stringify(k), 160) : null
}
