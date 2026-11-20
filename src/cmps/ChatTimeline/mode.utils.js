// THE CHAT'S MODE (docs/design/modes-and-builders.md M3/M4, backend services/desks/modes.js): General — Axl, who asks the
// specialists — or one of the builders. Derived from the floor, exactly as the server derives it: a builder on the floor
// is its mode, anyone else is General. Pure.

/** The picker's options, in its order. `mode` is what the server takes; `short` is the chip inside the prompt box. */
export const MODE_OPTIONS = Object.freeze([
    { mode: 'general',   label: 'General',           short: 'General',   hint: 'Ask anything — Axl answers, and asks the specialists' },
    { mode: 'mentor',    label: 'Trader',            short: 'Trader',    hint: 'Build one trade' },
    { mode: 'portfolio', label: 'Portfolio manager', short: 'Portfolio', hint: 'Build or review a portfolio' },
    { mode: 'analyst',   label: 'Analyst',           short: 'Analyst',   hint: 'Research a company into coverage' },
])

const BUILDERS = new Set(['mentor', 'portfolio', 'analyst'])

/** The mode a floor means. */
export function modeOf(floor) {
    return BUILDERS.has(floor) ? floor : 'general'
}

/** The option for a mode (General for anything unknown). */
export function modeOption(mode) {
    return MODE_OPTIONS.find(o => o.mode === mode) ?? MODE_OPTIONS[0]
}
