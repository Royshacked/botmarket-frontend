import { useContext, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'

// ── Static inline-SVG space background ───────────────────────────────────────
function HeaderBackground() {
    return (
        <svg
            className="app-header__bg"
            viewBox="0 0 1400 64"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <defs>
                {/* ── Base gradient — deep navy ── */}
                <linearGradient id="hdr-bg" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="#020810"/>
                    <stop offset="40%"  stopColor="#040d1c"/>
                    <stop offset="100%" stopColor="#071528"/>
                </linearGradient>

                {/* ── Nebula glow around flare (centred ~x=580) ── */}
                <radialGradient id="hdr-neb1" cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor="#1a3a80" stopOpacity="0.45"/>
                    <stop offset="60%"  stopColor="#0a1e50" stopOpacity="0.18"/>
                    <stop offset="100%" stopColor="#020810" stopOpacity="0"/>
                </radialGradient>
                <radialGradient id="hdr-neb2" cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor="#1040aa" stopOpacity="0.28"/>
                    <stop offset="100%" stopColor="#020810" stopOpacity="0"/>
                </radialGradient>

                {/* ── Streak / comet trail ── */}
                <linearGradient id="hdr-streak"
                    gradientUnits="userSpaceOnUse"
                    x1="100" y1="62" x2="900" y2="6">
                    <stop offset="0%"   stopColor="#ffffff" stopOpacity="0"/>
                    <stop offset="38%"  stopColor="#88aaff" stopOpacity="0.35"/>
                    <stop offset="55%"  stopColor="#ffffff" stopOpacity="0.85"/>
                    <stop offset="72%"  stopColor="#88aaff" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
                </linearGradient>
                <linearGradient id="hdr-streak-glow"
                    gradientUnits="userSpaceOnUse"
                    x1="100" y1="62" x2="900" y2="6">
                    <stop offset="0%"   stopColor="#4466cc" stopOpacity="0"/>
                    <stop offset="40%"  stopColor="#4466cc" stopOpacity="0.5"/>
                    <stop offset="55%"  stopColor="#aabbff" stopOpacity="0.9"/>
                    <stop offset="70%"  stopColor="#4466cc" stopOpacity="0.4"/>
                    <stop offset="100%" stopColor="#4466cc" stopOpacity="0"/>
                </linearGradient>

                {/* ── Lens flare core ── */}
                <radialGradient id="hdr-flare" cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor="#ffffff" stopOpacity="1"/>
                    <stop offset="18%"  stopColor="#bbccff" stopOpacity="0.7"/>
                    <stop offset="45%"  stopColor="#2244aa" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="#020810" stopOpacity="0"/>
                </radialGradient>

                {/* ── Planet ── */}
                <radialGradient id="hdr-planet" cx="32%" cy="28%" r="72%">
                    <stop offset="0%"   stopColor="#4a9acc"/>
                    <stop offset="40%"  stopColor="#1a5080"/>
                    <stop offset="75%"  stopColor="#0e2d4a"/>
                    <stop offset="100%" stopColor="#060f1a"/>
                </radialGradient>
                <radialGradient id="hdr-planet-atm" cx="50%" cy="50%" r="50%">
                    <stop offset="70%"  stopColor="#3377aa" stopOpacity="0"/>
                    <stop offset="100%" stopColor="#3399ff" stopOpacity="0.4"/>
                </radialGradient>

                {/* ── Filters ── */}
                <filter id="hdr-glow-star" x="-150%" y="-150%" width="400%" height="400%">
                    <feGaussianBlur stdDeviation="0.9" result="b"/>
                    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="hdr-blur-streak" x="-10%" y="-200%" width="120%" height="500%">
                    <feGaussianBlur stdDeviation="1.8"/>
                </filter>
                <filter id="hdr-blur-h" x="-30%" y="-300%" width="160%" height="700%">
                    <feGaussianBlur stdDeviation="2"/>
                </filter>
                <filter id="hdr-blur-v" x="-300%" y="-30%" width="700%" height="160%">
                    <feGaussianBlur stdDeviation="1.2"/>
                </filter>

                {/* ── Ring clip paths (planet cx=1170, cy=33) ── */}
                <clipPath id="hdr-ring-back">
                    <rect x="1142" y="26" width="56" height="8"/>
                </clipPath>
                <clipPath id="hdr-ring-front">
                    <rect x="1142" y="33" width="56" height="9"/>
                </clipPath>
            </defs>

            {/* ════ Background ════ */}
            <rect width="1400" height="64" fill="url(#hdr-bg)"/>

            {/* ════ Nebula — soft glow around the flare area ════ */}
            <ellipse cx="580" cy="32" rx="340" ry="54" fill="url(#hdr-neb1)"/>
            <ellipse cx="440" cy="24" rx="180" ry="32" fill="url(#hdr-neb2)" opacity="0.6"/>
            <ellipse cx="720" cy="42" rx="150" ry="26" fill="url(#hdr-neb2)" opacity="0.35"/>

            {/* ════ Tiny background stars ════ */}
            <circle cx="22"   cy="9"  r="0.5" fill="#fff"    opacity="0.20"/>
            <circle cx="58"   cy="42" r="0.6" fill="#fff"    opacity="0.18"/>
            <circle cx="88"   cy="18" r="0.5" fill="#cce"    opacity="0.22"/>
            <circle cx="130"  cy="54" r="0.5" fill="#fff"    opacity="0.17"/>
            <circle cx="168"  cy="11" r="0.6" fill="#fff"    opacity="0.21"/>
            <circle cx="205"  cy="47" r="0.5" fill="#ccddff" opacity="0.19"/>
            <circle cx="248"  cy="28" r="0.6" fill="#fff"    opacity="0.20"/>
            <circle cx="290"  cy="6"  r="0.5" fill="#fff"    opacity="0.18"/>
            <circle cx="328"  cy="55" r="0.7" fill="#ccddff" opacity="0.22"/>
            <circle cx="365"  cy="34" r="0.5" fill="#fff"    opacity="0.17"/>
            <circle cx="408"  cy="14" r="0.6" fill="#fff"    opacity="0.21"/>
            <circle cx="448"  cy="50" r="0.5" fill="#ccddff" opacity="0.19"/>
            <circle cx="495"  cy="22" r="0.6" fill="#fff"    opacity="0.20"/>
            <circle cx="540"  cy="58" r="0.5" fill="#fff"    opacity="0.18"/>
            <circle cx="578"  cy="8"  r="0.7" fill="#ccddff" opacity="0.22"/>
            <circle cx="618"  cy="44" r="0.5" fill="#fff"    opacity="0.17"/>
            <circle cx="658"  cy="19" r="0.6" fill="#fff"    opacity="0.21"/>
            <circle cx="695"  cy="53" r="0.5" fill="#ccddff" opacity="0.19"/>
            <circle cx="738"  cy="12" r="0.6" fill="#fff"    opacity="0.20"/>
            <circle cx="778"  cy="38" r="0.5" fill="#fff"    opacity="0.18"/>
            <circle cx="818"  cy="60" r="0.7" fill="#ccddff" opacity="0.22"/>
            <circle cx="858"  cy="25" r="0.5" fill="#fff"    opacity="0.17"/>
            <circle cx="898"  cy="47" r="0.6" fill="#fff"    opacity="0.21"/>
            <circle cx="938"  cy="8"  r="0.5" fill="#ccddff" opacity="0.19"/>
            <circle cx="978"  cy="33" r="0.6" fill="#fff"    opacity="0.20"/>
            <circle cx="1018" cy="56" r="0.5" fill="#fff"    opacity="0.18"/>
            <circle cx="1058" cy="16" r="0.7" fill="#ccddff" opacity="0.22"/>
            <circle cx="1098" cy="42" r="0.5" fill="#fff"    opacity="0.17"/>
            <circle cx="1138" cy="9"  r="0.6" fill="#fff"    opacity="0.21"/>
            <circle cx="1178" cy="51" r="0.5" fill="#ccddff" opacity="0.19"/>
            <circle cx="1218" cy="27" r="0.6" fill="#fff"    opacity="0.20"/>
            <circle cx="1258" cy="58" r="0.5" fill="#fff"    opacity="0.18"/>
            <circle cx="1298" cy="13" r="0.7" fill="#ccddff" opacity="0.22"/>
            <circle cx="1338" cy="40" r="0.5" fill="#fff"    opacity="0.17"/>
            <circle cx="1378" cy="22" r="0.6" fill="#fff"    opacity="0.21"/>
            <circle cx="38"   cy="60" r="0.5" fill="#ccddff" opacity="0.19"/>
            <circle cx="112"  cy="32" r="0.6" fill="#fff"    opacity="0.20"/>
            <circle cx="185"  cy="58" r="0.5" fill="#fff"    opacity="0.18"/>
            <circle cx="270"  cy="42" r="0.7" fill="#ccddff" opacity="0.22"/>
            <circle cx="352"  cy="16" r="0.5" fill="#fff"    opacity="0.17"/>
            <circle cx="472"  cy="36" r="0.6" fill="#fff"    opacity="0.21"/>
            <circle cx="558"  cy="52" r="0.5" fill="#ccddff" opacity="0.19"/>
            <circle cx="640"  cy="30" r="0.6" fill="#fff"    opacity="0.20"/>
            <circle cx="718"  cy="5"  r="0.5" fill="#fff"    opacity="0.18"/>
            <circle cx="798"  cy="47" r="0.7" fill="#ccddff" opacity="0.22"/>

            {/* ════ Medium stars ════ */}
            <circle cx="42"   cy="28" r="1.0" fill="#fff"    opacity="0.46"/>
            <circle cx="118"  cy="14" r="1.1" fill="#dde8ff" opacity="0.50"/>
            <circle cx="195"  cy="48" r="0.9" fill="#fff"    opacity="0.48"/>
            <circle cx="278"  cy="22" r="1.2" fill="#ccddff" opacity="0.45"/>
            <circle cx="358"  cy="52" r="1.0" fill="#fff"    opacity="0.52"/>
            <circle cx="430"  cy="9"  r="1.1" fill="#dde8ff" opacity="0.48"/>
            <circle cx="512"  cy="40" r="1.0" fill="#fff"    opacity="0.46"/>
            <circle cx="592"  cy="16" r="0.9" fill="#ccddff" opacity="0.50"/>
            <circle cx="672"  cy="50" r="1.1" fill="#fff"    opacity="0.45"/>
            <circle cx="748"  cy="28" r="1.0" fill="#dde8ff" opacity="0.52"/>
            <circle cx="828"  cy="10" r="1.2" fill="#fff"    opacity="0.48"/>
            <circle cx="908"  cy="44" r="1.0" fill="#ccddff" opacity="0.46"/>
            <circle cx="988"  cy="20" r="0.9" fill="#fff"    opacity="0.50"/>
            <circle cx="1068" cy="52" r="1.1" fill="#dde8ff" opacity="0.45"/>
            <circle cx="1148" cy="14" r="1.0" fill="#fff"    opacity="0.52"/>
            <circle cx="1228" cy="44" r="1.2" fill="#ccddff" opacity="0.48"/>
            <circle cx="1308" cy="26" r="1.0" fill="#fff"    opacity="0.46"/>
            <circle cx="1368" cy="55" r="0.9" fill="#dde8ff" opacity="0.50"/>

            {/* ════ Diagonal comet streak ════ */}
            {/* Glow layer */}
            <line x1="100" y1="62" x2="900" y2="6"
                  stroke="url(#hdr-streak-glow)" strokeWidth="5"
                  filter="url(#hdr-blur-streak)" opacity="0.7"/>
            {/* Bright core line */}
            <line x1="100" y1="62" x2="900" y2="6"
                  stroke="url(#hdr-streak)" strokeWidth="0.9" opacity="1"/>

            {/* ════ Lens flare — disabled; change false→true to restore ════ */}
            {false && <>
                {/* Outer halo */}
                <ellipse cx="580" cy="32" rx="80" ry="46" fill="url(#hdr-flare)" opacity="0.38"/>
                <ellipse cx="580" cy="32" rx="32" ry="20" fill="url(#hdr-flare)" opacity="0.60"/>

                {/* Horizontal spike — soft glow */}
                <line x1="410" y1="32" x2="750" y2="32"
                      stroke="#aabbff" strokeWidth="2.5" opacity="0.35"
                      filter="url(#hdr-blur-h)"/>
                {/* Horizontal spike — bright core */}
                <line x1="470" y1="32" x2="690" y2="32"
                      stroke="#ffffff" strokeWidth="0.7" opacity="0.92"/>

                {/* Vertical spike — soft glow */}
                <line x1="580" y1="1"  x2="580" y2="63"
                      stroke="#aabbff" strokeWidth="1.8" opacity="0.3"
                      filter="url(#hdr-blur-v)"/>
                {/* Vertical spike — bright core */}
                <line x1="580" y1="8"  x2="580" y2="56"
                      stroke="#ffffff" strokeWidth="0.5" opacity="0.85"/>

                {/* Diagonal spike NW–SE */}
                <line x1="532" y1="0"  x2="628" y2="64"
                      stroke="#6677cc" strokeWidth="1" opacity="0.3"
                      filter="url(#hdr-blur-v)"/>
                {/* Diagonal spike NE–SW */}
                <line x1="628" y1="0"  x2="532" y2="64"
                      stroke="#6677cc" strokeWidth="1" opacity="0.3"
                      filter="url(#hdr-blur-v)"/>

                {/* Flare core */}
                <circle cx="580" cy="32" r="5"   fill="url(#hdr-flare)" opacity="0.95"/>
                <circle cx="580" cy="32" r="2.2" fill="#ffffff"          opacity="1"/>
                <circle cx="580" cy="32" r="0.9" fill="#ffffff"          opacity="1"/>
            </>}

            {/* ════ Bright sparkle stars ════ */}
            <g transform="translate(148,14)" filter="url(#hdr-glow-star)">
                <path d="M0,-4 C.5,-.5 .5,-.5 4,0 C.5,.5 .5,.5 0,4 C-.5,.5 -.5,.5 -4,0 C-.5,-.5 -.5,-.5 0,-4Z" fill="#fff" opacity="0.92"/>
                <circle r="0.9" fill="#fff"/>
            </g>
            <g transform="translate(345,48)" filter="url(#hdr-glow-star)">
                <path d="M0,-5.5 C.6,-.6 .6,-.6 5.5,0 C.6,.6 .6,.6 0,5.5 C-.6,.6 -.6,.6 -5.5,0 C-.6,-.6 -.6,-.6 0,-5.5Z" fill="#ddeeff" opacity="0.88"/>
                <circle r="1.1" fill="#fff"/>
            </g>
            <g transform="translate(762,14)" filter="url(#hdr-glow-star)">
                <path d="M0,-4.5 C.55,-.55 .55,-.55 4.5,0 C.55,.55 .55,.55 0,4.5 C-.55,.55 -.55,.55 -4.5,0 C-.55,-.55 -.55,-.55 0,-4.5Z" fill="#fff" opacity="0.90"/>
                <circle r="0.9" fill="#fff"/>
            </g>
            <g transform="translate(892,50)" filter="url(#hdr-glow-star)">
                <path d="M0,-5 C.6,-.6 .6,-.6 5,0 C.6,.6 .6,.6 0,5 C-.6,.6 -.6,.6 -5,0 C-.6,-.6 -.6,-.6 0,-5Z" fill="#ccddff" opacity="0.88"/>
                <circle r="1.0" fill="#fff"/>
            </g>
            <g transform="translate(1042,18)" filter="url(#hdr-glow-star)">
                <path d="M0,-4 C.5,-.5 .5,-.5 4,0 C.5,.5 .5,.5 0,4 C-.5,.5 -.5,.5 -4,0 C-.5,-.5 -.5,-.5 0,-4Z" fill="#fff" opacity="0.92"/>
                <circle r="0.9" fill="#fff"/>
            </g>
            <g transform="translate(1298,46)" filter="url(#hdr-glow-star)">
                <path d="M0,-5 C.6,-.6 .6,-.6 5,0 C.6,.6 .6,.6 0,5 C-.6,.6 -.6,.6 -5,0 C-.6,-.6 -.6,-.6 0,-5Z" fill="#ddeeff" opacity="0.86"/>
                <circle r="1.0" fill="#fff"/>
            </g>

            {/* ════ Ringed planet (right side, cx=1170) ════ */}
            {/* Ring back half */}
            <ellipse cx="1170" cy="33" rx="24" ry="6"
                     fill="none" stroke="#2a5888" strokeWidth="2.5"
                     clipPath="url(#hdr-ring-back)" opacity="0.42"/>
            {/* Planet body */}
            <circle cx="1170" cy="33" r="14" fill="url(#hdr-planet)"/>
            {/* Atmosphere rim */}
            <circle cx="1170" cy="33" r="14" fill="url(#hdr-planet-atm)"/>
            {/* Edge specular */}
            <circle cx="1170" cy="33" r="14"
                    fill="none" stroke="#4488bb" strokeWidth="0.8" opacity="0.5"/>
            {/* Ring front half */}
            <ellipse cx="1170" cy="33" rx="24" ry="6"
                     fill="none" stroke="#5599cc" strokeWidth="3"
                     clipPath="url(#hdr-ring-front)" opacity="0.72"/>
        </svg>
    )
}

export function AppHeader() {
	const { user }   = useContext(AuthContext)
	const navigate   = useNavigate()
	const { pathname } = useLocation()
	const onProfile  = pathname === '/profile'

	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		if (params.get('broker') === 'connected') {
			window.history.replaceState({}, '', window.location.pathname)
			navigate('/profile')
		}
	}, [])

	return (
		<header className="app-header full">
			<div className="app-header__bg-wrap">
				<HeaderBackground />
			</div>

			<div className="app-header__brand">
				<img
					className="app-header__logo"
					src="/img/bot-market-logo.png"
					alt="AR2TRADE"
					width={80}
					height={80}
				/>
				<h1>AR2TRADE</h1>
			</div>

			{user && (
				<div className="app-header__user-wrap">
					{onProfile
						? <button className="app-header__user" onClick={() => navigate('/')}>
							← Back to Trading
						  </button>
						: <button className="app-header__user" onClick={() => navigate('/profile')}>
							👤 {user.fullname}
						  </button>
					}
				</div>
			)}
		</header>
	)
}
