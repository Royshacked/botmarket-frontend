// Illustrated agent badges — self-contained 200×200 SVG marks: a ringed figure drawn entirely
// in `currentColor`, so they inherit each context's color and react to the user's design/accent
// preference (no fixed blue coin). Component-only module (keeps Fast Refresh happy). Two contexts:
//   • agent badge  — the brand figure (idea / atlas / argus / kairos)
//   • notify badge — the monitoring persona shown in axl notification lists
//                    (ideas → Minos, calls → Hermes; atlas/argus reuse their agent figure)
// Axl has no badge; callers fall back to its line glyph.

// `bare` drops the surrounding ring and renders only the figure — used where we want just the
// mark (e.g. the chat-panel-header agents nav).
function Badge({ size = 24, title, children, bare = false }) {
    return (
        <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={title}
             className="agent-badge" fill="none" stroke="currentColor">
            {!bare && <circle cx="100" cy="100" r="95" strokeWidth="3" />}
            <g stroke="currentColor" strokeWidth={bare ? 7 : 5} strokeLinecap="round" strokeLinejoin="round">
                {children}
            </g>
        </svg>
    )
}

export function IdeaBadge(props) {
    return (
        <Badge {...props} title="Idea">
            <line x1="100" y1="44" x2="100" y2="34" />
            <line x1="70" y1="56" x2="63" y2="49" />
            <line x1="130" y1="56" x2="137" y2="49" />
            <line x1="55" y1="88" x2="45" y2="88" />
            <line x1="145" y1="88" x2="155" y2="88" />
            <circle cx="100" cy="88" r="32" />
            <polyline points="82,98 93,89 103,95 116,79" stroke="currentColor" />
            <polyline points="108,79 116,79 116,87" stroke="currentColor" />
            <line x1="86" y1="122" x2="114" y2="122" />
            <line x1="87" y1="129" x2="113" y2="129" />
            <path d="M90,136 L110,136 L106,147 L94,147 Z" />
        </Badge>
    )
}

export function AtlasBadge(props) {
    return (
        <Badge {...props} title="Atlas">
            <circle cx="100" cy="54" r="27" />
            <ellipse cx="100" cy="54" rx="27" ry="9.5" stroke="currentColor" />
            <ellipse cx="100" cy="54" rx="10.5" ry="27" />
            <circle cx="100" cy="103" r="12" />
            <path d="M84,120 C74,110 72,96 80,82" />
            <path d="M116,120 C126,110 128,96 120,82" />
            <path d="M84,120 L116,120" />
            <line x1="100" y1="115" x2="100" y2="150" />
            <path d="M100,150 L86,176" />
            <path d="M100,150 L114,176" />
        </Badge>
    )
}

export function ArgusBadge(props) {
    return (
        <Badge {...props} title="Argus">
            <path d="M56,100 Q100,68 144,100 Q100,132 56,100 Z" />
            <circle cx="100" cy="100" r="17" />
            <circle cx="100" cy="100" r="7.5" fill="currentColor" stroke="none" />
            <circle cx="106" cy="94" r="3" fill="currentColor" stroke="none" />
            <g strokeWidth="3.4">
                <g><circle cx="62" cy="66" r="6.5" /><circle cx="62" cy="66" r="2.4" fill="currentColor" stroke="none" /></g>
                <g><circle cx="138" cy="66" r="6.5" /><circle cx="138" cy="66" r="2.4" fill="currentColor" stroke="none" /></g>
                <g><circle cx="62" cy="134" r="6.5" /><circle cx="62" cy="134" r="2.4" fill="currentColor" stroke="none" /></g>
                <g><circle cx="138" cy="134" r="6.5" /><circle cx="138" cy="134" r="2.4" fill="currentColor" stroke="none" /></g>
            </g>
        </Badge>
    )
}

export function KairosBadge(props) {
    return (
        <Badge {...props} title="Kairos">
            <line x1="80" y1="60" x2="120" y2="60" />
            <line x1="80" y1="150" x2="120" y2="150" />
            <path d="M84,62 L116,62 L100,105 L116,148 L84,148 L100,105 Z" />
            <path d="M90,70 L110,70 L100,88 Z" fill="currentColor" stroke="none" />
            <line x1="100" y1="105" x2="100" y2="130" stroke="currentColor" />
            <path d="M91,144 L109,144 L100,127 Z" fill="currentColor" stroke="none" opacity="0.75" />
            <g strokeWidth="3.8">
                <path d="M80,74 C62,70 50,78 42,90" />
                <path d="M80,84 C64,82 54,88 47,98" />
                <path d="M80,94 C66,94 58,98 52,105" />
                <path d="M120,74 C138,70 150,78 158,90" />
                <path d="M120,84 C136,82 146,88 153,98" />
                <path d="M120,94 C134,94 142,98 148,105" />
            </g>
        </Badge>
    )
}

// Mentor — the assist desk. In the Odyssey, Mentor is Athena in disguise, so the mark is her owl:
// perched, patient, watching you trade rather than trading for you. Deliberately the only creature
// in the set — nothing else here can be mistaken for it at a glance.
export function MentorBadge(props) {
    return (
        <Badge {...props} title="Mentor">
            <path d="M100,60 C124,60 140,80 140,110 C140,144 122,164 100,164 C78,164 60,144 60,110 C60,80 76,60 100,60 Z" />
            <path d="M72,72 L66,44 L88,58" />
            <path d="M128,72 L134,44 L112,58" />
            <circle cx="83" cy="100" r="14" />
            <circle cx="117" cy="100" r="14" />
            <circle cx="83" cy="100" r="5" fill="currentColor" stroke="none" />
            <circle cx="117" cy="100" r="5" fill="currentColor" stroke="none" />
            <path d="M96,110 L104,110 L100,122 Z" fill="currentColor" stroke="none" />
            <g strokeWidth="3.8">
                <path d="M70,116 C70,138 76,152 84,160" />
                <path d="M130,116 C130,138 124,152 116,160" />
                <line x1="88" y1="163" x2="88" y2="172" />
                <line x1="112" y1="163" x2="112" y2="172" />
                <path d="M60,173 C82,177 118,177 140,173" />
            </g>
        </Badge>
    )
}

