// ── Shared agent metadata + transition timings ─────────────────────────────────
// One source of truth for the specialist agents (brand, hue, icon, copy) so
// the hub cards, the "summoning" beat and the in-chat introductions stay in sync.
//
// Data only — no component exports live here on purpose: mixing components with
// constants in one module breaks React Fast Refresh (HMR) for every importer.
// The presentational pieces live in AgentSummon.jsx.

// Transition timings (ms). axl "summons" the agent, then its chat opens and the
// agent introduces itself inside the panel. Return uses the same span so both
// directions feel symmetrical.
export const SUMMON_MS = 2000   // "Summoning …" before the agent chat opens
export const RETURN_MS = 2000   // "Heading back to axl" before the hub returns

export const AGENTS = {
    // ⚠ ARCHIVED 2026-07-29 — the Idea agent is superseded by Kairos (`call`) and Mentor
    // (`setup`), and its backend route is unmounted. It belongs to no desk, so the hub cannot
    // summon it (see the "no AGENT_LIST" note below — desks make an agent reachable). The entry
    // STAYS because it is still read for display: BOT_IDS keeps its notification feed, and
    // ThreadHistory / SocialChat render this brand + glyph for threads and alerts it already
    // posted. Removing it would blank the name on that existing history.
    idea: {
        tab:   'idea',
        brand: 'Idea',
        hue:   'cyan',
        lead:  'Build a trade idea',
        blurb: 'Turn a hunch into a monitored setup — entry, stop and target.',
        intro: "Let's turn your thinking into a monitored trade — entry, stop and target.",
        hint:  'Describe your trade idea — price levels, indicators, patterns and news events.',
        icon: (
            <>
                <path d="M12 3 C12.4 7.6 16.4 11.6 21 12 C16.4 12.4 12.4 16.4 12 21 C11.6 16.4 7.6 12.4 3 12 C7.6 11.6 11.6 7.6 12 3 Z"/>
                <path d="M18.5 3.5 C18.6 4.5 19.5 5.4 20.5 5.5 C19.5 5.6 18.6 6.5 18.5 7.5 C18.4 6.5 17.5 5.6 16.5 5.5 C17.5 5.4 18.4 4.5 18.5 3.5 Z"/>
            </>
        ),
    },
    portfolio: {
        tab:   'portfolio',
        brand: 'Atlas',
        hue:   'green',
        lead:  'Compose a portfolio',
        blurb: 'Design and manage a diversified book around a thesis.',
        intro: "Let's design and manage a diversified book around your thesis.",
        hint:  'Share your investment goals, risk tolerance and account size to begin.',
        icon: (
            <>
                <circle cx="12" cy="9" r="6"/>
                <path d="M12 3 C8.5 5 8.5 13 12 15"/>
                <path d="M12 3 C15.5 5 15.5 13 12 15"/>
                <path d="M6 9 H18"/>
                <path d="M4 17.5 C7.5 21.5 16.5 21.5 20 17.5"/>
            </>
        ),
    },
    scanner: {
        tab:   'scanner',
        brand: 'Argus',
        hue:   'violet',
        lead:  'Scan the market',
        blurb: 'Surface fresh opportunities worth turning into trades.',
        intro: "Let's sweep the market and surface opportunities worth trading.",
        hint:  "Ask what to watch — a day, the coming week, an earnings window — and I'll scan US markets for candidates with the reasoning behind each.",
        icon: (
            <>
                <path d="M2.5 12 C6 7 18 7 21.5 12 C18 17 6 17 2.5 12 Z"/>
                <circle cx="12" cy="12" r="3.2"/>
                <circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none"/>
            </>
        ),
    },
    kairos: {
        tab:   'kairos',
        brand: 'Kairos',
        hue:   'amber',   // distinct from Idea's cyan — Kairos = the opportune moment
        lead:  'Time a discretionary trade',
        blurb: 'Read a chart, map the levels, and get the nod when the moment lines up.',
        intro: "Let's find a ticker, map the levels, and I'll watch for the moment to enter.",
        hint:  "Name a ticker and how you'd trade it — intraday, day, or swing — and I'll build the call.",
        icon: (
            <>
                <circle cx="12" cy="12" r="8.5"/>
                <path d="M12 7.5 V12 L15 14"/>
            </>
        ),
    },
    mentor: {
        tab:   'mentor',
        brand: 'Mentor',
        hue:   'green',   // the counsel desk — steady, not the amber urgency of Kairos
        lead:  'Work on your own trade',
        blurb: 'Bring a ticker and your plan. Mentor analyses it, argues with it, and sharpens it.',
        intro: "Bring me a ticker and how you'd trade it — I'll pressure-test it and we'll build the setup together.",
        // Mentor never screens: the ticker always comes from the user (Pipeline F). The hint says so,
        // so nobody arrives expecting a scan — that's Argus's desk.
        hint:  "Name a ticker, a direction and a horizon. Bring your own levels or ask me to place them — if you don't have a name yet, Argus is the one who finds them.",
        // Athena's owl — Mentor in the Odyssey *is* Athena in disguise. The 0–24 twin of
        // MentorBadge (which is what actually renders: `mentor` has a ringed badge like the
        // other desks); tufts + eyes only, the perch drops out at this size.
        icon: (
            <>
                <path d="M12 7.2 C14.9 7.2 16.8 9.6 16.8 13.2 C16.8 17.3 14.6 19.7 12 19.7 C9.4 19.7 7.2 17.3 7.2 13.2 C7.2 9.6 9.1 7.2 12 7.2 Z" />
                <path d="M8.6 8.6 L7.9 5.3 L10.6 7" />
                <path d="M15.4 8.6 L16.1 5.3 L13.4 7" />
                <circle cx="10" cy="12" r="1.7" />
                <circle cx="14" cy="12" r="1.7" />
                <path d="M11.5 13.2 L12.5 13.2 L12 14.6 Z" fill="currentColor" stroke="none" />
            </>
        ),
    },
    analyst: {
        tab:   'analyst',
        brand: 'Prometheus',
        hue:   'violet',   // research desk — shares the discovery family with Argus
        lead:  'Research a name',
        blurb: 'A living thesis per name — our price target vs the Street, kept alive.',
        intro: "Let's build a view — where we differ from the Street, and why it holds.",
        hint:  "Name a ticker and I'll research it into a coverage thesis: our estimate + target vs consensus, with monitorable kill-criteria.",
        // The fire of forethought — Prometheus. Flame + hot core, the 0–24 twin of PrometheusBadge
        // (which is what actually renders: `analyst` has a ringed badge like the other desks).
        icon: (
            <>
                <path d="M12 3.8 C12.7 7 14.2 8.4 15.6 10.3 C16.8 11.9 17.4 13.4 17.4 15.1 C17.4 18 15 20.2 12 20.2 C9 20.2 6.6 18 6.6 15.1 C6.6 13.4 7.2 11.9 8.4 10.3 C9.8 8.4 11.3 7 12 3.8 Z"/>
                <path d="M12 10.8 C12.4 12.6 13.7 13.6 13.7 15.4 C13.7 17.2 13 18.2 12 18.2 C11 18.2 10.3 17.2 10.3 15.4 C10.3 13.6 11.6 12.6 12 10.8 Z"/>
            </>
        ),
    },
}

