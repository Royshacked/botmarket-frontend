// ── Shared agent metadata ──────────────────────────────────────────────────────
// One source of truth for the specialist agents (brand, hue, icon, copy) so the timeline, the social chat and the
// in-chat introductions stay in sync.
//
// Data only — no component exports live here on purpose: mixing components with constants in one module breaks
// React Fast Refresh (HMR) for every importer. The presentational pieces live in AgentGlyphs.jsx.


export const AGENTS = {
    // ⚠ ARCHIVED 2026-07-29 — the Idea agent is superseded by Mentor (`setup`), and its backend route is unmounted. It belongs to no desk, so the hub cannot
    // summon it (see the "no AGENT_LIST" note below — desks make an agent reachable). The entry
    // STAYS because it is still read for display: SocialChat and the timeline render this brand +
    // glyph for threads and alerts it already posted. Removing it would blank the name on that
    // existing history. It is NOT in BOT_IDS any more — the notification feed is retired.
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
        role:  'Portfolio manager',
        work:  'Portfolio work',   // the chat writes it under Axl's name (one-axl.md, 2026-11-13)
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
        // Since 2026-11-09 Argus only finds ONE name for Mentor — his list-building chat is archived (archive/README.md).
        role:  'Stock picker',
        work:  'Finding a name',
        hue:   'violet',
        lead:  'Find a name',
        blurb: 'Finds one name worth trading and hands it back to the trader to build.',
        intro: "Let's find you one name worth trading.",
        hint:  "Tell me the trade you are after — direction, horizon, a sector or theme — and I'll find one tradeable name and hand it back to the trader.",
        icon: (
            <>
                <path d="M2.5 12 C6 7 18 7 21.5 12 C18 17 6 17 2.5 12 Z"/>
                <circle cx="12" cy="12" r="3.2"/>
                <circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none"/>
            </>
        ),
    },
    mentor: {
        tab:   'mentor',
        brand: 'Mentor',
        role:  'Trader',
        work:  'Trade work',
        hue:   'green',   // the counsel desk — steady
        lead:  'Work on your own trade',
        blurb: 'Bring a ticker and your plan. I analyse it, argue with it, and sharpen it.',
        intro: "Bring me a ticker and how you'd trade it — I'll pressure-test it and we'll build the setup together.",
        // Mentor never screens: the ticker always comes from the user (Pipeline F). The hint says so,
        // so nobody arrives expecting a scan — that's Argus's desk.
        hint:  "Name a ticker, a direction and a horizon. Bring your own levels or ask me to place them — if you don't have a name yet, I'll find one.",
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
    // Proteus — the technical analysis desk (backend docs/design/proteus.md, 2026-11-12): how ONE stock's price behaves,
    // measured from its own candles (what it respects, if anything; its false breaks, its ATR; day trade or swing), and
    // what its chart shows now. Reads behaviour only — the levels are Mentor's, the business Prometheus's.
    proteus: {
        tab:   'proteus',
        brand: 'Proteus',
        role:  'Technical analyst',
        work:  'Technicals',
        hue:   'cyan',   // the sea god — and the one hue the trade desks do not crowd
        lead:  'How a stock trades',
        blurb: 'What a stock respects technically, if anything — measured from its own candles.',
        intro: "Name a stock and I'll tell you how it actually trades — measured, not assumed.",
        hint:  'Ask how a stock behaves: does it respect a moving average or VWAP, does it false-break, is it a day-trade or a swing name, what is on its chart now.',
        // A curling wave over the swell — the sea god who changes shape, and a price swing. The 0–24 twin of ProteusBadge.
        icon: (
            <>
                <path d="M4.8 14.4 C7 14.4 7.9 11.5 9.8 9.4 C11.8 7.2 14.9 7 16.6 8.6 C18 10.1 17.5 12.5 15.6 12.7 C14.2 12.8 13.4 11.5 14.4 10.6" />
                <path d="M3.6 16.8 C6 15.4 8.4 18.2 12 16.8 C15.6 15.4 18 18.2 20.4 16.8" />
                <path d="M5.3 19.7 C7.7 18.5 9.6 20.6 12 19.7 C14.4 18.7 16.3 20.6 18.7 19.7" />
            </>
        ),
    },
    analyst: {
        tab:   'analyst',
        brand: 'Prometheus',
        role:  'Analyst',
        work:  'Analysis work',
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
    // Aether — the event-exposure desk. Admin-only. It IDENTIFIES rather than forecasts: the
    // channel-graph engine this desk was built around was measured against held-out data,
    // did not work, and was deleted on 2026-09-10.
    // Key stays `aether`; Aether is both the key and the brand.
    aether: {
        tab:   'aether',
        brand: 'Aether',
        role:  'Event analyst',
        work:  'Event exposure',
        hue:   'cyan',
        lead:  'Who an event reaches',
        blurb: 'A named event in — the companies it reaches out, each verified against its own SEC filings.',
        intro: "Give me an event and I'll name the companies it reaches, with what their own filings say about it.",
        hint:  'Ask which names an event reaches, why one is on the list, what its filing said, or whether the move has already happened.',
        // A sparse graph — dots at nodes, lines between them. Drawn for the channel lattice
        // it no longer depicts, and kept because it reads just as well as one event and the
        // names it reaches, which is what the desk does now.
        icon: (
            <>
                <circle cx="6"  cy="12" r="1.8" />
                <circle cx="18" cy="7"  r="1.8" />
                <circle cx="18" cy="17" r="1.8" />
                <line x1="7.7"  y1="11.1" x2="16.3" y2="7.9" />
                <line x1="7.7"  y1="12.9" x2="16.3" y2="16.1" />
                <line x1="18"   y1="8.8"  x2="18"   y2="15.2" />
            </>
        ),
    },
    // Pythia — the top-down desk. Deliberately NOT an allocator and not a stock picker: Prometheus
    // works bottom-up on names, Atlas allocates, and this desk exists so the allocator reads a
    // house view it did not write itself. Key stays `strategy`; Pythia is the brand.
    strategy: {
        tab:   'strategy',
        brand: 'Pythia',
        role:  'Industry strategist',
        work:  'Industry views',
        // The palette is four hues and desks pair up (Idea/Axl cyan, Atlas/Mentor green,
        // Argus/Prometheus violet). Pythia has amber to herself.
        hue:   'amber',
        // Deliberately NOT "read the market" — that phrase belongs to Axl's market brief (what the
        // world is doing today), and a desk card offering it would send people here for a question
        // Axl answers in place. This desk SETS a view; it does not report the tape.
        lead:  'Review an industry',
        blurb: 'For each GICS industry: is demand growing, is it a good industry to own, where is it in its cycle.',
        intro: "Let's look at an industry — its demand, its economics and where it sits in its cycle.",
        hint:  'Name an industry or a company. I read its measured numbers from fifteen years of filings, research what they cannot see, and answer three structural questions. Descriptions, never forecasts.',
        // The Delphic tripod — the seat the oracle spoke from. A bowl on three legs, with the vapour
        // rising: stroke-only in the 0–24 space like the other desk glyphs.
        icon: (
            <>
                <path d="M6.4 10.2 H17.6 L16.4 13.2 C15.9 14.4 14.1 15.2 12 15.2 C9.9 15.2 8.1 14.4 7.6 13.2 Z" />
                <line x1="9.2" y1="15" x2="7.6" y2="20.4" />
                <line x1="14.8" y1="15" x2="16.4" y2="20.4" />
                <line x1="12" y1="15.2" x2="12" y2="20.4" />
                <path d="M10.6 8.2 C10.6 6.9 12 6.6 12 5.2 C12 6.6 13.4 6.9 13.4 8.2" />
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

// ── ONE AXL (backend docs/design/one-axl.md, 2026-11-13) ────────────────────────────────────────────────────────
// The user meets ONE assistant. Every chat row, social-chat card and notification is Axl's; the agent that wrote it shows
// only as its ROLE under the name ("Axl · Trader"). `brand` above is the internal name — never rendered.
export const ASSISTANT = 'Axl'
/** The speaker of a row: always Axl, with the role of the agent that wrote it (null for Axl himself). */
export function speakerOf(agentKey) {
    const a = AGENTS[agentKey] ?? null
    return { name: ASSISTANT, role: a?.role ?? null, agent: a ? agentKey : 'axl' }
}

// NB: there is deliberately no AGENT_LIST — an agent is reachable through the session (Axl routes to it) or a pane tab,
// not by being enumerated.

// The social-chat notification bots — one per agent, ids matching the AGENTS keys and
// the backend BOT_IDS. Each agent owns its own notifications: Atlas (portfolio) posts
// reviews, Argus (scanner) its scans, Mentor its setup confirms. Only Axl is
// conversational; the specialist threads are notify-only feeds. Axl is pinned first.
//
// NO `idea`: the Idea desk is archived, so its feed is retired (backend RETIRED_BOT_IDS —
// nothing posts there and getConversations hides the old thread). The AGENTS entry above
// stays for rendering history; being absent HERE is what removes it from the sidebar.
//
// NO `aether` either, and that one sat here for a while with no other half. Aether has no notifier:
// nothing on the server posts under that id, and `isBot('aether')` is false there — so postBotCard
// would silently fall back to Axl, the exact misattribution the backend's own comment warns about
// (it is how Talos's setup cards once arrived from Axl). No aether thread can exist, so removing it
// drops nothing.
//
// If an Aether notifier is ever built it needs FOUR entries, not one: this list and the backend
// BOT_IDS, plus BOTH ADMIN_BOT_IDS. Aether is admin-only everywhere else — its routes are
// requireAdmin, axl's ADMIN_DESKS withholds it from traders, and Axl's trader prompt says the desk
// "does not exist" for them. Listed here and absent from ADMIN_BOT_IDS, it would have put an admin
// desk's feed in a trader's sidebar the moment anything posted to it.
export const BOT_IDS = ['axl', 'portfolio', 'scanner', 'mentor', 'analyst', 'strategy']
export const isBotId = (id) => BOT_IDS.includes(id)

// Retired feeds (backend RETIRED_BOT_IDS). Absence from BOT_IDS is what unpins the thread, but on
// its own it makes things WORSE: an id nothing recognises as a bot renders as a person, so the
// dead feed comes back as a human DM from a user called "idea". These are dropped outright.
// `kairos` joined on 2026-11-10 when that desk was deleted (its threads were deleted from Mongo too;
// this is what drops any one a database still holds).
export const RETIRED_BOT_IDS = ['idea', 'kairos']
export const isRetiredBotId = (id) => RETIRED_BOT_IDS.includes(id)
// Admin-only feeds — hidden from traders. The feed still exists; traders just never see it.
// Pythia (the house view) and, since 2026-09-14, Prometheus: coverage is a house artifact only an
// admin can revise, and every card in that feed asks for that revision. Backend ADMIN_BOT_IDS
// must stay in step — the server hides the same threads.
export const ADMIN_BOT_IDS = ['strategy', 'analyst']
export const isAdminBotId = (id) => ADMIN_BOT_IDS.includes(id)
// The one bot you can chat with; the rest are read-only alert feeds.
export const CONVERSATIONAL_BOT_ID = 'axl'

// ── Reception desks ────────────────────────────────────────────────────────────
// The desks a route names (a RouteOffer's `route`): `entryTab` is the agent it lands on, `agentKey` its icon. The
// pipelines' `steps` went with the conveyor and the crumb (unified-chat phase 8e) — the server's chain walks desks now.
export const DESKS = [
    {
        key:      'trade',
        label:    'Trading Desk',
        lead:     'Traders desk',
        blurb:    'Intraday, day, or swing — we build the setup together (I find a name when you have none), then I watch it for you.',
        hue:      'cyan',
        entryTab: 'mentor',   // every trade starts at Mentor (2026-10-19) — the server's registry says the same
        agentKey: 'mentor',
    },
    {
        key:      'portfolio',
        label:    'Portfolio Desk',
        lead:     'Investments desk',
        blurb:    'Long-term or swing — we set the mandate, I find and research the names under it, then allocate.',
        hue:      'green',
        // Enters at ATLAS, not Argus. Unlike the trade desk, the portfolio pipeline starts with a
        // frame, not a name: Atlas locks the mandate (objective, horizon, risk, constraints) and only
        // then sources names — by emitting a <screen_request> that hands the sleeve to Argus's
        // investing profile. Landing on Argus first asks the user to pick names with nothing to pick
        // them AGAINST, and Atlas deliberately has no screener of its own to fall back on.
        entryTab: 'portfolio',
        agentKey: 'portfolio',
    },
    // The Scan Desk left on 2026-11-09 (archive/README.md): Argus is reached only through Mentor, which sends a user with
    // no name to him and gets the one pick back — the Trading Desk's blurb says so.
    {
        key:      'assist',
        label:    'Assist Desk',
        lead:     'Build your idea',
        blurb:    'You bring the ticker and your plan — I pressure-test it, then watch it for you.',
        hue:      'green',
        entryTab: 'mentor',
        agentKey: 'mentor',
    },
    {
        key:      'technicals',
        label:    'Technicals Desk',
        lead:     'Technical analysis',
        blurb:    'How a stock trades, measured — what it respects, its false breaks, its ATR — and what its chart shows now.',
        hue:      'cyan',
        entryTab: 'proteus',
        agentKey: 'proteus',
    },
    {
        key:      'research',
        label:    'Research Desk',
        lead:     'Analyst',
        blurb:    'A living coverage thesis — our view vs the Street.',
        hue:      'amber',
        entryTab: 'analyst',
        agentKey: 'analyst',
    },
    {
        key:       'strategy',
        label:     'Strategy Desk',
        lead:      'Economics',
        blurb:     'Three structural questions answered for every GICS industry.',
        hue:       'amber',
        entryTab:  'strategy',
        agentKey:  'strategy',
        adminOnly: true,
    },
    {
        key:       'aether',
        label:     'Events Desk',
        lead:      'Events radar',
        blurb:     'The companies a macro, trade or policy event reaches, with what each one\'s own filings say about it.',
        hue:       'cyan',
        entryTab:  'aether',
        agentKey:  'aether',
        // ADMIN ONLY, because POST /api/aether/stream is requireAdmin. Without this the
        // hub offered the desk to every signed-in user and the chat answered 403 — a card
        // that exists to be refused. The candidate LIST is unaffected: it is readable by
        // everyone and lives in the right column, not behind this card.
        adminOnly: true,
    },
]
