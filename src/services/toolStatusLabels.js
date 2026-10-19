// Friendly UI labels for the agent tool-call status chip. The backend emits a
// `status` SSE event with the raw tool name the moment a tool call starts; the
// chat panels render toolStatusLabel(name) so the user sees what the agent is
// doing without the model spending output tokens narrating it.
//
// Once the call RUNS, a second status carries the names it is about (`targets` — agentIO.announceTargets), and the
// line names them: "Reading price action · SCCO…" (Roy, 2026-10-19: a 4-minute Argus validation read as "Working…").
// Every desk's tools are here — one missing reads as "Working…", which tells the user nothing.

const LABELS = {
    web_search:           'Searching the web…',
    get_quote:            'Fetching live prices…',
    get_quotes:           'Fetching live prices…',
    get_numeric_quote:    'Fetching live prices…',
    get_candles:          'Reading price action…',
    get_price_action:     'Reading price action…',
    get_chart:            'Looking at the chart…',
    get_orderblocks:      'Mapping order blocks…',
    get_false_breaks:     'Checking false breaks…',
    get_indicators:       'Computing indicators…',
    get_cycle_analysis:   'Analyzing cycles…',
    get_risk_metrics:     'Computing risk metrics…',
    get_fundamentals:     'Pulling fundamentals…',
    get_correlations:     'Analyzing correlation…',
    get_earnings:          'Checking earnings history…',
    get_earnings_calendar: 'Checking the earnings calendar…',
    get_sec_filings:      'Reading SEC filings…',
    get_short_interest:   'Checking short interest…',
    get_options_context:  'Reading options positioning…',
    get_derivatives_context: 'Checking funding & open interest…',
    get_news:             'Reading the news…',
    get_event_candidates: 'Reading the event candidates…',

    // Shared by several desks.
    get_trading_context:  'Checking your accounts…',
    check_broker_symbol:  'Checking it trades at your broker…',
    get_market_hours:     'Checking market hours…',
    get_sector_snapshot:  'Ranking the sectors…',
    get_macro_snapshot:   'Reading the macro picture…',
    get_analyst_actions:  'Checking analyst ratings…',
    get_industry_views:   'Reading the house views…',
    consult:              'Thinking it through…',

    // Argus — finding names.
    screen_candidates:    'Screening the market…',
    get_market_movers:    'Reading today’s movers…',
    get_house_industries: 'Reading the house industries…',

    // Mentor — structure and sizing.
    get_peers:            'Comparing peers…',
    get_stock_peers:      'Comparing peers…',
    get_fvg:              'Mapping fair-value gaps…',
    get_structure:        'Reading the structure…',
    get_liquidity:        'Mapping liquidity…',
    get_key_levels:       'Finding key levels…',
    flip_test:            'Testing the other side…',
    size_position:        'Sizing the position…',

    // Atlas and Prometheus.
    get_coverage:         'Reading the coverage…',
    get_consensus:        'Reading the Street consensus…',
    compute_valuation:    'Running the valuation…',
    compute_event_delta:  'Weighing the event…',

    // Axl.
    get_watched_items:    'Looking through your items…',
    get_performance:      'Reading your track record…',
    get_upcoming_events:  'Checking upcoming events…',
    explain_concept:      'Looking it up…',
    set_experience_level: 'Noting your experience…',
    get_market_brief:     'Reading today’s brief…',

    // Pythia.
    list_industries:        'Listing the industries…',
    get_industry_metrics:   'Reading industry metrics…',
    get_industry_companies: 'Listing the companies…',
    get_industry_view:      'Reading the house view…',
    get_industry_moves:     'Reading industry moves…',
    get_industry_news:      'Reading industry news…',
    get_industry_money:     'Following the money…',
    get_capex_leaders:      'Finding the capex leaders…',
    list_themes:            'Listing the themes…',
    get_theme:              'Reading the theme…',
    get_geopolitics:        'Reading the geopolitics…',

    // Not a tool call — the market-brief delivery emits it so the wait has a name while the brief
    // is being written (see api/axl/axl.controller.js streamBrief).
    market_brief:         'Writing today’s brief…',
}

/** At most three names, then a count: "FCX, SCCO, MSI +9". */
function namesOf(targets) {
    const list = Array.isArray(targets) ? targets.filter(t => typeof t === 'string' && t) : []
    if (!list.length) return ''
    return list.slice(0, 3).join(', ') + (list.length > 3 ? ` +${list.length - 3}` : '')
}

/** The status line for a tool — with the names it runs on, once they are known. */
export function toolStatusLabel(name, targets = null) {
    const label = LABELS[name] || 'Working…'
    const names = namesOf(targets)
    return names ? `${label.replace(/…$/, '')} · ${names}…` : label
}
