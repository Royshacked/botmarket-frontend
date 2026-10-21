// The Hotlist's words and numbers (docs/design/daily-names.md §5, §8). Pure — the panel renders what
// these return, and the tests read them without a DOM.

/** The board's columns, in the trader's words (the backend's hotlist.argus COLUMN_WORDS, shortened for a header). */
export const COLUMN_LABEL = Object.freeze({
    open: 'Open', mid: 'Mid-day', eod: 'Into close', tomorrow: 'Tomorrow', week: 'This week',
})
export const COLUMN_TITLE = Object.freeze({
    open:     'The session open — the first 30–60 minutes',
    mid:      'Mid-session',
    eod:      'Into the close',
    tomorrow: 'Tomorrow — held overnight into the next session',
    week:     'This week — 2 to 10 days (short-term swing)',
})
export const CHECKPOINT_LABEL = Object.freeze({
    premarket: '08:00 pre-market', preopen: '09:20 pre-open', mid: '10:30', eod: '14:30', close: '15:30',
})

const GRADE_RANK = { A: 3, B: 2, C: 1 }

/** A cell's free range as one short line: "2.1% · 0.45× ATR", "open sky", or null. */
export function fmtRange(range) {
    if (!range) return null
    if (range.open_sky) return 'open sky'
    const pct = Number.isFinite(range.pct) ? `${range.pct.toFixed(1)}%` : null
    const atr = Number.isFinite(range.atr_mult) ? `${range.atr_mult.toFixed(2)}× ATR` : null
    return [pct, atr].filter(Boolean).join(' · ') || null
}

/** The level a range is measured to, for the cell's title. */
export function rangeTitle(range) {
    if (!range) return null
    if (range.open_sky) return 'No level overhead — price is above every high this column counts'
    return Number.isFinite(range.level) ? `Room to ${range.level} — the nearest level overhead` : null
}

/**
 * The column a row is BEST graded on — the one "Build with Mentor" hands over. Argus's pick column
 * wins when there is one; else the highest grade, then the most room. Null when nothing is graded.
 */
export function bestColumn(row, columns) {
    if (row?.pick?.column && row.cells?.[row.pick.column]?.grade) return row.pick.column
    const graded = (columns ?? []).filter(c => row?.cells?.[c]?.grade)
    if (!graded.length) return null
    const room = c => (row.cells[c].range?.open_sky ? 99 : (row.cells[c].range?.atr_mult ?? -1))
    return graded.sort((a, b) => (GRADE_RANK[row.cells[b].grade] - GRADE_RANK[row.cells[a].grade]) || room(b) - room(a))[0]
}

/** The catalyst as a short chip: "drift · positive", "not material", or null without a label. */
export function catalystChip(catalyst) {
    if (!catalyst) return null
    return catalyst.material ? `${catalyst.type} · ${catalyst.surprise}` : 'not material'
}

const _sign = (n) => (n > 0 ? '+' : '')

/**
 * The question "Ask Argus" sends — the user's own turn, so it says plainly what the board says about
 * the name and asks for Argus's read.
 */
export function askArgusText(row, column) {
    const c = row?.cells?.[column]
    const bits = [
        c?.grade ? `${COLUMN_LABEL[column] ?? column} ${c.grade}` : null,
        Number.isFinite(row?.gap_pct) ? `${_sign(row.gap_pct)}${row.gap_pct.toFixed(1)}% gap` : null,
        Number.isFinite(row?.rvol) ? `${row.rvol}× volume` : null,
        c?.range ? `free range ${fmtRange(c.range)}` : null,
        row?.catalyst?.headline ? `news: "${row.catalyst.headline}"` : null,
    ].filter(Boolean)
    return `From today's hotlist: ${row.symbol}${bits.length ? ` — ${bits.join(', ')}` : ''}. What's your read — is this a trade, and what would make it wrong?`
}

/** The read Mentor's opening sentence carries for a row: Argus's pick note, else the board's own why. */
export function handoffRead(row, column) {
    if (row?.pick?.why) return row.pick.why
    const why = row?.cells?.[column]?.why
    return Array.isArray(why) && why.length ? why.join('; ') : null
}
