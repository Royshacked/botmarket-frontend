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
    too_small: 'too little left open to trade',
    already_ran: 'it already ran its usual run-up this cycle',
    unsized: 'not sized',
    contradicted: 'the record cuts against it',
    unclear: 'too thin to tell',
})

/** When a read was made, in New York time — "Oct 23, 15:51 ET". Pure; '' without one. */
export function readTime(iso) {
    const ms = Date.parse(iso ?? '')
    if (!Number.isFinite(ms)) return ''
    return `${new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/New_York' })} ET`
}

/** A read's target as the list's short cell: "277.34 · +0.2% from 276.70", "hit", "pass", or null. Pure. */
export function readCell(read) {
    if (!read) return null
    if (read.status === 'pass') return { text: 'pass', title: `Prometheus: ${read.verdict} — no target${PASS_WHY[read.pass_reason] ? ` (${PASS_WHY[read.pass_reason]})` : ''}` }
    const t = read.target
    if (!t) return null
    // Measured from the READ'S OWN PRICE, not the row's Last: Last is the price at the checkpoint that listed the name,
    // often hours before the read — RCL's 08:00 quote of 283.45 sat over a 15:51 target of 277.34 set from 276.70,
    // and read as a hit that never happened (Roy, 2026-10-24).
    const from = Number.isFinite(t.spot) ? t.spot : Number.isFinite(read.price_at_read) ? read.price_at_read : null
    const open = Number.isFinite(t.open_pct) ? `${t.open_pct > 0 ? '+' : ''}${t.open_pct.toFixed(1)}%${from != null ? ` from ${from.toFixed(2)}` : ''}` : null
    const state = read.status === 'hit' ? 'hit' : read.status === 'expired' ? 'expired' : null
    return {
        text: [t.value.toFixed(2), state ?? open].filter(Boolean).join(' · '),
        title: `Prometheus's catalyst target ${t.value.toFixed(2)}${hasBand(t) ? ` (band ${t.low.toFixed(2)}–${t.high.toFixed(2)})` : ''}`
            + `${from != null ? `, set from ${from.toFixed(2)} at the read (${readTime(read.set_at)})` : ''}, valid until ${String(read.valid_until).slice(0, 10)} — ${read.verdict}`,
        state,
    }
}

// ─── Did it work? (Roy, 2026-10-24) ──────────────────────────────────────────────

const _sp = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—')
const _moves = (r) => `best ${_sp(r.mfe_pct)}, worst ${_sp(r.mae_pct)}, ended ${_sp(r.ret_pct)}`

/**
 * A cell's RESULT (botmarket-backend hotlist.service cellResult) as the list's short mark: `{ text, title, tone }` —
 * tone `good` / `bad` / `dim` — or null without one. Pure. Reached / missed the free-range level the grade measured
 * room to; an open-sky cell (no level) is up or down by the window's end; before that, open or scoring.
 */
export function resultCell(res) {
    if (!res) return null
    const partial = res.partial ? ' (partial window — some bars missing)' : ''
    const level = Number.isFinite(res.level) ? res.level.toFixed(2) : 'its level'
    switch (res.state) {
    case 'reached': return { text: '✓ reached', tone: 'good', title: `Reached ${level} — ${_moves(res)}${partial}` }
    case 'missed':  return { text: `✗ best ${_sp(res.mfe_pct)}`, tone: 'bad', title: `Did not reach ${level} — ${_moves(res)}${partial}` }
    case 'up':      return { text: `↑ ${_sp(res.ret_pct)}`, tone: 'good', title: `Open sky (no level to reach): ended up — ${_moves(res)}${partial}` }
    case 'down':    return { text: `↓ ${_sp(res.ret_pct)}`, tone: 'bad', title: `Open sky (no level to reach): ended down — ${_moves(res)}${partial}` }
    case 'open':    return { text: 'open', tone: 'dim', title: `The window runs until ${res.ends} — its result comes after it closes` }
    case 'scoring': return { text: 'scoring', tone: 'dim', title: 'The window has closed — scored after 18:00 ET' }
    case 'no_data': return { text: '—', tone: 'dim', title: 'No prices came for its window' }
    default:        return null
    }
}

/** A column's history must reach both to be "verified" (botmarket-backend hotlist.outcomes VERIFY_MIN_*). */
export const VERIFY_SESSIONS = 40
export const VERIFY_NAMES = 30

