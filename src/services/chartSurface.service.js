import { eventBus } from './event-bus.service.js'

// ── The chart surface ─────────────────────────────────────────────────────────
//
// ONE live, interactive chart in the app — and this cell is what makes it one.
//
// It is DOCKED at the bottom of whichever chat asked for it (cmps/ChatChartDock.jsx), above the
// input row: a chart the user is reading price off is a reference they keep glancing at, so it holds
// its place while the conversation scrolls, and it follows them between agent chats. Asking for a
// new one replaces what's docked; Close empties the cell.
//
// Two kinds of caller write to it: the `chart` stream event when an agent was asked to show a chart
// (services/sse.util.js routes the `live` payload straight here), and any in-app UI that wants to
// put a chart up — which is what `drawings` and `source` are for (an idea/call pop-out, a ticker
// chip). Keeping the request in an event + module cell, rather than in a panel's state, is what lets
// an agent buried three components deep dock a chart with no prop-drilling and no panel wiring.
//
// Every reader subscribes through the `useChartSurface` hook. In practice that is ChatChartDock,
// rendered by each chat surface — including AgentChatInput, which covers five panels at once.

export const CHART_OPEN  = 'chart-open'
export const CHART_CLOSE = 'chart-close'

// The last request, so a subscriber that mounts AFTER the event (a panel switch mid-stream) still
// shows the chart instead of silently missing it.
let current = null

/**
 * Normalize an agent's chart request. The server already validates + canonicalizes, but a request
 * can also come from in-app UI (a ticker chip, a row click), so the guard lives here too: no
 * ticker, no chart.
 *
 * @param {{ ticker?: string, symbol?: string, timeframe?: string, interval?: string, source?: string }} req
 * @returns {{ ticker: string, timeframe: string, source: string|null, at: number }|null}
 */
export function normalizeChartRequest(req) {
    const ticker = String(req?.ticker ?? req?.symbol ?? '').trim().toUpperCase()
    if (!ticker) return null
    return {
        ticker,
        timeframe: String(req?.timeframe ?? req?.interval ?? 'day').trim() || 'day',
        // Overlay instructions (price levels, zones) when the caller has them — the chart renders
        // them the same way an idea/call pop-out does.
        drawings:  Array.isArray(req?.drawings) ? req.drawings : [],
        source:    req?.source ?? null,   // who asked (agent key), when an in-app caller sets it
        // Distinguishes two requests for the SAME ticker+timeframe, so re-asking re-opens a chart
        // the user had closed rather than looking like nothing happened.
        at: Date.now(),
    }
}

/** Open (or replace) the workspace chart. Returns the normalized request, or null if unusable. */
export function openChart(req) {
    const next = normalizeChartRequest(req)
    if (!next) return null
    current = next
    eventBus.emit(CHART_OPEN, next)
    return next
}

/** Close the workspace chart — the panel falls back to the lists. */
export function closeChart() {
    current = null
    eventBus.emit(CHART_CLOSE, null)
}

/** The chart currently on the surface (null when closed). */
export function currentChart() {
    return current
}

export const chartSurface = { open: openChart, close: closeChart, current: currentChart }
