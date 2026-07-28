import { eventBus } from './event-bus.service.js'

// ── The chart surface ─────────────────────────────────────────────────────────
//
// ONE live chart in the app, opened the same way by every agent.
//
// The backend half of this is the shared `<chart>` emit tag (services/agentIO.js): any agent that
// forwards `onOpenChart` gets its controller emitting the `chart_open` SSE event. That event is
// wired straight to `openChart()` in the shared stream-handler builder (services/sse.util.js), so
// a NEW agent costs nothing on this side — no panel prop, no per-chat bubble, no wiring.
//
// The surface itself is rendered by whoever owns the workspace lists panel (MainPage →
// TradeIdeasList), which subscribes through the `useChartSurface` hook. Keeping the request in an
// event + module-level cell (rather than in a panel's state) is what lets an agent buried three
// components deep open a chart without prop-drilling a callback to it.

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