/**
 * One grade's track record on a column (hotlist.outcomes summarize), as a short phrase — "reached 62% of 34 · up 58%
 * of 40" — or null with no history. Pure. The hit rate counts only names with a level to reach (open sky has none);
 * the up rate counts every name.
 */
export function gradeRecord(summary, column, grade) {
    const g = summary?.[column]?.grades?.[grade]
    if (!g?.n) return null
    const hit = Number.isFinite(g.hit_rate) && g.judged ? `reached ${Math.round(g.hit_rate)}% of ${g.judged}` : null
    const up = Number.isFinite(g.up_rate) ? `up ${Math.round(g.up_rate)}% of ${g.n}` : null
    return [hit, up].filter(Boolean).join(' · ') || null
}

/**
 * ARGUS'S RECORD (backend hotlist.outcomes argusRecord) for a column — or `all` — as the strip's phrases: his picks, his
 * avoids and the names he left unmarked, each "up 73% · avg +0.6% (11)". Pure. Null without a scored name.
 */
export function argusRecordLine(summary, column = 'all') {
    const g = summary?.argus?.[column]
    if (!g || !(g.pick?.n || g.avoid?.n || g.unmarked?.n)) return null
    const part = (x) => (x?.n ? `up ${Math.round(x.up_rate)}% · avg ${_sp(x.ret_mean)} (${x.n})` : 'none yet')
    return [['picks', part(g.pick)], ['avoids', part(g.avoid)], ['unmarked', part(g.unmarked)]]
}

/** A column's record for the strip over its list: each grade's phrase, and how far it is from verified. Pure. */
export function columnRecord(summary, column) {
    const c = summary?.[column]
    if (!c) return null
    const grades = ['A', 'B', 'C'].map(g => ({ grade: g, text: gradeRecord(summary, column, g) })).filter(g => g.text)
    return {
        grades,
        verified: Boolean(c.verified),
        progress: c.verified ? null : `${c.sessions ?? 0} of ${VERIFY_SESSIONS} sessions, ${c.n ?? 0} of ${VERIFY_NAMES} names`,
    }
}

// ─── The house's book: Swing and Long term (Roy, 2026-10-24) ─────────────────────

/** The two longer lists — the house's coverage by its target's horizon (backend houseBook.service BOOKS). */
export const BOOK_ORDER = Object.freeze(['swing', 'long_term'])
export const BOOK_LABEL = Object.freeze({ swing: 'Swing', long_term: 'Long term' })
export const BOOK_TITLE = Object.freeze({
    swing:     "Swing — Prometheus's names with a 3–6 month price target",
    long_term: "Long term — Prometheus's names with a 12–24 month price target",
})
const BUY = new Set(['strong_buy', 'buy'])
/** A long the house would buy — the list's default view; holds and sells are the book's too, one click away. */
export const isBuy = (row) => BUY.has(row?.rating)

/**
 * A book row's RESULT as the list's short mark `{ text, title, tone }`. Pure. Settled: ✓ hit, ✗ broken, expired; live:
 * the move since the target was set, its tone by how it stands against SPY over the same days.
 */
export function bookResult(row) {
    if (!row) return null
    const since = _sp(row.since_set_pct), vs = _sp(row.vs_spy)
    const moved = row.since_set_pct != null ? ` — ${since} since the target was set${row.vs_spy != null ? `, ${vs} vs SPY` : ''}` : ''
    switch (row.state) {
    case 'hit':     return { text: '✓ hit', tone: 'good', title: `The target was reached${moved}` }
    case 'broken':  return { text: '✗ broken', tone: 'bad', title: `Prometheus marked the thesis broken${moved}` }
    case 'expired': return { text: 'expired', tone: 'bad', title: `The target date passed without a hit${moved}` }
    default:
        if (row.since_set_pct == null) return { text: '—', tone: 'dim', title: 'No price on the day the target was set yet — it is read in the background' }
        // Within a tenth of a point of SPY (a target set today has moved nothing yet) is neither ahead nor behind.
        return { text: `${since}${row.vs_spy != null ? ` (${vs})` : ''}`, tone: row.vs_spy == null || Math.abs(row.vs_spy) < 0.1 ? 'dim' : row.vs_spy > 0 ? 'good' : 'bad',
            title: `Since the target was set (${String(row.set_at).slice(0, 10)}): ${since}${row.vs_spy != null ? `; SPY ${_sp(row.spy_since_pct)} — ${vs} against it` : ''}` }
    }
}

