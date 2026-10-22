import { httpService } from '../http.service'

// Client for the hotlist API (botmarket-backend api/hotlist; docs/design/daily-names.md §8): the
// screener's checkpoint boards, read-only and the same for every user. These THROW on failure — the
// panel says "couldn't load" rather than show an empty board, which would read as a quiet market.

const BASE = 'api/hotlist'

export const hotlistService = { getToday, getBoard, getOutcomes }

/**
 * `{ day, latest: board|null, checkpoints: [{ id, checkpoint, status, columns, finished_at, rows, argus }],
 *    dayList, working, stats }` — `working` is what the screener is doing right now (`{ kind: 'overnight', day,
 * started_at, done, of }` or `{ kind: 'board', checkpoint, started_at }`, else null); `stats` is the
 * latest finished overnight pass (`{ day, status, written, finished_at }`, else null).
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
