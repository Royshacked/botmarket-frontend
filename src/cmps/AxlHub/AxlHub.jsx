import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { BrandTitle } from '../BrandTitle.jsx'
import { AgentSummon } from './AgentSummon.jsx'
import { AgentGlyph } from './AgentBadges.jsx'
import { AGENTS, SUMMON_MS, DESKS } from './agentMeta.jsx'
import { axlService } from '../../services/axl/axl.service.remote'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { ChatChartDock } from '../ChatChartDock.jsx'
import { closeChart } from '../../services/chartSurface.service.js'
import './AxlHub.scss'

// ── axl · reception ────────────────────────────────────────────────────────────
// Axl greets the user and presents 4 pipeline desk buttons. The user either
// picks a desk directly (instant summon) or types their intent in free text
// (Axl streams a short comment, resolves the right desk, then summons it).

function firstName(fullname = '') {
    const n = String(fullname).trim().split(/\s+/)[0]
    return n || ''
}


export function AxlHub({ user, onPick, onChat }) {
    const name = firstName(user?.fullname)
    const [summoning, setSummoning]     = useState(null)
    const [draft, setDraft]             = useState('')
    const [comment, setComment]         = useState('')
    const [isRouting, setIsRouting]     = useState(false)
    const [pendingDesk, setPendingDesk] = useState(null)
    const [hoveredDesk, setHoveredDesk] = useState(null)
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

    async function handleIntent(overrideText) {
        const t = (typeof overrideText === 'string' ? overrideText : draft).trim()
        if (!t || isRouting) return
        setDraft('')
        setComment('')
        setIsRouting(true)
        abortRef.current = new AbortController()

        try {
            await axlService.routeIntent(t, {
                signal:  abortRef.current.signal,
                onToken: (text) => setComment(prev => prev + text),
                onDone:  (data) => {
                    setIsRouting(false)
                    // A chart request needs no wiring here: the `chart` event already docked it
                    // (services/sse.util.js → the shared store → ChatChartDock below). NO desk
                    // routing happens — the user asked to look, not to be moved somewhere.
                    if (data.chart?.ticker) return
                    const desk = DESKS.find(d => d.key === data.route)
                    if (desk) setPendingDesk(desk)
                },
                onError: () => setIsRouting(false),
            })
        } catch (err) {
            if (err?.name !== 'AbortError') console.error('[axl:route]', err)
            setIsRouting(false)
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleIntent() }
    }

    const onTranscript = useCallback((text) => { if (text) handleIntent(text) }, []) // eslint-disable-line react-hooks/exhaustive-deps
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    const hasResult = comment || isRouting

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
            {/* ── pipeline header ── */}
            <div className="axl-hub__header">
                {hoveredDesk ? (
                    <span className="axl-hub__pipeline-path" key={hoveredDesk.key}>
                        <span className="axl-hub__pipeline-desk">{hoveredDesk.label}</span>
                        {hoveredDesk.steps.map((step, i) => (
                            <span key={step.label} className="axl-hub__pipeline-step-group">
                                {i > 0 && <span className="axl-hub__pipeline-line" aria-hidden="true" />}
                                <span className="axl-hub__pipeline-step">
                                    <span className="axl-hub__pipeline-text">{step.label}</span>
                                </span>
                            </span>
                        ))}
                    </span>
                ) : (
                    <span className="axl-hub__pipeline-idle">Where would you like to start?</span>
                )}
            </div>

            <div className={`axl-hub__body${hasResult ? ' axl-hub__body--active' : ''}`}>
                {!hasResult && (
                    /* ── greeting ── */
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
                    </div>
                )}

                {hasResult ? (
                    /* ── inline desk chips (replaces cards once a result is showing) ── */
                    <div className="axl-hub__desk-strip">
                        {DESKS.map(desk => (
                            <button
                                key={desk.key}
                                type="button"
                                className={`axl-hub__desk-chip axl-hub__desk-chip--${desk.hue}`}
                                onClick={() => handleDeskPick(desk)}
                                disabled={isRouting}
                                title={desk.label}
                            >
                                <AgentGlyph agentKey={desk.agentKey} icon={AGENTS[desk.agentKey]?.icon} size={13} />
                                <span>{desk.lead}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    /* ── 4 desk cards (2×2 grid) ── */
                    <div className="axl-hub__options">
                        {DESKS.map((desk, i) => (
                            <button
                                key={desk.key}
                                type="button"
                                className={`axl-hub__option axl-hub__option--${desk.hue}`}
                                style={{ animationDelay: `${0.08 + i * 0.06}s` }}
                                onClick={() => handleDeskPick(desk)}
                                onMouseEnter={() => setHoveredDesk(desk)}
                                onMouseLeave={() => setHoveredDesk(null)}
                                disabled={isRouting}
                            >
                                <span className="axl-hub__option-icon">
                                    <AgentGlyph agentKey={desk.agentKey} icon={AGENTS[desk.agentKey]?.icon} size={32} />
                                </span>
                                <span className="axl-hub__option-lead">{desk.lead}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Axl's routing comment, then a chart if one was asked for ── */}
                {isRouting && !comment && <ToolStatusChip label="thinking…" />}
                {comment && (
                    <div className="axl-hub__route-comment" aria-live="polite">{comment}</div>
                )}

                {onChat && (
                    <button
                        type="button"
                        className="axl-hub__chat-link"
                        onClick={onChat}
                        disabled={isRouting}
                    >
                        or chat with axl
                    </button>
                )}
            </div>

            {/* Same dock as every agent chat: above the input, below the body. The hub's Clear also
                closes it — one Clear, one clean slate, rather than a chart under an empty hub. */}
            <ChatChartDock />

            <ChatInputRow
                prefix="axl"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                textareaRef={inputRef}
                placeholder="Or describe what you'd like to do…"
                onSend={handleIntent}
                sendDisabled={isRouting}
                onClear={() => { setDraft(''); setComment(''); closeChart() }}
                clearDisabled={!draft && !comment}
                onToggleMic={toggleMic}
                onCancelMic={cancelMic}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                micDisabled={isRouting || isTranscribing}
                textareaDisabled={isRouting || isRecording}
            />
        </div>
    )
}

AxlHub.propTypes = {
    user:   PropTypes.object,
    onPick: PropTypes.func.isRequired,
    onChat: PropTypes.func,
}
