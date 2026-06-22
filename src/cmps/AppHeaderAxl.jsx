import { useContext, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'

// ── AppHeader · "axl" style (trial) ───────────────────────────────────────────
// The calm aurora header: animated calm-water wave bottom edge, ambient breathing
// candlesticks, a centered AI prompt/reply stream, a status pill and the profile
// cluster. Keeps TRADVICE content + the original navigate-to-profile / "Back to
// Trading" behavior; only the look changes. Styles live in AppHeaderAxl.scss.
//
// Self-contained on purpose (header-first): nothing here touches the app-wide
// theme. RootCmp swaps this in when localStorage.headerStyle !== 'classic'.

// Ambient stream content — TRADVICE-flavored prompt/reply pairs.
const STREAM = [
    { who: 'user', t: 'Markets are red — should I act?' },
    { who: 'axl',  t: 'Down 0.4%, inside your range. Sit tight.' },
    { who: 'user', t: 'How exposed am I to tech?' },
    { who: 'axl',  t: '22% — just under your 25% cap. Balanced.' },
    { who: 'user', t: 'Should I sell everything?' },
    { who: 'axl',  t: 'Low volatility, thesis intact. Plan says hold.' },
    { who: 'user', t: 'Risk if the market drops 10%?' },
    { who: 'axl',  t: 'Your hedges cap the drawdown near 6%.' },
]

function initials(name = 'Trader') {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'T'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AppHeaderAxl() {
    const { user }     = useContext(AuthContext)
    const navigate     = useNavigate()
    const { pathname } = useLocation()
    const onProfile    = pathname === '/profile'

    const ticksRef  = useRef(null)
    const streamRef = useRef(null)
    const msgRef    = useRef(null)
    const textRef   = useRef(null)
    const tagRef    = useRef(null)

    // OAuth redirect handoff — same as the classic header.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (params.get('broker') === 'connected') {
            window.history.replaceState({}, '', window.location.pathname)
            navigate('/profile')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only OAuth redirect; navigate is stable
    }, [])

    // ── ambient aurora candlesticks (built once into the .ticks svg) ──
    useEffect(() => {
        const wrap = ticksRef.current
        if (!wrap) return
        const NS = 'http://www.w3.org/2000/svg'
        const W = 1200, base = 50            // viewBox width + waterline
        const hues = ['c-green', 'c-teal', 'c-cyan', 'c-violet']
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        const svg = document.createElementNS(NS, 'svg')
        svg.setAttribute('viewBox', `0 0 ${W} 60`)
        svg.setAttribute('preserveAspectRatio', 'none')

        let i = 0
        for (let x = 22; x <= W - 12; x += 42, i++) {
            const h = 8 + Math.round(Math.random() * 22)
            const top = base - h
            const wickUp = 2 + Math.round(Math.random() * 6)
            const wickDn = 2 + Math.round(Math.random() * 4)

            const g = document.createElementNS(NS, 'g')
            g.setAttribute('class', 'grp ' + hues[i % hues.length])
            if (!reduce) {
                g.style.setProperty('--dur', (6 + Math.random() * 4).toFixed(2) + 's')
                g.style.animationDelay = (-Math.random() * 9).toFixed(2) + 's'
            }

            const wick = document.createElementNS(NS, 'line')
            wick.setAttribute('class', 'wick')
            wick.setAttribute('x1', x); wick.setAttribute('x2', x)
            wick.setAttribute('y1', top - wickUp); wick.setAttribute('y2', base + wickDn)

            const body = document.createElementNS(NS, 'rect')
            body.setAttribute('class', 'candle')
            body.setAttribute('x', x - 1.5); body.setAttribute('y', top)
            body.setAttribute('width', 3); body.setAttribute('height', h)
            body.setAttribute('rx', 0.8)

            g.appendChild(wick); g.appendChild(body)
            svg.appendChild(g)
        }
        wrap.appendChild(svg)
        return () => { wrap.removeChild(svg) }
    }, [])

    // ── centered axl stream: messages arrive one at a time and fade ──
    useEffect(() => {
        const stream = streamRef.current
        const msg    = msgRef.current
        const text   = textRef.current
        const tag    = tagRef.current
        if (!stream || !msg || !text || !tag) return

        const paint = it => {
            text.textContent = it.t
            tag.textContent  = it.who === 'axl' ? 'axl' : 'you'
            stream.classList.toggle('axl', it.who === 'axl')
            stream.classList.toggle('user', it.who === 'user')
        }

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            paint(STREAM[1]); msg.classList.add('show')
            return
        }

        let i = 0
        let t1, t2
        const step = () => {
            const it = STREAM[i % STREAM.length]
            const hold = it.who === 'axl' ? 3200 : 2300   // replies linger a touch longer
            paint(it)
            msg.classList.add('show')                          // arrive
            t1 = setTimeout(() => msg.classList.remove('show'), hold)   // fade
            t2 = setTimeout(() => { i++; step() }, hold + 850)         // next
        }
        const startT = setTimeout(step, 600)
        return () => { clearTimeout(startT); clearTimeout(t1); clearTimeout(t2) }
    }, [])

    return (
        <header className="app-header-axl full">
            {/* ambient breathing candlesticks */}
            <div className="app-header-axl__ticks" ref={ticksRef} aria-hidden="true" />

            <div className="app-header-axl__inner">
                {/* brand — axl meditating bot */}
                <button
                    className="app-header-axl__brand"
                    onClick={() => navigate('/')}
                    aria-label="axl home"
                >
                    <svg className="app-header-axl__mark" viewBox="0 0 44 44" aria-hidden="true">
                        <defs>
                            <radialGradient id="axlBotAura" cx="50%" cy="44%" r="62%">
                                <stop offset="0"   stopColor="#5BCBC0" stopOpacity="0.20" />
                                <stop offset="0.6" stopColor="#74C9AE" stopOpacity="0.10" />
                                <stop offset="1"   stopColor="#9E9BE3" stopOpacity="0.13" />
                            </radialGradient>
                            <linearGradient id="axlBotRing" gradientUnits="userSpaceOnUse" x1="6" y1="6" x2="38" y2="38">
                                <stop offset="0"   stopColor="#7FD69E" />
                                <stop offset="0.5" stopColor="#5FB9D9" />
                                <stop offset="1"   stopColor="#9E9BE3" />
                            </linearGradient>
                        </defs>
                        <circle className="aura" cx="22" cy="22" r="20" />
                        <circle className="ring" cx="22" cy="22" r="20" />
                        {/* antenna */}
                        <line className="bot" x1="22" y1="9.3" x2="22" y2="7.3" />
                        <circle className="bot" cx="22" cy="6.1" r="1.1" />
                        {/* head */}
                        <rect className="bot" x="15.5" y="9.5" width="13" height="10" rx="3.6" />
                        {/* closed, content eyes (meditating) */}
                        <path className="bot" d="M18,14 q1.7,1.4 3.4,0" />
                        <path className="bot" d="M22.6,14 q1.7,1.4 3.4,0" />
                        {/* arms resting */}
                        <path className="bot" d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
                        <path className="bot" d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
                        {/* crossed legs / lotus base */}
                        <path className="bot" d="M13,30 Q22,26.2 31,30" />
                        <path className="bot" d="M14,30.5 Q22,34.6 30,30.5" />
                        <path className="bot" d="M19.4,31 L24.6,33.4" />
                        <path className="bot" d="M24.6,31 L19.4,33.4" />
                    </svg>
                    <span className="app-header-axl__brand-text">
                        <span className="app-header-axl__wordmark"><b>a</b>xl</span>
                        <svg className="app-header-axl__rule" viewBox="0 0 40 5" preserveAspectRatio="none" aria-hidden="true">
                            <path d="M0,3 Q10,0 20,3 T40,3" />
                        </svg>
                    </span>
                </button>

                {/* centered AI stream */}
                <div className="app-header-axl__stream user" ref={streamRef} aria-hidden="true">
                    <span className="msg" ref={msgRef}>
                        <span className="msg-tag" ref={tagRef}>you</span>
                        <span className="msg-text" ref={textRef} />
                    </span>
                </div>

                {/* right cluster */}
                <div className="app-header-axl__right">
                    {user && (
                        <>
                            {onProfile ? (
                                <button
                                    className="app-header-axl__back"
                                    onClick={() => navigate('/')}
                                    title="Back to Trading"
                                    aria-label="Back to Trading"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M20 12H6" />
                                        <path d="M12 5l-7 7 7 7" />
                                    </svg>
                                </button>
                            ) : (
                                <button
                                    className="app-header-axl__profile"
                                    onClick={() => navigate('/profile')}
                                    title={`${user.fullname} — view profile`}
                                    aria-label={`${user.fullname} — view profile`}
                                >
                                    <span className="app-header-axl__avatar">{initials(user.fullname)}</span>
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* signature calm-water wave, running across the header's middle height */}
            <div className="app-header-axl__edge" aria-hidden="true">
                <svg viewBox="0 0 1200 22" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="axlWaveHues" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="0" spreadMethod="repeat">
                            <stop offset="0"    stopColor="#7FD69E" />
                            <stop offset="0.22" stopColor="#74C9AE" />
                            <stop offset="0.44" stopColor="#5BCBC0" />
                            <stop offset="0.66" stopColor="#5FB9D9" />
                            <stop offset="0.86" stopColor="#9E9BE3" />
                            <stop offset="1"    stopColor="#7FD69E" />
                        </linearGradient>
                    </defs>
                    <path className="wv wv-mirror" d="M0,15 Q30,19 60,15 T120,15 T180,15 T240,15 T300,15 T360,15 T420,15 T480,15 T540,15 T600,15 T660,15 T720,15 T780,15 T840,15 T900,15 T960,15 T1020,15 T1080,15 T1140,15 T1200,15" />
                    <path className="wv wv-main"   d="M0,11 Q30,6 60,11 T120,11 T180,11 T240,11 T300,11 T360,11 T420,11 T480,11 T540,11 T600,11 T660,11 T720,11 T780,11 T840,11 T900,11 T960,11 T1020,11 T1080,11 T1140,11 T1200,11" />
                </svg>
            </div>
        </header>
    )
}
