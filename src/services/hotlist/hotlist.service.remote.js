import { httpService } from '../http.service'

// Client for the hotlist API (botmarket-backend api/hotlist; docs/design/daily-names.md §8): the
// screener's checkpoint boards, read-only and the same for every user. These THROW on failure — the
// panel says "couldn't load" rather than show an empty board, which would read as a quiet market.

const BASE = 'api/hotlist'

export const hotlistService = { getToday, getBoard, getOutcomes, getReads, requestRead, getBook, getScorecard }

/**
 * PROMETHEUS'S SCORECARD (botmarket-backend prometheusCalls.service, 2026-10-27) → `{ coverage: { forward, backfill },
 * catalyst: { backed, passes, open }, as_of, min_judge }`. Coverage calls frozen when made, graded vs SPY at 1/3/6/12+
 * months (`marks[m].calls` signed by the rating, `.holds` apart); catalyst reads he backed against the ones he passed,
 * each held to its window's end. Every summary is `{ n, mean, median, beat, judge }`.
 */
async function getScorecard() {
    return httpService.get(`${BASE}/scorecard`)
}

/**
 * `{ day, latest: board|null, checkpoints: [{ id, checkpoint, status, columns, finished_at, rows, argus }],
 *    dayList, working, stats }` — `working` is what the screener is doing right now (`{ kind: 'overnight', day,
 * started_at, done, of }` or `{ kind: 'board', checkpoint, started_at }`, else null); `stats` is the
 * latest finished overnight pass (`{ day, status, written, finished_at }`, else null). Every graded column of a row
 * carries its `results[column]` (`{ state: reached | missed | up | down | open | scoring | no_data, … }`).
 */
async function getToday(day = null) {
    const data = await httpService.get(day ? `${BASE}?day=${encodeURIComponent(day)}` : BASE)
    return {
        day:         data?.day ?? null,
        latest:      data?.latest ?? null,
        checkpoints: Array.isArray(data?.checkpoints) ? data.checkpoints : [],
        // The day's watchlist: every name any board graded, once, cells merged per column with the
        // board each lives on in `cell_board` (botmarket-backend hotlist.service dayList).
        dayList:     Array.isArray(data?.day_list) ? data.day_list : [],
        working:     data?.working ?? null,
        stats:       data?.stats ?? null,
        // The days there are lists for, newest first — a past day is where its names' results are (2026-10-24).
        days:        Array.isArray(data?.days) ? data.days : [],
    }
}

/** One checkpoint's board, in full. */
async function getBoard(id) {
    return httpService.get(`${BASE}/boards/${encodeURIComponent(id)}`)
}

/** The outcome log summarised — per column and grade, and which columns are verified. */
async function getOutcomes() {
    return httpService.get(`${BASE}/outcomes`)
}

/**
 * Prometheus's catalyst reads on the week's picks (botmarket-backend catalystRead.service; docs/design/horizon-chains.md §3):
 * the live ones and the recently settled, each with its target (`{ value, low, high, open_pct, priced_share }`, or null
 * for a pass), its window (`valid_until`) and, once graded, its outcome. `[]` on an empty answer.
 */
async function getReads() {
    const data = await httpService.get(`${BASE}/reads`)
    return Array.isArray(data) ? data : []
}

/**
 * Ask Prometheus for a catalyst read on a This week row (POST /reads; horizon-chains.md §3) — `board` is the board the
 * row's week cell lives on (today's). → `'started'` or `'queued'` (a run is going; read after it). Throws on a refusal —
 * a live read, one already waiting, the day's count used up — with the server's words (apiError).
 */
async function requestRead(board, symbol) {
    const data = await httpService.post(`${BASE}/reads`, { board, symbol })
    return data?.outcome ?? 'queued'
}

/**
 * The house's SWING and LONG TERM names (botmarket-backend houseBook.service): live coverage split by its target's
 * horizon → `{ asof, today, swing: [row], long_term: [row], record: { swing, long_term } }`. Each row: price (the
 * screener's close), rating, target, upside, horizon and target date, the move since the target was set and against
 * SPY, `progress` toward the target, `state` (live | hit | broken | expired) and `origin` (the weekly chain or the desk).
 */
async function getBook() {
    const data = await httpService.get(`${BASE}/book`)
    return { asof: data?.asof ?? null, swing: data?.swing ?? [], long_term: data?.long_term ?? [], record: data?.record ?? {} }
}
