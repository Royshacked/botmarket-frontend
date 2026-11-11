// THE DAY BOARDS on the Hotlist (botmarket-backend services/hotlist.day.js; docs/design/argus-rework.md §3.3, revived
// 2026-11-11): three boards a trading day — 09:20, 10:30, 14:30 ET — of names IN PLAY. No grade, no free range, no
// result: a board says a name is moving up so far, with the numbers and why, and predicts nothing about where it goes.
// Pure helpers for HotlistDayBoards.

/** The Intraday tab's key and label — beside the week, the book's two lists and Covered companies. */
export const INTRADAY = 'intraday'
export const INTRADAY_LABEL = 'Intraday'

/** The three boards, in the day's order. */
export const DAY_BOARD_ORDER = Object.freeze(['open', 'mid', 'eod'])
export const DAY_BOARD_LABEL = Object.freeze({ open: '09:20', mid: '10:30', eod: '14:30' })
export const DAY_BOARD_TITLE = Object.freeze({
    open: '09:20 ET — before the open: gapping up on pre-market volume, or on fresh news',
    mid: '10:30 ET — mid-session: above the open on more volume than an ordinary day so far',
    eod: '14:30 ET — into the close: in the top quarter of the day’s range on volume',
})

const _ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const _ETDAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })

/** An instant → "HH:MM" in New York, or null. Pure. */
export function etTime(ms) {
    return Number.isFinite(ms) ? _ET.format(new Date(ms)) : null
}

/** An instant → its ET date, YYYY-MM-DD. Pure. */
export function etDay(ms) {
    return _ETDAY.format(new Date(ms))
}

/** When a board's quotes were taken — "09:20" or "09:20–09:25" (ET); a board takes minutes, so one time would lie. Pure. */
export function quotedSpan(rows) {
    const at = (rows ?? []).map(r => r?.quoted_at).filter(Number.isFinite)
    if (!at.length) return null
    const a = etTime(Math.min(...at)), b = etTime(Math.max(...at))
    return a === b ? a : `${a}–${b}`
}

/** The board to open on: the day's latest. `boards` oldest first. Pure. */
export function latestBoardId(boards) {
    return boards?.length ? boards[boards.length - 1].id : null
}

/** Volume against an ordinary day: "2.4×" in session, "3% pre" before the open, else null. Pure. */
export function volText(row) {
    if (Number.isFinite(row?.rvol)) return `${row.rvol}×`
    if (Number.isFinite(row?.pm_vol_pct)) return `${Math.round(row.pm_vol_pct * 10) / 10}% pre`
    return null
}

/** The move since the last close, signed: "+6.2%". Pure. */
export function gapText(row) {
    const g = row?.gap_pct
    return Number.isFinite(g) ? `${g > 0 ? '+' : ''}${g.toFixed(1)}%` : null
}

/**
 * A row's catalyst as the table shows it: the freshest headline with its ET time (FMP's times are ET wall-clock), the
 * report and rating flags, and how many more headlines there are. → `{ time, title, flags, more }`, or null. Pure.
 */
export function catalystCell(row) {
    const c = row?.catalyst
    if (!c) return null
    const news = Array.isArray(c.news) ? c.news : []
    const n = news[0]
    const flags = [c.earnings && 'reported', c.rating && 'rating change'].filter(Boolean)
    if (!n && !flags.length) return null
    return { time: n ? String(n.at ?? '').slice(11, 16) || null : null, title: n?.title ?? null, flags, more: Math.max(0, news.length - 1) }
}

/**
 * What the Intraday tab says when there is no board to show, or a past day's. `data` is GET /day's answer; `nowMs` now.
 * → `{ empty: text | null, stale: text | null }`. Pure.
 */
export function dayBoardsNote(data, nowMs) {
    const boards = data?.boards ?? []
    if (!boards.length) return { empty: 'No day board yet — the boards run at 09:20, 10:30 and 14:30 ET on trading days.', stale: null }
    const today = etDay(nowMs)
    return { empty: null, stale: data.day && data.day !== today ? `The last trading day’s boards (${data.day}) — today’s first is at 09:20 ET.` : null }
}
