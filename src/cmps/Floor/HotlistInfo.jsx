// THE HOTLIST, EXPLAINED — what the Info column shows while the Hotlist is open (Roy, 2026-10-24: "in info — right
// column — put an explanation about this table"). Words only; the numbers are the panel's. Kept to what a trader needs
// to read a row: where the names come from, what each column means, who decided what, and what the buttons do.
// Rewritten 2026-10-25 when the day trades were archived and This week moved to the run-up rule
// (botmarket-backend docs/design/hotlist-day-archive.md, screener-lab.md).

const COLUMNS = [
    ['Sym', 'The ticker; click it for the daily chart.'],
    ['Sparkline', 'The last 20 sessions.'],
    ['Last', 'The close before the list was built — not live. The trade is bought at the list day’s open.'],
    ['ATR%', 'The average daily range, as % of price — how far it usually moves in a day.'],
    ['Earn', 'The report the run-up is into. Amber with "!": out at the close before it.'],
    ['Result', 'Did it work — once the five sessions close (below).'],
    ['Target', 'Prometheus’s short-swing target and how much of it is still open.'],
]

export function HotlistInfo() {
    return (
        <div className="floor-info__body hot-info">
            <section>
                <h3 className="hot-info__h">The Hotlist</h3>
                <p>Four tabs, long side only. <b>This week</b> is built every night after the close by one tested rule.
                    <b> Swing</b> and <b>Long term</b> are the house&apos;s research (below). <b>Covered companies</b> is every company
                    Prometheus covers, and his scorecard.</p>
            </section>
            <section>
                <h3 className="hot-info__h">This week — the run-up rule</h3>
                <p>A company whose <b>report is six sessions away</b> and whose <b>last three reports all beat</b> the estimate, while
                    <b> SPY is over its 200-day average</b>: bought at the list day&apos;s open, held five sessions, <b>out at the close
                    before the report</b> — never through it (holding through it adds no return and doubles the swings). Price at
                    least $5 and $5M traded a day. The list is built after the close, for the next session.</p>
                <p>Every name that qualifies is listed, <b>equally</b> — there is no ranking. Tested over three years with the last
                    year held out, a day&apos;s names together beat SPY by about <b>+0.4%</b> over their five sessions, after costs — the
                    same on the year the test never saw; per name it is smaller (about +0.1%), because crowded earnings days do worse
                    than quiet ones. It was steadier in a calm market and lost when SPY was under its 200-day — then the list is empty
                    and says why. So the edge is small and per day, not per name: a fixed, small budget split across the day&apos;s
                    names, not a bet on one.</p>
                <p>What it is not: a price target (Prometheus&apos;s is), a stop (the exit is the date), or a forecast for any one
                    name — plenty of them still end down; the edge shows over many days, not in one.</p>
                <p><b>Prometheus</b> reads every name overnight — is the catalyst real, can the company carry it, how much is still
                    open — and sets his target. The list opens on <b>Prometheus confirmed</b>, the names he set a target on;
                    <b> Run-up names</b> shows all of them with his answer (a pass says why). Build with Mentor on a name hands Mentor
                    his target and the date to be out by.</p>
            </section>
            <section>
                <h3 className="hot-info__h">Swing and Long term</h3>
                <p>Not a day&apos;s list: the <b>weekly chain</b>. Pythia calls an industry (or a theme) for swing or for the long
                    term; Argus picks the names that best carry her thesis; Prometheus researches each — the thesis and a price
                    target, 3–6 months out for <b>Swing</b>, 12–24 months for <b>Long term</b>. The list is <b>Prometheus
                    confirmed</b>: Argus&apos;s names that came out of research with a thesis and a target, whatever the rating — and a
                    name Argus picked that the desk had already covered. <b>Argus&apos;s names</b> shows every name the chain sent in
                    the last eight weeks and where Prometheus has it.</p>
                <dl className="hot-info__dl">
                    <div><dt>Upside</dt><dd>from the last close to the target.</dd></div>
                    <div><dt>By</dt><dd>the target date, and the horizon it was set for.</dd></div>
                    <div><dt>Since set</dt><dd>the move since the target was set, and against SPY over the same days; ✓ hit, ✗ broken or expired once settled.</dd></div>
                    <div><dt>To target</dt><dd>how far it has come from the price that day toward the target.</dd></div>
                    <div><dt>From</dt><dd>the weekly chain — Pythia&apos;s call on an industry or theme, Argus&apos;s pick, Prometheus — or the desk.</dd></div>
                </dl>
                <p>Their track record: how many targets came due and were hit, and how the live names are doing against SPY.</p>
            </section>
            <section>
                <h3 className="hot-info__h">Covered companies</h3>
                <p><b>All coverage</b> is the whole live book — swing and long term, the chain&apos;s names and the desk&apos;s, holds
                    and sells too. <b>Prometheus&apos;s scorecard</b> grades every call he makes: frozen the day he makes it and
                    measured against SPY at 1, 3, 6 and 12 months, a sell scored as right when the stock falls; holds apart. Under 20
                    graded calls a number is dim — too few to judge.</p>
            </section>
            <section>
                <h3 className="hot-info__h">Columns</h3>
                <dl className="hot-info__dl">
                    {COLUMNS.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
                </dl>
                <p>Click a header to sort; again to reverse; a third time to go back to the list&apos;s own order.</p>
            </section>
            <section>
                <h3 className="hot-info__h">Did it work</h3>
                <p>Every name is checked once its five sessions close — from the list day&apos;s open to the close before its report:
                    <b> ↑</b> it ended up, <b>↓</b> down; <b>open</b> while the window runs, <b>scoring</b> once it closed (scored after
                    18:00 ET). A name&apos;s result lands five sessions later: step back a day with ‹ › at the top. Open a row for its
                    best, worst and end move.</p>
                <p><b>Track record</b>, over This week&apos;s list: how the rule&apos;s names have done live, as they score — the
                    tested numbers above are the bar it should meet.</p>
            </section>
            <section>
                <h3 className="hot-info__h">The day trades</h3>
                <p>The session boards — Open, Mid-day, Into close, Tomorrow — were <b>archived on 2026-10-25</b>: replayed over past
                    sessions, every one lost to the names it passed over, and Argus, replayed blind with the headlines and the chart,
                    picked no better than he avoided. Past days still show them, with their results, until they age out.</p>
            </section>
            <section>
                <h3 className="hot-info__h">On a row</h3>
                <dl className="hot-info__dl">
                    <div><dt>Build with Mentor</dt><dd>A setup from the row&apos;s facts — and on This week, Prometheus&apos;s target and the date to be out by.</dd></div>
                    <div><dt>Ask Argus</dt><dd>Question him about the name.</dd></div>
                    <div><dt>Catalyst read</dt><dd>On This week, for a name with no read yet: Prometheus reads it now (about a minute).</dd></div>
                </dl>
            </section>
        </div>
    )
}
