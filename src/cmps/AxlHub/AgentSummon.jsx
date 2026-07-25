import PropTypes from 'prop-types'
import { BrandTitle } from '../BrandTitle.jsx'
import { AgentGlyph } from './AgentBadges.jsx'
import './AxlHub.scss'

// ── Agent presentational pieces ────────────────────────────────────────────────
// Components only (data + timings live in agentMeta.jsx). Keeping this file
// component-only is what lets React Fast Refresh hot-update it.

// The meditating axl bot as a plain stroke glyph (no gradients) so it inherits the
// orb's hue via currentColor — used inside the "back to axl" interstitial.
export function AxlBotGlyph() {
    return (
        <svg width="38" height="38" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="9.3" x2="22" y2="7.3" />
            <circle cx="22" cy="6.1" r="1.1" />
            <rect x="15.5" y="9.5" width="13" height="10" rx="3.6" />
            <path d="M18,14 q1.7,1.4 3.4,0" />
            <path d="M22.6,14 q1.7,1.4 3.4,0" />
            <path d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
            <path d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
            <path d="M13,30 Q22,26.2 31,30" />
            <path d="M14,30.5 Q22,34.6 30,30.5" />
            <path d="M19.4,31 L24.6,33.4" />
            <path d="M24.6,31 L19.4,33.4" />
        </svg>
    )
}

// In-chat introduction prompt: the agent's empty-state greeting, styled to echo
// axl's own hub greeting (icon + "Hi, I'm …" + a line). Rendered inside each
// panel's fresh/empty message area; extra guidance or starter chips go as children.
export function AgentIntro({ agent, introOverride, hintOverride, children }) {
    return (
        <div className={`agent-intro agent-intro--${agent.hue}`}>
            <span className="agent-intro__icon">
                <AgentGlyph agentKey={agent.tab} icon={agent.icon} size={48} />
            </span>
            <p className="agent-intro__greeting">
                Hi, I&apos;m <span className="agent-intro__brand"><BrandTitle text={agent.brand} /></span>.
            </p>
            <p className="agent-intro__intro">{introOverride ?? agent.intro}</p>
            {(hintOverride ?? agent.hint) && <p className="agent-intro__hint">{hintOverride ?? agent.hint}</p>}
            {children}
        </div>
    )
}

AgentIntro.propTypes = {
    agent:         PropTypes.object.isRequired,
    introOverride: PropTypes.string,
    hintOverride:  PropTypes.string,
    children:      PropTypes.node,
}

// Per-turn attribution tag (Claude-style): a small sigil + agent name shown under
// each assistant turn when the panel's own header is hidden (minimal layout).
export function AgentTurnTag({ agent, active = false }) {
    return (
        <span className={`agent-turn-tag${active ? ' is-active' : ''}`}>
            <span className="agent-turn-tag__icon">
                <AgentGlyph agentKey={agent.tab} icon={agent.icon} size={26} />
            </span>
            <span className="agent-turn-tag__name">{agent.brand}</span>
        </span>
    )
}

AgentTurnTag.propTypes = {
    agent:  PropTypes.object.isRequired,
    active: PropTypes.bool,
}

// Presentational interstitial: a pulsing hue-tinted orb with a label + sub line.
// The orb content (agent sigil or axl bot) is passed as children.
export function AgentSummon({ hue = 'green', label, sub, children }) {
    return (
        <div className={`axl-summon axl-summon--${hue}`}>
            <div className="axl-summon__orb">
                <span className="axl-summon__pulse" />
                <span className="axl-summon__pulse axl-summon__pulse--2" />
                <span className="axl-summon__ring" />
                <span className="axl-summon__icon">{children}</span>
            </div>
            <p className="axl-summon__label">{label}</p>
            {sub && <p className="axl-summon__sub">{sub}</p>}
        </div>
    )
}

AgentSummon.propTypes = {
    hue:      PropTypes.string,
    label:    PropTypes.node,
    sub:      PropTypes.node,
    children: PropTypes.node,
}