// Prometheus — the research desk. The stolen fire of forethought: one clean flame with its hot
// core, centred in the ring like the other agent figures (no spark, no clutter — it has to read
// at 13px in the hub steps as well as at 54px in the summon orb).
export function PrometheusBadge(props) {
    return (
        <Badge {...props} title="Prometheus">
            <path d="M100,32 C106,58 118,70 130,86 C140,99 145,112 145,126 C145,150 125,168 100,168 C75,168 55,150 55,126 C55,112 60,99 70,86 C82,70 94,58 100,32 Z" />
            <path d="M100,90 C103,105 114,113 114,128 C114,143 108,152 100,152 C92,152 86,143 86,128 C86,113 97,105 100,90 Z" />
        </Badge>
    )
}

// Minos — the idea-monitoring persona (crown of the judge-king over a labyrinth of conditions).
export function MinosBadge(props) {
    return (
        <Badge {...props} title="Minos">
            <path d="M70,88 L70,62 L84,75 L100,56 L116,75 L130,62 L130,88 Z" />
            <line x1="70" y1="88" x2="130" y2="88" />
            <circle cx="100" cy="66" r="3.6" fill="currentColor" stroke="none" />
            <circle cx="75" cy="70" r="2.6" fill="currentColor" stroke="none" />
            <circle cx="125" cy="70" r="2.6" fill="currentColor" stroke="none" />
            <g strokeWidth="4">
                <path d="M72,152 L72,104 L128,104 L128,152" />
                <path d="M84,152 L84,116 L116,116 L116,140 L100,140 L100,128" />
            </g>
            <circle cx="100" cy="128" r="3" fill="currentColor" stroke="none" />
        </Badge>
    )
}

// Talos — the setup-monitoring persona. The bronze automaton given to Minos, circling Crete on a
// fixed rotation: a sentinel figure inside its patrol ring, with the perimeter marks it watches.
export function TalosBadge(props) {
    return (
        <Badge {...props} title="Talos">
            <circle cx="100" cy="104" r="46" strokeDasharray="10 8" />
            <circle cx="100" cy="70" r="11" />
            <line x1="100" y1="81" x2="100" y2="120" />
            <line x1="79" y1="96" x2="121" y2="96" />
            <path d="M100,120 L86,146" />
            <path d="M100,120 L114,146" />
            <circle cx="100" cy="70" r="3.2" fill="currentColor" stroke="none" />
        </Badge>
    )
}

// Hermes — the call-monitoring persona (winged caduceus; messenger of the opportune moment).
export function HermesBadge(props) {
    return (
        <Badge {...props} title="Hermes">
            <line x1="100" y1="64" x2="100" y2="150" />
            <circle cx="100" cy="58" r="5" fill="currentColor" stroke="none" />
            <line x1="93" y1="152" x2="107" y2="152" />
            <path d="M100,80 C84,86 84,98 100,104 C116,110 116,122 100,128" />
            <path d="M100,80 C116,86 116,98 100,104 C84,110 84,122 100,128" stroke="currentColor" />
            <circle cx="88" cy="76" r="3.6" fill="currentColor" stroke="none" />
            <circle cx="112" cy="76" r="3.6" fill="currentColor" stroke="none" />
            <g strokeWidth="3.8">
                <path d="M100,70 C85,63 75,65 67,73" />
                <path d="M100,77 C87,72 79,74 72,81" />
                <path d="M100,70 C115,63 125,65 133,73" />
                <path d="M100,77 C113,72 121,74 128,81" />
            </g>
        </Badge>
    )
}

const AGENT_BADGES  = { idea: IdeaBadge, portfolio: AtlasBadge, scanner: ArgusBadge, kairos: KairosBadge, mentor: MentorBadge, analyst: PrometheusBadge }
// Notification/list context: ideas show Minos, calls show Hermes, setups show Talos; the rest reuse
// their agent figure.
const NOTIFY_BADGES = { idea: MinosBadge, kairos: HermesBadge, mentor: TalosBadge, portfolio: AtlasBadge, scanner: ArgusBadge, analyst: PrometheusBadge }

// Badge COMPONENT for an agent key (or null → fall back to the line glyph). Internal — consumers
// go through <AgentGlyph> so this module exports only components (Fast Refresh stays happy).
function agentBadgeFor(agentKey)  { return AGENT_BADGES[agentKey]  ?? null }
function notifyBadgeFor(agentKey) { return NOTIFY_BADGES[agentKey] ?? null }

// One glyph helper for every consumer: render the agent's badge, or fall back to its line
// sigil (`icon`) in a currentColor svg (used for axl, which has no badge). `notify` picks the
// monitoring persona (Minos/Hermes) for notification-list contexts.
export function AgentGlyph({ agentKey, icon = null, size = 24, notify = false, bare = false }) {
    const B = (notify ? notifyBadgeFor : agentBadgeFor)(agentKey)
    if (B) return <B size={size} bare={bare} />
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {icon}
        </svg>
    )
}
