import { useEffect, useState } from 'react'

// ── MarketClocks · four 24-hour session dials for the AppHeader ────────────────
// One compact radial clock per region. On each dial the trading session is drawn
// as an arc (midnight at top, clockwise), and a single hand marks the current
// LOCAL time in that region. Open → the arc + hand glow in the accent; closed →
// the arc stays visible (so the range still reads) but dims and the hand greys.
//
// Self-contained pure time-math, mirroring services/market.service.js on the
// backend — but that route is per-symbol and ET-only, so per-region local time
// and the Europe/Asia envelopes are computed here via Intl. No network, no props.
//
// Regions (parent-chosen references): NASDAQ (New York), Chicago index futures,
// Europe anchored to London (first to open), Asia anchored to Tokyo (first to open).

// Minutes-from-local-midnight session envelopes, in each region's own timezone. Faces
// are a shared accent gradient (mirroring the axl bot mark) with accent hands + a sun
// dot at 12 — see AppHeaderAxl.scss. `deco` picks the on-face marker (all 'sun' today).
const REGIONS = [
    // NASDAQ RTH 09:30–16:00 ET, weekdays. New York — steel + royal blue, blocky batons.
    { key: 'nasdaq', label: 'NASDAQ', city: 'New York', tz: 'America/New_York', open: 570, close: 960, deco: 'sun' },
    // CME equity-index futures: Sun 17:00 → Fri 16:00 CT, daily 16:00–17:00 break. Chicago — sky + flag stars.
    { key: 'chicago', label: 'CHI·FUT', city: 'Chicago', tz: 'America/Chicago', futures: true, deco: 'sun' },
    // Europe envelope anchored to London: LSE 08:00–16:30, weekdays. London — cream + gold, Roman numerals.
    { key: 'europe', label: 'EUROPE', city: 'London', tz: 'Europe/London', open: 480, close: 990, deco: 'sun' },
    // Asia envelope anchored to Tokyo: TSE open (09:00) → Hong Kong close (~17:00 JST), weekdays. Tokyo — white + red sun.
    { key: 'asia', label: 'ASIA', city: 'Tokyo', tz: 'Asia/Tokyo', open: 540, close: 1020, deco: 'sun' },
]

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const WD_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Current wall-clock in a timezone → { minutes since midnight, weekday index, "HH:MM" }.
function localParts(tz, now) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit',
    }).formatToParts(now)
    const get = t => parts.find(p => p.type === t)?.value
    let hh = parseInt(get('hour'), 10)
    if (hh === 24) hh = 0                       // some engines emit "24" at midnight
    const mm = parseInt(get('minute'), 10)
    return { minutes: hh * 60 + mm, day: WD[get('weekday')], hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }
}

// Is the region trading right now, given its local time?
function isOpenNow(r, { minutes, day }) {
    if (r.futures) {
        if (day === 6) return false                              // Saturday
        if (day === 0) return minutes >= 1020                    // Sunday: reopens 17:00 CT
        if (day === 5) return minutes < 960                      // Friday: closes 16:00 CT
        return minutes < 960 || minutes >= 1020                  // Mon–Thu: closed only 16:00–17:00
    }
    if (day === 0 || day === 6) return false                     // weekday equity sessions
    return minutes >= r.open && minutes < r.close
}

// 12h analog geometry: 12 at top, clockwise. viewBox 36×36, center 18. `fraction` is
// a 0–1 position around the face (0 = 12 o'clock), so the hour hand uses (m%720)/720
// and the minute hand (m%60)/60.
const C = 18
function handPoint(fraction, radius) {
    const a = (fraction * 360 - 90) * Math.PI / 180
    return [C + radius * Math.cos(a), C + radius * Math.sin(a)]
}