// Axl itself — the meta-layer. Not a specialist, so it owns no desk and never appears as a hub
// card. Kept here so the shared chat pieces (AgentTurnTag: the sigil + name under a turn) work for
// Axl too. Icon = a compact 24-space meditating bot.
AGENTS.axl = {
    tab:   'axl',
    brand: 'axl',
    hue:   'cyan',
    icon: (
        <>
            <line x1="12" y1="4.6" x2="12" y2="3.1" />
            <circle cx="12" cy="2.4" r="0.9" />
            <rect x="6.5" y="4.6" width="11" height="8.4" rx="3" />
            <path d="M9 8.2 q1.4 1.1 2.8 0" />
            <path d="M12.2 8.2 q1.4 1.1 2.8 0" />
            <path d="M7 18 Q12 14.6 17 18" />
            <path d="M7.7 18.7 Q12 22 16.3 18.7" />
        </>
    ),
}

// NB: there is deliberately no AGENT_LIST. The hub renders from DESKS (pipelines), not from a
// list of agents — an agent becomes reachable by belonging to a desk, not by being enumerated.

// The social-chat notification bots — one per agent, ids matching the AGENTS keys and
// the backend BOT_IDS. Each agent owns its own notifications: Idea posts invalidation
// alerts, Atlas (portfolio) posts reviews, Argus (scanner) its scans. Only Axl is
// conversational; the specialist threads are notify-only feeds. Axl is pinned first.
export const BOT_IDS = ['axl', 'idea', 'portfolio', 'scanner', 'kairos', 'mentor', 'analyst']
export const isBotId = (id) => BOT_IDS.includes(id)
// The one bot you can chat with; the rest are read-only alert feeds.
export const CONVERSATIONAL_BOT_ID = 'axl'

