// The price axis stretched to take in the lines drawn on the chart. KLineCharts fits the axis to the visible candles
// alone, so a target over every bar drew off the top of the pane: Mentor's measured move at the highs, the one target
// that is always over the candles (Roy, 2026-11-05). Pure.
export function rangeWithLevels(range, prices = []) {
    const valid = prices.filter(Number.isFinite)
    if (!valid.length) return range
    const from = Math.min(range.from, ...valid)
    const to = Math.max(range.to, ...valid)
    const span = to - from
    return { ...range, from, to, range: span, realFrom: from, realTo: to, realRange: span, displayFrom: from, displayTo: to, displayRange: span }
}
