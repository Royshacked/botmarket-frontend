// ── Shared agent metadata + transition timings ─────────────────────────────────
// One source of truth for the three specialist agents (brand, hue, icon, copy) so
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
    analyst: {
        tab:   'analyst',
        brand: 'The Analyst',
        hue:   'violet',   // research desk — shares the discovery family with Argus
        lead:  'Research a name',
        blurb: 'A living thesis per name — our price target vs the Street, kept alive.',
        intro: "Let's build a view — where we differ from the Street, and why it holds.",
        hint:  "Name a ticker and I'll research it into a coverage thesis: our estimate + target vs consensus, with monitorable kill-criteria.",
        icon: (
            <>
                <path d="M5 3.5 H15 L19 7.5 V20.5 H5 Z"/>
                <path d="M14.5 3.5 V8 H19"/>
                <path d="M8 12 L10.3 14.3 L15 9.6"/>
            </>
        ),
    },
}

// Axl itself — the meta-layer. Not a specialist, so it's intentionally NOT in
// AGENT_LIST (the hub cards / routing nav stay the three specialists). Kept here so
// the shared chat pieces (AgentTurnTag: the sigil + name under a turn) work for Axl
// too. Icon = a compact 24-space meditating bot.
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

export const AGENT_LIST = [AGENTS.idea, AGENTS.portfolio, AGENTS.scanner, AGENTS.kairos, AGENTS.analyst]

// The social-chat notification bots — one per agent, ids matching the AGENTS keys and
// the backend BOT_IDS. Each agent owns its own notifications: Idea posts invalidation
// alerts, Atlas (portfolio) posts reviews, Argus (scanner) its scans. Only Axl is
// conversational; the specialist threads are notify-only feeds. Axl is pinned first.
export const BOT_IDS = ['axl', 'idea', 'portfolio', 'scanner', 'kairos']
export const isBotId = (id) => BOT_IDS.includes(id)
// The one bot you can chat with; the rest are read-only alert feeds.
export const CONVERSATIONAL_BOT_ID = 'axl'
