// ── The contract registry ──────────────────────────────────────────────────────
// Assembles what each desk declares about itself. The contracts live BESIDE their panels, because
// what an agent accepts and how it opens on it is the agent's own business; this file only knows
// where to find them, the same way agentMeta stays data-only and the panels stay components.
//
// An agent with no contract yet accepts nothing, which is exactly right: its hops are still
// hand-written, and the conveyor must not try to route to a desk that has not said what it takes.

import { scannerContract } from '../../cmps/ScannerPanel/scanner.contract.js'
import { mentorContract }  from '../../cmps/MentorPanel/mentor.contract.js'
import { analystContract } from '../../cmps/AnalystPanel/analyst.contract.js'
import { portfolioContract } from '../../cmps/PortfolioPanel/portfolio.contract.js'

// Keyed by the agent key — which is also the panel's `activeTab` value and the AGENTS key, so a
// pipeline step's `tab` names its agent without a second mapping to keep in step.
//
// A desk earns an entry here by declaring what it takes, not by having a hop yet. Mentor and
// Prometheus lead single-step desks and route nothing today; what their contracts buy is that
// giving those desks a second step becomes an edit to `steps`, with no agent touched.
export const CONTRACTS = {
    scanner:   scannerContract,
    mentor:    mentorContract,
    analyst:   analystContract,
    portfolio: portfolioContract,
}

/** @returns {object|null} the agent's contract, or null if it has not declared one yet. */
export function contractFor(agent) {
    return CONTRACTS[agent] ?? null
}

/** Does this agent take that kind of artifact? Unknown agent → no. */
export function accepts(agent, kind) {
    return !!contractFor(agent)?.accepts?.includes(kind)
}

/**
 * Every declared agent that takes this kind. Used for a hand-off happening OUTSIDE any pipeline —
 * the user reached Kairos directly and it asks for a name, and there is no chain to walk. The desks
 * are still the same desks, so capability alone can answer it when exactly one agent qualifies.
 * @returns {string[]} agent keys
 */
export function agentsAccepting(kind) {
    return Object.keys(CONTRACTS).filter(agent => accepts(agent, kind))
}
