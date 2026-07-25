import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { BrandTitle } from '../BrandTitle.jsx'
import { AgentSummon } from './AgentSummon.jsx'
import { AgentGlyph } from './AgentBadges.jsx'
import { AGENTS, SUMMON_MS } from './agentMeta.jsx'
import { axlService } from '../../services/axl/axl.service.remote'
import { ChartBubble } from '../PriceChart/ChartBubble.jsx'
import './AxlHub.scss'

// ── axl · reception ────────────────────────────────────────────────────────────
// Axl greets the user and presents 4 pipeline desk buttons. The user either
// picks a desk directly (instant summon) or types their intent in free text
// (Axl streams a short comment, resolves the right desk, then summons it).

function firstName(fullname = '') {
    const n = String(fullname).trim().split(/\s+/)[0]
    return n || ''
}

// The 4 pipeline desks. `entryTab` is the agent tab that opens at step 1.
// `agentKey` drives the summon icon (the desk's most recognisable deliverable).
const DESKS = [
    {
        key:      'trade',
        label:    'Trading Desk',
        lead:     'Trade an asset',
        blurb:    'Intraday, day, or swing — Argus validates, Kairos plans the setup, Hermes monitors.',
        hue:      'cyan',
        entryTab: 'scanner',
        agentKey: 'kairos',
    },
    {
        key:      'portfolio',
        label:    'Portfolio Desk',
        lead:     'Build a portfolio',
        blurb:    'Long-term or swing allocation — Argus scans, Prometheus researches, Atlas allocates.',
        hue:      'green',
        entryTab: 'scanner',
        agentKey: 'portfolio',
    },
    {
        key:      'scan',
        label:    'Scan Desk',
        lead:     'Produce a watchlist',
        blurb:    'Argus sweeps the market and generates a candidate list for later setups.',
        hue:      'violet',
        entryTab: 'scanner',
        agentKey: 'scanner',
    },
    {
        key:      'research',
        label:    'Research Desk',
        lead:     'Research a company',
        blurb:    'Prometheus builds a living coverage thesis — our view vs the Street.',
        hue:      'amber',
        entryTab: 'analyst',
        agentKey: 'analyst',
    },
]

