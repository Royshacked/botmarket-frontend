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

// ─── A list per horizon (docs/design/horizon-chains.md §1; Roy, 2026-10-23) ───

/** Argus's pick for one column on a row — per column since 2026-10-23, the single `pick` before. Pure. */
export function pickFor(row, column) {
    if (row?.picks) return row.picks[column] ?? null
    return row?.pick?.column === column ? row.pick : null
}

/** How many of the day's names are graded on each column. Pure. */
export function horizonCounts(rows) {
    return Object.fromEntries(COLUMN_ORDER.map(c => [c, (rows ?? []).filter(r => r?.cells?.[c]?.grade).length]))
}

/**
 * One horizon's list: the names graded on `column` — Argus's picks for it first (his order), then the grade, then the
 * most room, then the symbol. Pure.
 */
export function horizonRows(rows, column) {
    const room = r => (r.cells[column].range?.open_sky ? 99 : (r.cells[column].range?.atr_mult ?? -1))
    const rank = r => pickFor(r, column)?.rank ?? 99
    return (rows ?? []).filter(r => r?.cells?.[column]?.grade)
        .sort((a, b) => rank(a) - rank(b) || (GRADE_RANK[b.cells[column].grade] - GRADE_RANK[a.cells[column].grade]) || room(b) - room(a)
            || String(a.symbol).localeCompare(String(b.symbol)))
}

/**
 * Prometheus's catalyst read per symbol (catalystRead.service): the live one, else the latest. Pure. `[]`/null → an
 * empty map. `day` — the list's session date: a SETTLED read (hit, expired, pass) shows only when it was made on that
 * day's board, or a read that expired ten days ago would sit on a name back for another reason, looking current
 * (code review 2026-10-24). An active read always shows.
 */
export function readsBySymbol(reads, day = null) {
    const by = new Map()
    for (const r of reads ?? []) {
        if (day && r.status !== 'active' && r.context?.day !== day) continue
        const cur = by.get(r.symbol)
        if (!cur || (r.status === 'active' && cur.status !== 'active') || (cur.status !== 'active' && String(r.set_at) > String(cur.set_at))) by.set(r.symbol, r)
    }
    return by
}

/** A target's band is shown only with BOTH ends — a run-up line can carry one quartile without the other. Pure. */
export const hasBand = (t) => Number.isFinite(t?.low) && Number.isFinite(t?.high)

/** Why a read has no target, in words (catalystRead.service `pass_reason`). */
export const PASS_WHY = Object.freeze({
    report_too_close: 'read after the last session before its report',
    nothing_open: 'nothing left open',
    unsized: 'not sized',
    contradicted: 'the record cuts against it',
    unclear: 'too thin to tell',
})

/** A read's target as the list's short cell: "105.00 · +5% open", "hit", "pass", or null. Pure. */
export function readCell(read) {
    if (!read) return null
    if (read.status === 'pass') return { text: 'pass', title: `Prometheus: ${read.verdict} — no target${PASS_WHY[read.pass_reason] ? ` (${PASS_WHY[read.pass_reason]})` : ''}` }
    const t = read.target
    if (!t) return null
    const open = Number.isFinite(t.open_pct) ? `${t.open_pct > 0 ? '+' : ''}${t.open_pct.toFixed(0)}% open` : null
    const state = read.status === 'hit' ? 'hit' : read.status === 'expired' ? 'expired' : null
    return {
        text: [t.value.toFixed(2), state ?? open].filter(Boolean).join(' · '),
        title: `Prometheus's catalyst target ${t.value.toFixed(2)}${hasBand(t) ? ` (band ${t.low.toFixed(2)}–${t.high.toFixed(2)})` : ''}, valid until ${String(read.valid_until).slice(0, 10)} — ${read.verdict}`,
        state,
    }
}

// ─── The day's watchlist (Roy, 2026-10-22) ────────────────────────────────────

/** The board's columns in order — what a day-list row's merged cells are walked in. */
export const COLUMN_ORDER = Object.freeze(['open', 'mid', 'eod', 'tomorrow', 'week'])
const CHECKPOINT_ORDER = ['premarket', 'preopen', 'mid', 'eod', 'close']

/** In play now · building · setting up — the backend's `status` (hotlist.columns rowStatus), best first. */
export const STATUS_LABEL = Object.freeze({ in_play: 'In play', building: 'Building', setting_up: 'Setting up' })
export const STATUS_TITLE = Object.freeze({
    in_play:    'In play now — moving on the tape or on a fresh story',
    building:   'Building — money arriving: 5-day volume well above its 50-day pace, on a rising week',
    setting_up: 'Setting up — quiet today, with a known date ahead (a run-up: out before the report)',
})

/**
 * The row's status. Rows from before the field existed: a graded session column is in play, a week
 * cell with a material story too, the rest is setting up.
 */
export function rowStatus(row) {
    if (row?.status && STATUS_LABEL[row.status]) return row.status
    const graded = Object.entries(row?.cells ?? {}).filter(([, c]) => c?.grade)
    if (!graded.length) return null
    if (graded.some(([c]) => c !== 'week') || row.catalyst?.material) return 'in_play'
    return 'setting_up'
}

