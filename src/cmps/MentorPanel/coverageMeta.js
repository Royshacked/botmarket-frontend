// The three dimensions Mentor must read before it commits to a setup.
//
// Data only — no component exports live here on purpose: mixing components with constants in one
// module breaks React Fast Refresh (HMR) for every importer. Same split as AxlHub/agentMeta.jsx.
//
// This is a SET, not a sequence. Mentor has no phases; it covers these in whatever order the
// conversation takes, often several in one turn, and weights them by horizon (company is one line
// for an intraday scalp and decisive for a swing).

export const COVERAGE_DIMENSIONS = [
    { key: 'markets',    label: 'Markets',    hint: 'Regime — trending or chopping, risk-on or risk-off, and whether that supports this trade' },
    { key: 'company',    label: 'Company',    hint: 'Fundamentals and catalysts, weighted by horizon' },
    { key: 'technicals', label: 'Technicals', hint: 'Structure off the candles and the chart' },
]