// ── Reception desks ────────────────────────────────────────────────────────────
// Axl routes the user into one of these pipelines. `entryTab` is the first agent
// tab to open; `agentKey` drives the summon icon; `steps` is the ordered pipeline.
// Each step: `tab` is the agent's activeTab key (null for background agents like Hermes/Themis).
export const DESKS = [
    {
        key:      'trade',
        label:    'Trading Desk',
        lead:     'Trade an asset',
        blurb:    'Intraday, day, or swing — Argus validates, Kairos plans the setup, Hermes monitors.',
        hue:      'cyan',
        entryTab: 'scanner',
        agentKey: 'kairos',
        steps: [
            // `produces: 'one'` — this desk builds ONE trade, so its scan step ends in a single
            // name for Kairos, not a watchlist. Argus reads it and answers with a pick, which is
            // the same single-pick mode it enters when Kairos asks it for a name mid-desk. Without
            // it, entering the desk AT Argus produced a saved list and no way forward — the step
            // promised a hand-off ("I'll hand you to Kairos") that nothing performed.
            { tab: 'scanner', label: 'Scan', produces: 'one' },
            { tab: 'kairos',  label: 'Build trade' },
            { tab: null,      label: 'Execute & monitor' },
        ],
    },
    {
        key:      'portfolio',
        label:    'Portfolio Desk',
        lead:     'Build a portfolio',
        blurb:    'Long-term or swing — Atlas sets the mandate, Argus screens under it, Prometheus researches, Atlas allocates.',
        hue:      'green',
        // Enters at ATLAS, not Argus. Unlike the trade desk, the portfolio pipeline starts with a
        // frame, not a name: Atlas locks the mandate (objective, horizon, risk, constraints) and only
        // then sources names — by emitting a <screen_request> that hands the sleeve to Argus's
        // investing profile. Landing on Argus first asks the user to pick names with nothing to pick
        // them AGAINST, and Atlas deliberately has no screener of its own to fall back on.
        entryTab: 'portfolio',
        agentKey: 'portfolio',
        steps: [
            { tab: 'portfolio', label: 'Mandate' },
            { tab: 'scanner',   label: 'Screen' },
            { tab: 'analyst',   label: 'Research' },
            { tab: 'portfolio', label: 'Allocate' },
            { tab: null,        label: 'Monitor' },
        ],
    },
    {
        key:      'scan',
        label:    'Scan Desk',
        lead:     'Produce a watchlist',
        blurb:    'Argus sweeps the market and generates a candidate list for later setups.',
        hue:      'violet',
        entryTab: 'scanner',
        agentKey: 'scanner',
        steps: [
            { tab: 'scanner', label: 'Scan' },
        ],
    },
    {
        key:      'assist',
        label:    'Assist Desk',
        lead:     'Work on your own trade',
        blurb:    'You bring the ticker and your plan — Mentor pressure-tests it, Talos watches the zones.',
        hue:      'green',
        entryTab: 'mentor',
        agentKey: 'mentor',
        steps: [
            { tab: 'mentor', label: 'Build setup' },
            { tab: null,     label: 'Arm & monitor' },
        ],
    },
    {
        key:      'research',
        label:    'Research Desk',
        lead:     'Research a company',
        blurb:    'Prometheus builds a living coverage thesis — our view vs the Street.',
        hue:      'amber',
        entryTab: 'analyst',
        agentKey: 'analyst',
        steps: [
            { tab: 'analyst', label: 'Research' },
        ],
    },
]

// ── The order ticket ───────────────────────────────────────────────────────────
// Trade by hand: it sits BESIDE the desks in the hub (same card, same chip) because that
// is where the user decides what to do — but it is deliberately NOT in DESKS. A desk is a
// pipeline an agent leads, and Axl routes into one by key; the pad has no agent and nothing
// to route to, so keeping it out is what stops a reply from "summoning" it.
export const TICKET_DESK = {
    key:   'ticket',
    label: 'Order Ticket',
    lead:  'Trade now',
    blurb: 'Buy or sell by hand — you bring the level, the app monitors and manages the position.',
    hue:   'amber',
    steps: [
        { tab: 'ticket', label: 'Place order' },
        { tab: null,     label: 'Manage & monitor' },
    ],
}