/** Why the name is on the list, in plain words: the best column's own reason, or null. */
export function rowReason(row) {
    const col = bestColumn(row, COLUMN_ORDER)
    const why = col ? row.cells[col]?.why : null
    return Array.isArray(why) && why.length ? why.join('; ') : null
}

/** The sortable columns of the watchlist, each with the direction it sorts in first. */
export const LIST_SORTS = Object.freeze({
    status: 'asc', symbol: 'asc', price: 'desc', chg: 'desc', vol: 'desc', atr: 'desc', grade: 'desc', earnings: 'asc', found: 'asc',
})

// The grade a row sorts on: THIS column's on a horizon's list (what the cell shows), else its best column's.
const _grade = (row, column = null) => {
    const col = column && row.cells?.[column]?.grade ? column : bestColumn(row, COLUMN_ORDER)
    if (!col) return -1
    const c = row.cells[col]
    return GRADE_RANK[c.grade] * 1000 + (c.range?.open_sky ? 99 : (c.range?.atr_mult ?? 0))
}
const SORT_KEY = {
    status:   (r) => { const i = Object.keys(STATUS_LABEL).indexOf(rowStatus(r)); return i < 0 ? 9 : i },
    symbol:   (r) => r.symbol ?? '',
    price:    (r) => r.price,
    chg:      (r) => r.gap_pct,
    vol:      (r) => (Number.isFinite(r.rvol) ? r.rvol : null),
    atr:      (r) => r.atr_pct,
    grade:    _grade,
    earnings: (r) => r.next_earnings ?? null,
    found:    (r) => { const i = CHECKPOINT_ORDER.indexOf(r.first_seen); return i < 0 ? null : i },
}

/**
 * The watchlist sorted by one column. Missing values sort LAST in either direction (a name with no
 * earnings date is not "the soonest"); ties keep Argus's picks first, then the symbol. Pure — a new array. `column`: a
 * horizon's list — the grade and the tie-break's pick are THAT column's (code review 2026-10-24).
 */
export function sortList(rows, key, dir, column = null) {
    const get = key === 'grade' ? (r) => _grade(r, column) : SORT_KEY[key] ?? SORT_KEY.status
    const picked = (r) => (column ? pickFor(r, column) : r.pick) ? 0 : 1
    const sign = (dir ?? LIST_SORTS[key] ?? 'asc') === 'desc' ? -1 : 1
    const known = (v) => v != null && v !== '' && !(typeof v === 'number' && !Number.isFinite(v))
    return [...(rows ?? [])].sort((a, b) => {
        const va = get(a), vb = get(b)
        if (known(va) !== known(vb)) return known(va) ? -1 : 1
        if (known(va) && va !== vb) return (va < vb ? -1 : 1) * sign
        return picked(a) - picked(b) || String(a.symbol).localeCompare(String(b.symbol))
    })
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

/**
 * The row's earnings chip, or null. A week cell holding the report inside its window carries
 * `exit_before` (Roy, 2026-10-22): the trade is a run-up INTO the report, and the chip says to be out
 * before it instead of only showing the date.
 */
export function earningsChip(row) {
    if (!row?.next_earnings) return null
    const exit = Object.values(row.cells ?? {}).some(c => c?.grade && c.exit_before)
    const date = row.next_earnings.slice(5)
    return exit
        ? { text: `E ${date} · out before`, title: `Earnings ${row.next_earnings} — a run-up into the report: be out before it`, exit: true }
        : { text: `E ${date}`, title: 'Next earnings', exit: false }
}

/** The read Mentor's opening sentence carries for a row: Argus's pick note, else the board's own why. */
export function handoffRead(row, column) {
    if (row?.pick?.why) return row.pick.why
    const why = row?.cells?.[column]?.why
    return Array.isArray(why) && why.length ? why.join('; ') : null
}

/**
 * A row's sparkline (Roy, 2026-10-22): the last daily closes as a line, today's price as a dot at the
 * right edge, and the level the row's best grade measures its free range to as a dashed line — all on
 * one scale, so a gap shows as a jump and the room overhead as the gap to the dash. Pure; null when
 * there are too few closes to draw. → `{ line, dot, levelY, up, changePct }` in a w × h box.
 */
export function sparkGeometry(closes, { price = null, level = null, w = 90, h = 28, pad = 3 } = {}) {
    const pts = (Array.isArray(closes) ? closes : []).filter(Number.isFinite)
    if (pts.length < 2) return null
    const now = Number.isFinite(price) ? price : pts.at(-1)
    const all = [...pts, now, ...(Number.isFinite(level) ? [level] : [])]
    const lo = Math.min(...all), hi = Math.max(...all)
    const span = hi - lo || 1
    const y = (v) => +(h - pad - ((v - lo) / span) * (h - 2 * pad)).toFixed(1)
    // The closes fill the box up to a small gap; the dot (today) sits at the right edge.
    const right = w - pad - 4
    const x = (i) => +(pad + (i / (pts.length - 1)) * (right - pad)).toFixed(1)
    return {
        line:      pts.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' '),
        dot:       { x: w - pad, y: y(now) },
        levelY:    Number.isFinite(level) ? y(level) : null,
        up:        now >= pts[0],
        changePct: +(((now - pts[0]) / pts[0]) * 100).toFixed(1),
    }
}
