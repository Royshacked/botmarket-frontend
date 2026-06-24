// Friendly UI labels for the agent tool-call status chip. The backend emits a
// `status` SSE event with the raw tool name the moment a tool call starts; the
// chat panels render toolStatusLabel(name) so the user sees what the agent is
// doing without the model spending output tokens narrating it.

const LABELS = {
    web_search:           'Searching the web…',
    get_quote:            'Fetching live prices…',
    get_quotes:           'Fetching live prices…',
    get_numeric_quote:    'Fetching live prices…',
    get_candles:          'Reading price action…',
    get_price_action:     'Reading price action…',
    get_chart:            'Looking at the chart…',
    get_risk_metrics:     'Computing risk metrics…',
    get_fundamentals:     'Pulling fundamentals…',
    get_correlations:     'Analyzing correlation…',
    get_earnings_calendar: 'Checking the earnings calendar…',
    get_sec_filings:      'Reading SEC filings…',
    get_short_interest:   'Checking short interest…',
    get_options_context:  'Reading options positioning…',
    get_derivatives_context: 'Checking funding & open interest…',
}

export function toolStatusLabel(name) {
    return LABELS[name] || 'Working…'
}
