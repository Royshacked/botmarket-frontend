import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { BrandTitle } from '../BrandTitle.jsx'
import { AgentSummon } from './AgentSummon.jsx'
import { AGENT_LIST, SUMMON_MS } from './agentMeta.jsx'
import './AxlHub.scss'

// ── axl · the calm hub ─────────────────────────────────────────────────────────
// The default chat home: axl (the meditating bot) greets the trader and offers the
// three specialist agents as clickable cards. Picking one plays a short "summoning"
// beat — axl calling the agent — before its chat (Idea / Atlas / Argus) opens; the
// agent then introduces itself inside its own panel. This is intentionally light:
// the seed for axl growing into a general app chat later; for now it only routes.

function firstName(fullname = '') {
    const n = String(fullname).trim().split(/\s+/)[0]
    return n || ''
}

export function AxlHub({ user, onPick }) {
    const name = firstName(user?.fullname)
    const [summoning, setSummoning] = useState(null)
    const timerRef = useRef(null)

    useEffect(() => () => clearTimeout(timerRef.current), [])

    function handlePick(opt) {
        if (summoning) return
        setSummoning(opt)
        timerRef.current = setTimeout(() => onPick(opt.tab), SUMMON_MS)
    }

    if (summoning) {
        return (
            <div className="axl-hub" role="status" aria-live="polite">
                <AgentSummon
                    hue={summoning.hue}
                    label={
                        <>
                            Summoning <span className="axl-summon__brand"><BrandTitle text={summoning.brand} /></span>
                            <span className="axl-summon__dots" aria-hidden="true"><i /><i /><i /></span>
                        </>
                    }
                    sub={`${summoning.brand} will be right with you`}
                >
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        {summoning.icon}
                    </svg>
                </AgentSummon>
            </div>
        )
    }

    return (
        <div className="axl-hub">
            <div className="axl-hub__intro">
                <svg className="axl-hub__mark" viewBox="0 0 44 44" aria-hidden="true">
                    <defs>
                        <radialGradient id="axlHubAura" cx="50%" cy="44%" r="62%">
                            <stop offset="0"   style={{ stopColor: 'var(--accent-light)', stopOpacity: 0.20 }} />
                            <stop offset="0.6" style={{ stopColor: 'var(--accent)',       stopOpacity: 0.10 }} />
                            <stop offset="1"   style={{ stopColor: 'var(--accent-light)', stopOpacity: 0.13 }} />
                        </radialGradient>
                        <linearGradient id="axlHubRing" gradientUnits="userSpaceOnUse" x1="6" y1="6" x2="38" y2="38">
                            <stop offset="0"   style={{ stopColor: 'var(--accent-bright)' }} />
                            <stop offset="0.5" style={{ stopColor: 'var(--accent-light)' }} />
                            <stop offset="1"   style={{ stopColor: 'var(--accent)' }} />
                        </linearGradient>
                    </defs>
                    <circle className="axl-hub__aura" cx="22" cy="22" r="20" />
                    <circle className="axl-hub__ring" cx="22" cy="22" r="20" />
                    {/* antenna */}
                    <line className="axl-hub__bot" x1="22" y1="9.3" x2="22" y2="7.3" />
                    <circle className="axl-hub__bot" cx="22" cy="6.1" r="1.1" />
                    {/* head */}
                    <rect className="axl-hub__bot" x="15.5" y="9.5" width="13" height="10" rx="3.6" />
                    {/* closed, content eyes (meditating) */}
                    <path className="axl-hub__bot" d="M18,14 q1.7,1.4 3.4,0" />
                    <path className="axl-hub__bot" d="M22.6,14 q1.7,1.4 3.4,0" />
                    {/* arms resting */}
                    <path className="axl-hub__bot" d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
                    <path className="axl-hub__bot" d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
                    {/* crossed legs / lotus base */}
                    <path className="axl-hub__bot" d="M13,30 Q22,26.2 31,30" />
                    <path className="axl-hub__bot" d="M14,30.5 Q22,34.6 30,30.5" />
                    <path className="axl-hub__bot" d="M19.4,31 L24.6,33.4" />
                    <path className="axl-hub__bot" d="M24.6,31 L19.4,33.4" />
                </svg>

                <h2 className="axl-hub__greeting">
                    Hi{name ? ` ${name}` : ''}, I&apos;m <span className="axl-hub__wordmark"><b>a</b>xl</span>.
                </h2>
                <p className="axl-hub__prompt">What would you like to build today?</p>
            </div>

            <div className="axl-hub__options">
                {AGENT_LIST.map(opt => (
                    <button
                        key={opt.tab}
                        type="button"
                        className={`axl-hub__option axl-hub__option--${opt.hue}`}
                        onClick={() => handlePick(opt)}
                    >
                        <span className="axl-hub__option-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                {opt.icon}
                            </svg>
                        </span>
                        <span className="axl-hub__option-body">
                            <span className="axl-hub__option-lead">{opt.lead}</span>
                            <span className="axl-hub__option-blurb">{opt.blurb}</span>
                        </span>
                        <span className="axl-hub__option-with">
                            with <span className="axl-hub__option-brand"><BrandTitle text={opt.brand} /></span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    )
}

AxlHub.propTypes = {
    user:   PropTypes.object,
    onPick: PropTypes.func.isRequired,
}
