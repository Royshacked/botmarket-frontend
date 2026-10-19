import PropTypes from 'prop-types'

/**
 * Axl's mark and greeting — the empty chat's first line (lifted from the old hub, phase 7). The gradient ids
 * are namespaced so a second copy on the page (the history drawer) cannot borrow the first one's.
 */
export function AxlGreeting({ name = '', question = null }) {
    return (
        <div className="chat-timeline__intro">
            <svg className="chat-timeline__mark" viewBox="0 0 44 44" aria-hidden="true">
                <defs>
                    <radialGradient id="chatTimelineAura" cx="50%" cy="44%" r="62%">
                        <stop offset="0"   style={{ stopColor: 'var(--accent-light)', stopOpacity: 0.20 }} />
                        <stop offset="0.6" style={{ stopColor: 'var(--accent)',       stopOpacity: 0.10 }} />
                        <stop offset="1"   style={{ stopColor: 'var(--accent-light)', stopOpacity: 0.13 }} />
                    </radialGradient>
                    <linearGradient id="chatTimelineRing" gradientUnits="userSpaceOnUse" x1="6" y1="6" x2="38" y2="38">
                        <stop offset="0"   style={{ stopColor: 'var(--accent-bright)' }} />
                        <stop offset="0.5" style={{ stopColor: 'var(--accent-light)' }} />
                        <stop offset="1"   style={{ stopColor: 'var(--accent)' }} />
                    </linearGradient>
                </defs>
                <circle className="chat-timeline__aura" cx="22" cy="22" r="20" />
                <circle className="chat-timeline__ring" cx="22" cy="22" r="20" />
                <line className="chat-timeline__bot" x1="22" y1="9.3" x2="22" y2="7.3" />
                <circle className="chat-timeline__bot" cx="22" cy="6.1" r="1.1" />
                <rect className="chat-timeline__bot" x="15.5" y="9.5" width="13" height="10" rx="3.6" />
                <path className="chat-timeline__bot" d="M18,14 q1.7,1.4 3.4,0" />
                <path className="chat-timeline__bot" d="M22.6,14 q1.7,1.4 3.4,0" />
                <path className="chat-timeline__bot" d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
                <path className="chat-timeline__bot" d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
                <path className="chat-timeline__bot" d="M13,30 Q22,26.2 31,30" />
                <path className="chat-timeline__bot" d="M14,30.5 Q22,34.6 30,30.5" />
                <path className="chat-timeline__bot" d="M19.4,31 L24.6,33.4" />
                <path className="chat-timeline__bot" d="M24.6,31 L19.4,33.4" />
            </svg>
            <h2 className="chat-timeline__greeting">
                Hi{name ? ` ${name}` : ''}, I&apos;m <span className="chat-timeline__wordmark"><b>A</b>xl</span>.
            </h2>
            {question && <p className="chat-timeline__question">{question}</p>}
        </div>
    )
}

AxlGreeting.propTypes = {
    name:     PropTypes.string,
    question: PropTypes.string,
}