/** How far toward the target, as a short cell — "62%" — or null. Pure. */
export function bookProgress(row) {
    return Number.isFinite(row?.progress) ? `${Math.round(row.progress * 100)}%` : null
}

/** Where a name came from, in a few words: the weekly chain's industry or theme, or the desk. Pure. */
export function bookOrigin(row) {
    const o = row?.origin
    if (o?.source !== 'pythia') return { text: 'desk', title: 'Researched at the desk (not from the weekly chain)' }
    return { text: o.subject ?? 'Pythia', title: `The weekly chain: Pythia's ${o.verdict === 'long_term' ? 'long-term' : o.verdict ?? ''} call on the ${o.kind ?? 'industry'} ${o.subject ?? ''} → Argus's pick → Prometheus` }
}

/**
 * A book's track record as one line's parts. Pure. → `{ settled, live }` phrases, or null on no record.
 */
export function bookRecordLine(rec) {
    if (!rec?.n) return null
    const settledN = (rec.hit ?? 0) + (rec.broken ?? 0) + (rec.expired ?? 0)
    const settled = settledN
        ? `settled ${settledN}: ${rec.hit} hit, ${rec.broken} broken, ${rec.expired} expired — ${Math.round(rec.hit_rate)}% hit`
        : 'no target has come due yet'
    const live = rec.priced
        ? `median ${_sp(rec.median_since)} since set, ${_sp(rec.median_vs_spy)} vs SPY; ${Math.round(rec.beat_spy)}% beating SPY (${rec.priced} priced)`
        : 'no moves priced yet'
    return { settled, live }
}

/** The book's sortable columns, each with the direction it sorts in first. */
export const BOOK_SORTS = Object.freeze({ symbol: 'asc', upside: 'desc', since: 'desc', vs_spy: 'desc', progress: 'desc', days_left: 'asc' })
const BOOK_KEY = {
    symbol: (r) => r.symbol ?? '', upside: (r) => r.upside_pct, since: (r) => r.since_set_pct, vs_spy: (r) => r.vs_spy,
    progress: (r) => r.progress, days_left: (r) => r.days_left,
}

/** A book sorted by one column — missing values last either way; null key keeps the server's order. Pure. */
export function sortBook(rows, key, dir) {
    if (!key || !BOOK_KEY[key]) return [...(rows ?? [])]
    const get = BOOK_KEY[key]
    const sign = (dir ?? BOOK_SORTS[key]) === 'desc' ? -1 : 1
    const known = (v) => v != null && v !== '' && !(typeof v === 'number' && !Number.isFinite(v))
    return [...(rows ?? [])].sort((a, b) => {
        const va = get(a), vb = get(b)
        if (known(va) !== known(vb)) return known(va) ? -1 : 1
        if (known(va) && va !== vb) return (va < vb ? -1 : 1) * sign
        return String(a.symbol).localeCompare(String(b.symbol))
    })
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
    // A Swing / Long term row is the house's coverage, not a board's cell: the thesis's numbers, and the timing question.
    if (BOOK_ORDER.includes(column)) {
        const bits = [
            row?.rating ? `Prometheus ${row.rating.replace('_', ' ')}` : null,
            Number.isFinite(row?.target) ? `target ${row.target.toFixed(2)}${row.target_date ? ` by ${row.target_date}` : ''}` : null,
            Number.isFinite(row?.upside_pct) ? `${_sign(row.upside_pct)}${row.upside_pct.toFixed(1)}% upside` : null,
            row?.origin?.source === 'pythia' && row.origin.subject ? `from Pythia's call on ${row.origin.subject}` : null,
        ].filter(Boolean)
        return `From the house's ${BOOK_LABEL[column].toLowerCase()} book: ${row.symbol}${bits.length ? ` — ${bits.join(', ')}` : ''}. Is now a good time to buy it, and what would make it wrong?`
    }
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
    // A book row hands Mentor the house's thesis in numbers — the rating, the target and its date — and the chain's reason.
    if (BOOK_ORDER.includes(column)) {
        const head = [row?.rating ? `Prometheus ${row.rating.replace('_', ' ')}` : null,
            Number.isFinite(row?.target) ? `target ${row.target.toFixed(2)}${row.target_date ? ` by ${row.target_date}` : ''}` : null].filter(Boolean).join(', ')
        const why = row?.origin?.why ?? null
        return [head ? `${head} (a ${BOOK_LABEL[column].toLowerCase()} name)` : null, why].filter(Boolean).join(' — ') || null
    }
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
