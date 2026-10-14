// Date math for the Floor's month calendar (CalendarPanel, 2026-10-14). Pure, and all in
// YYYY-MM-DD strings on UTC dates, so a reader's timezone can never shift a cell by a day — the
// same day-string convention the calendar feeds and floor.utils already use.

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Monday first: a trading week reads Mon–Fri, with the weekend at its end where it can be narrow.
export const WEEK_HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = n => String(n).padStart(2, '0')
export const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

const utc = iso => new Date(`${iso}T00:00:00Z`)

export function addDays(iso, n) {
    const d = utc(iso)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
}

/** Today as the READER's local date — "today" is where they are, not where UTC is. */
export function todayIso(now = new Date()) {
    return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** `{ y, m }` (m 1–12) of an ISO date, or of today. */
export const monthOf = (iso = todayIso()) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) })

export function shiftMonth({ y, m }, n) {
    const i = y * 12 + (m - 1) + n
    return { y: Math.floor(i / 12), m: (i % 12) + 1 }
}

/**
 * The month as whole Monday-first weeks: `{ from, to, weeks }`, where `weeks` is an array of
 * seven-ISO-date rows, padded with the neighbouring months' days. `from`/`to` span the padding too
 * — the cells shown are the cells counted — and never exceed 42 days.
 */
export function monthGrid({ y, m }) {
    const first = isoOf(y, m, 1)
    const lead = (utc(first).getUTCDay() + 6) % 7          // days since Monday
    const from = addDays(first, -lead)
    const next = shiftMonth({ y, m }, 1)
    const last = addDays(isoOf(next.y, next.m, 1), -1)
    const trail = (7 - ((utc(last).getUTCDay() + 6) % 7) - 1) % 7
    const to = addDays(last, trail)

    const weeks = []
    for (let start = from; start <= to; start = addDays(start, 7)) {
        weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)))
    }
    return { from, to, weeks }
}

export const fmtMonth = ({ y, m }) => `${MONTHS_LONG[m - 1]} ${y}`

/** "Thursday, October 29" — the date page's title. */
export function fmtLongDay(iso) {
    const d = utc(iso)
    return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export const isWeekend = iso => [0, 6].includes(utc(iso).getUTCDay())
