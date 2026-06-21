// The axl brand's meditating-bot mark, stripped of its aura + ring circle/background
// — just the bot figure (antenna, head, content eyes, resting arms, lotus base).
// Paints with currentColor so it adopts the host's icon colour. viewBox is cropped
// tight to the figure so it fills a small title-icon slot.
export function MeditatingBot({ className = '' }) {
    return (
        <svg
            className={className}
            width="100%"
            height="100%"
            viewBox="11 4 22 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* antenna */}
            <line x1="22" y1="9.3" x2="22" y2="7.3" />
            <circle cx="22" cy="6.1" r="1.1" />
            {/* head */}
            <rect x="15.5" y="9.5" width="13" height="10" rx="3.6" />
            {/* closed, content eyes (meditating) */}
            <path d="M18,14 q1.7,1.4 3.4,0" />
            <path d="M22.6,14 q1.7,1.4 3.4,0" />
            {/* arms resting */}
            <path d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
            <path d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
            {/* crossed legs / lotus base */}
            <path d="M13,30 Q22,26.2 31,30" />
            <path d="M14,30.5 Q22,34.6 30,30.5" />
            <path d="M19.4,31 L24.6,33.4" />
            <path d="M24.6,31 L19.4,33.4" />
        </svg>
    )
}