// The trading session as an arc on the 12h face. Both endpoints project onto the same
// dial the hands use (min % 720), so an equity session reads as a clean daytime arc
// crossing noon; futures (17:00→16:00) sweeps nearly the whole ring. The AM/PM marker
// tells you which half of the day the hands are in, so the projection isn't ambiguous.
function sessionFractions(r) {
    const [s, e] = r.futures ? [1020, 960] : [r.open, r.close]   // 17:00→16:00 for futures
    return [(s % 720) / 720, (e % 720) / 720]
}
function arcPath(startFrac, endFrac, radius) {
    let sweep = endFrac - startFrac
    if (sweep < 0) sweep += 1
    const largeArc = sweep > 0.5 ? 1 : 0
    const [x1, y1] = handPoint(startFrac, radius)
    const [x2, y2] = handPoint(endFrac, radius)
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

// The four cardinal hour positions (12/3/6/9) used by the per-city decorations.
const CARDINALS = [{ frac: 0, roman: 'XII' }, { frac: 0.25, roman: 'III' }, { frac: 0.5, roman: 'VI' }, { frac: 0.75, roman: 'IX' }]

// Points for an n-pointed star centred at (cx, cy), alternating outer/inner radius —
// used for Chicago's flag stars (n = 6).
function starPoints(cx, cy, outer, inner, n = 6) {
    const pts = []
    for (let i = 0; i < n * 2; i++) {
        const rad = i % 2 === 0 ? outer : inner
        const a = (i / (n * 2)) * 2 * Math.PI - Math.PI / 2
        pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`)
    }
    return pts.join(' ')
}

function fmt(min) {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

// Next open↔close flip from the region's current local time. Steps minute-by-minute
// through the week in wall-clock space (cheap int math, no Intl in the loop). DST can
// shift a transition by up to an hour — the same approximation the backend makes.
function nextTransition(r, { minutes, day }) {
    const openNow = isOpenNow(r, { minutes, day })
    const start = day * 1440 + minutes
    for (let k = 1; k <= 7 * 1440; k++) {
        const wm = (start + k) % (7 * 1440)
        const probe = { day: Math.floor(wm / 1440), minutes: wm % 1440 }
        if (isOpenNow(r, probe) !== openNow) return { opening: !openNow, deltaMin: k, ...probe }
    }
    return null   // a 24/7 market — none of ours
}

function fmtDelta(min) {
    const h = Math.floor(min / 60), m = min % 60
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
    if (h > 0)   return m ? `${h}h ${m}m` : `${h}h`
    return `${m}m`
}

// One-line status under the dial. Open → time to close; closed → time to open, or a
// weekday + time once the next open is more than ~12h out (past a weekend, say).
function statusLine(open, next) {
    if (open) return next ? `closes ${fmtDelta(next.deltaMin)}` : 'open'
    if (!next) return 'closed'
    return next.deltaMin < 720 ? `opens ${fmtDelta(next.deltaMin)}` : `opens ${WD_NAMES[next.day]} ${fmt(next.minutes)}`
}

export function MarketClocks() {
    // Re-render every 30s so the hand + open/closed state stay live (minute resolution).
    const [, setTick] = useState(0)
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 30_000)
        return () => clearInterval(id)
    }, [])

    const now = new Date()

    return (
        <div className="market-clocks" role="group" aria-label="World market sessions">
            {REGIONS.map(r => {
                const local = localParts(r.tz, now)
                const open = isOpenNow(r, local)
                const next = nextTransition(r, local)
                const status = statusLine(open, next)
                const range = r.futures ? '17:00–16:00' : `${fmt(r.open)}–${fmt(r.close)}`
                const [aStart, aEnd] = sessionFractions(r)
                const [mx, my] = handPoint((local.minutes % 60) / 60, 11)    // minute hand
                const [hx, hy] = handPoint((local.minutes % 720) / 720, 7)   // hour hand
                const meridiem = local.minutes >= 720 ? 'PM' : 'AM'
                const title = `${r.label} · ${r.city} ${local.hhmm} · ${open ? 'Open' : 'Closed'} · ${range}`

                return (
                    <div key={r.key} className={`market-clocks__item market-clocks__item--${r.key} ${open ? 'is-open' : 'is-closed'}`} title={title}>
                        <svg className="market-clocks__dial" viewBox="0 0 36 36" aria-hidden="true">
                            {/* gradient-hued face + ring, mirroring the axl meditating-bot mark */}
                            <defs>
                                <radialGradient id={`mcAura-${r.key}`} cx="50%" cy="44%" r="62%">
                                    <stop offset="0"   stopColor="var(--accent-light)" stopOpacity="0.34" />
                                    <stop offset="0.6" stopColor="var(--accent)"       stopOpacity="0.18" />
                                    <stop offset="1"   stopColor="var(--accent-light)" stopOpacity="0.22" />
                                </radialGradient>
                                <linearGradient id={`mcRing-${r.key}`} gradientUnits="userSpaceOnUse" x1="5" y1="5" x2="31" y2="31">
                                    <stop offset="0"   stopColor="var(--accent-bright)" />
                                    <stop offset="0.5" stopColor="var(--accent-light)" />
                                    <stop offset="1"   stopColor="var(--accent)" />
                                </linearGradient>
                            </defs>
                            <circle className="market-clocks__base" cx="18" cy="18" r="15.5" />
                            <circle className="market-clocks__face" cx="18" cy="18" r="15.5" fill={`url(#mcAura-${r.key})`} />
                            <circle className="market-clocks__ring" cx="18" cy="18" r="15.5" stroke={`url(#mcRing-${r.key})`} />
                            {/* trading session on the rim */}
                            <path className="market-clocks__arc" d={arcPath(aStart, aEnd, 14)} />
                            {/* 12 hour ticks — the four quarters read a touch longer. Per-city
                                decorations below may hide some of these (see AppHeaderAxl.scss). */}
                            {Array.from({ length: 12 }, (_, i) => {
                                const [ox, oy] = handPoint(i / 12, 13)
                                const [ix, iy] = handPoint(i / 12, i % 3 === 0 ? 11.4 : 12.2)
                                return <line key={i} className={`market-clocks__tick${i % 3 === 0 ? ' is-quarter' : ''}`}
                                             x1={ox.toFixed(2)} y1={oy.toFixed(2)} x2={ix.toFixed(2)} y2={iy.toFixed(2)} />
                            })}

                            {/* London — Roman numerals at the cardinals (Big Ben) */}
                            {r.deco === 'roman' && CARDINALS.map(c => {
                                const [x, y] = handPoint(c.frac, 10.6)
                                return <text key={c.roman} className="market-clocks__numeral" x={x.toFixed(2)} y={y.toFixed(2)}
                                             textAnchor="middle" dominantBaseline="central">{c.roman}</text>
                            })}
                            {/* Chicago — four six-point flag stars at the cardinals */}
                            {r.deco === 'stars' && CARDINALS.map(c => {
                                const [x, y] = handPoint(c.frac, 11.6)
                                return <polygon key={c.frac} className="market-clocks__star" points={starPoints(x, y, 2, 0.9)} />
                            })}
                            {/* Top marker doubles as the day-half cue: 12 in the morning, 24 in the afternoon */}
                            {r.deco === 'sun' && (() => {
                                const [x, y] = handPoint(0, 10.8)
                                return <text className="market-clocks__sun" x={x.toFixed(2)} y={y.toFixed(2)} textAnchor="middle" dominantBaseline="central">{meridiem === 'AM' ? '12' : '24'}</text>
                            })()}

                            <text className="market-clocks__label" x="18" y="11.6" textAnchor="middle" dominantBaseline="central">{r.label}</text>
                            <line className="market-clocks__hand market-clocks__hand--hour" x1="18" y1="18" x2={hx.toFixed(2)} y2={hy.toFixed(2)} />
                            <line className="market-clocks__hand market-clocks__hand--min" x1="18" y1="18" x2={mx.toFixed(2)} y2={my.toFixed(2)} />
                            <circle className="market-clocks__hub" cx="18" cy="18" r="1.4" />
                        </svg>
                        <span className="market-clocks__status">{status}</span>
                    </div>
                )
            })}
        </div>
    )
}