export function AxlHub({ user, onPick, onChat }) {
    const name = firstName(user?.fullname)
    const [summoning, setSummoning]     = useState(null)
    const [draft, setDraft]             = useState('')
    const [comment, setComment]         = useState('')
    const [isRouting, setIsRouting]     = useState(false)
    const [pendingDesk, setPendingDesk] = useState(null)
    const [chartData, setChartData]     = useState(null)
    const timerRef  = useRef(null)
    const abortRef  = useRef(null)
    const inputRef  = useRef(null)

    useEffect(() => () => {
        clearTimeout(timerRef.current)
        abortRef.current?.abort()
    }, [])

    // Once Axl's comment has finished streaming, pause briefly so the user can
    // read it, then start the summon animation to the resolved desk.
    useEffect(() => {
        if (!pendingDesk || isRouting) return
        const t = setTimeout(() => {
            _summon(pendingDesk)
            setPendingDesk(null)
        }, 900)
        return () => clearTimeout(t)
    }, [pendingDesk, isRouting]) // eslint-disable-line react-hooks/exhaustive-deps

    function _summon(desk) {
        setSummoning(desk)
        timerRef.current = setTimeout(
            () => onPick(desk.entryTab, { pipeline: desk.key }),
            SUMMON_MS,
        )
    }

    function handleDeskPick(desk) {
        if (summoning || isRouting) return
        _summon(desk)
    }

    async function handleIntent() {
        const t = draft.trim()
        if (!t || isRouting) return
        setDraft('')
        setComment('')
        setChartData(null)
        setIsRouting(true)
        abortRef.current = new AbortController()

        try {
            await axlService.routeIntent(t, {
                signal:  abortRef.current.signal,
                onToken: (text) => setComment(prev => prev + text),
                onDone:  (data) => {
                    setIsRouting(false)
                    if (data.chart?.ticker && data.chart?.timeframe) {
                        setChartData(data.chart)
                    } else {
                        const desk = DESKS.find(d => d.key === data.route)
                        if (desk) setPendingDesk(desk)
                    }
                },
                onError: () => setIsRouting(false),
            })
        } catch (err) {
            if (err?.name !== 'AbortError') console.error('[axl:route]', err)
            setIsRouting(false)
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') { e.preventDefault(); handleIntent() }
    }

    if (summoning) {
        const agent = AGENTS[summoning.agentKey]
        return (
            <div className="axl-hub axl-hub--summon" role="status" aria-live="polite">
                <AgentSummon
                    hue={summoning.hue}
                    label={
                        <>
                            Routing to the{' '}
                            <span className="axl-summon__brand">
                                <BrandTitle text={summoning.label} />
                            </span>
                            <span className="axl-summon__dots" aria-hidden="true"><i /><i /><i /></span>
                        </>
                    }
                    sub="Step 1 is ready for you"
                >
                    <AgentGlyph agentKey={summoning.agentKey} icon={agent?.icon} size={54} />
                </AgentSummon>
            </div>
        )
    }

    return (
        <div className="axl-hub">
            <div className="axl-hub__body">
                {/* ── greeting ── */}
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
                        <line className="axl-hub__bot" x1="22" y1="9.3" x2="22" y2="7.3" />
                        <circle className="axl-hub__bot" cx="22" cy="6.1" r="1.1" />
                        <rect className="axl-hub__bot" x="15.5" y="9.5" width="13" height="10" rx="3.6" />
                        <path className="axl-hub__bot" d="M18,14 q1.7,1.4 3.4,0" />
                        <path className="axl-hub__bot" d="M22.6,14 q1.7,1.4 3.4,0" />
                        <path className="axl-hub__bot" d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
                        <path className="axl-hub__bot" d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
                        <path className="axl-hub__bot" d="M13,30 Q22,26.2 31,30" />
                        <path className="axl-hub__bot" d="M14,30.5 Q22,34.6 30,30.5" />
                        <path className="axl-hub__bot" d="M19.4,31 L24.6,33.4" />
                        <path className="axl-hub__bot" d="M24.6,31 L19.4,33.4" />
                    </svg>
                    <h2 className="axl-hub__greeting">
                        Hi{name ? ` ${name}` : ''}, I&apos;m <span className="axl-hub__wordmark"><b>A</b>xl</span>.
                    </h2>
                    <p className="axl-hub__prompt">Where would you like to start?</p>
                </div>

                {/* ── 4 desk cards ── */}
                <div className="axl-hub__options">
                    {DESKS.map((desk, i) => (
                        <button
                            key={desk.key}
                            type="button"
                            className={`axl-hub__option axl-hub__option--${desk.hue}`}
                            style={{ animationDelay: `${0.08 + i * 0.06}s` }}
                            onClick={() => handleDeskPick(desk)}
                            disabled={isRouting}
                        >
                            <span className="axl-hub__option-icon">
                                <AgentGlyph agentKey={desk.agentKey} icon={AGENTS[desk.agentKey]?.icon} size={42} />
                            </span>
                            <span className="axl-hub__option-body">
                                <span className="axl-hub__option-lead">{desk.lead}</span>
                                <span className="axl-hub__option-blurb">{desk.blurb}</span>
                            </span>
                            <span className="axl-hub__option-with">
                                <span className="axl-hub__option-brand">{desk.label}</span>
                            </span>
                        </button>
                    ))}
                </div>

                {/* ── Axl's routing comment (streams while resolving intent) ── */}
                {(comment || isRouting) && (
                    <div className="axl-hub__route-comment" aria-live="polite">
                        {comment || <span className="axl-hub__thinking">thinking…</span>}
                    </div>
                )}

                {/* ── Chart bubble (when Axl resolves a chart intent) ── */}
                {chartData && (
                    <div className="axl-hub__chart">
                        <ChartBubble ticker={chartData.ticker} timeframe={chartData.timeframe} />
                    </div>
                )}
            </div>

            {/* ── free-text intent input ── */}
            <div className="axl-hub__intent-row" style={{ gap: '8px' }}>
                <input
                    ref={inputRef}
                    className="axl-hub__intent-input"
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Or describe what you'd like to do…"
                    disabled={isRouting}
                    aria-label="Describe your intent"
                />
                <button
                    type="button"
                    className="axl-hub__intent-send"
                    onClick={handleIntent}
                    disabled={!draft.trim() || isRouting}
                    aria-label="Send"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                </button>
                {onChat && (
                    <button
                        type="button"
                        className="axl-hub__chat-link"
                        onClick={onChat}
                        disabled={isRouting}
                        aria-label="Open Axl chat"
                    >
                        chat
                    </button>
                )}
            </div>
        </div>
    )
}

AxlHub.propTypes = {
    user:   PropTypes.object,
    onPick: PropTypes.func.isRequired,
    onChat: PropTypes.func,
}
