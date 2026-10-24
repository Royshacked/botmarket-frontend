import { COLUMN_LABEL, COLUMN_ORDER, STATUS_LABEL, STATUS_TITLE, CHECKPOINT_LABEL } from './hotlist.utils.js'

// THE HOTLIST, EXPLAINED — what the Info column shows while the Hotlist is open (Roy, 2026-10-24: "in info — right
// column — put an explanation about this table"). Words only; the numbers are the panel's. Kept to what a trader needs
// to read a row: where the names come from, what each column means, who decided what, and what the buttons do.

// What each horizon is, as a trade — the column titles are header tooltips, too short to explain one.
const HORIZONS = {
    open:     'a trade in the first 30–60 minutes after the open (graded at 08:00 and 09:20).',
    mid:      'a trade through the middle of the session (graded at 10:30).',
    eod:      'a trade into the close (graded at 14:30).',
    tomorrow: 'bought into the close and held overnight into the next session (graded at 15:30).',
    week:     'a short swing of 2 to 10 days (graded at 08:00 and 09:20) — where Prometheus adds a target.',
}

const COLUMNS = [
    ['Sym', 'The ticker; click it for the daily chart.'],
    ['Sparkline', 'The last 20 sessions. The dot is the price; the dash is the level overhead the grade measures room to.'],
    ['Last', 'The price at the checkpoint that last listed the name — not live.'],
    ['Chg%', 'Change from the previous close, at that checkpoint.'],
    ['RVol', 'Volume against an ordinary day (before the open: % of a normal day traded so far).'],
    ['ATR%', 'The average daily range, as % of price — how far it usually moves in a day.'],
    ['Status', 'In play, building or setting up (below).'],
    ['Grade', 'A, B or C for the horizon — by free range: the room to the next level overhead, against its ATR.'],
    ['Room', 'That free range: % to the level and how many ATRs it is. "Open sky": no level overhead.'],
    ['Earn', 'The next report. Amber with "!": the report is inside the window — a run-up trade, out before it.'],
    ['Result', 'Did it work — once the horizon\'s window closes (below).'],
    ['Target', 'On This week only: Prometheus\'s catalyst target and how much of it is still open.'],
]

export function HotlistInfo() {
    return (
        <div className="floor-info__body hot-info">
            <section>
                <h3 className="hot-info__h">The Hotlist</h3>
                <p>The names the screener finds in play today, long side only, graded for each trading horizon. It builds a board at
                    each checkpoint — {Object.values(CHECKPOINT_LABEL).join(', ')} ET — and today&apos;s list merges them: every
                    name once, each horizon&apos;s grade from the latest board that graded it.</p>
            </section>
            <section>
                <h3 className="hot-info__h">Horizons</h3>
                <dl className="hot-info__dl">
                    {COLUMN_ORDER.map(c => (<div key={c}><dt>{COLUMN_LABEL[c]}</dt><dd>{HORIZONS[c]}</dd></div>))}
                </dl>
                <p>A button above the table shows one horizon&apos;s list, Argus&apos;s picks for it first. The number is how many
                    names it holds.</p>
            </section>
            <section>
                <h3 className="hot-info__h">Swing and Long term</h3>
                <p>The last two buttons are not a day&apos;s board: they are the house&apos;s live <b>coverage</b> — Prometheus&apos;s
                    theses, split by the price target&apos;s horizon: 3–6 months is <b>Swing</b>, 12–24 months <b>Long term</b>. Buy-rated
                    names first; <b>All</b> shows the holds and sells too.</p>
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
                <h3 className="hot-info__h">Status</h3>
                <dl className="hot-info__dl">
                    {Object.keys(STATUS_LABEL).map(s => (<div key={s}><dt>{STATUS_LABEL[s]}</dt><dd>{STATUS_TITLE[s].replace(/^[^—]*— /, '')}</dd></div>))}
                </dl>
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
                <p>Every graded name is checked against the tape once its horizon&apos;s window closes — from the checkpoint&apos;s
                    price, over that window (the first hour, the rest of the session, the next session, five sessions):</p>
                <dl className="hot-info__dl">
                    <div><dt>✓ reached</dt><dd>it got to the level the grade measured room to.</dd></div>
                    <div><dt>✗ best +x%</dt><dd>it did not; its best move on the way.</dd></div>
                    <div><dt>↑ / ↓</dt><dd>open sky — no level to reach — so how it ended.</dd></div>
                    <div><dt>open · scoring</dt><dd>the window still runs · it closed, scored after 18:00 ET.</dd></div>
                </dl>
                <p>A week name&apos;s result lands five sessions later: step back a day with ‹ › at the top. Open a row for its best,
                    worst and end move.</p>
                <p><b>Track record</b>, over a horizon&apos;s list (and on a grade&apos;s hover): how often each grade reached its level,
                    and how often it ended up. It says <b>unverified</b> until the horizon has 40 sessions and 30 names behind it —
                    before that, an A is not shown to beat a C. Every name the screener quoted is scored, not only the board&apos;s: a
                    board shows its top 60 graded names, and the record also sets them against <b>graded off it</b> (past that cut)
                    and <b>the pool it chose from</b> — the names it quoted but graded on no horizon. Do its picks beat the names it
                    passed over?</p>
            </section>
            <section>
                <h3 className="hot-info__h">Who decided what</h3>
                <p><b>The grades</b> are the screener&apos;s arithmetic, and still <b>unverified</b> — not enough logged outcomes yet
                    to say an A beats a C.</p>
                <p><b>★ Argus</b> reads every board and picks up to ten names per horizon; the number is his rank in that
                    horizon. <b>✕</b> is a name he says to avoid — too little room, earnings that day, a big gap on a minor story.
                    <b> Argus&apos;s record</b> sets his picks, his avoids and the names he left alone side by side, by how often each
                    ended up and its average move: it says whether his calls beat the board.</p>
                <p><b>Prometheus</b> reads Argus&apos;s This week picks after the 09:20 board, by himself: is the catalyst real,
                    what is it worth, how much is still open. With a report ahead, the target is the stock&apos;s own usual run-up
                    into its reports — less what it has already run this cycle; one that already ran its usual run-up is a pass.
                    A read is valid until its window ends — the session before a report inside it — and is
                    graded then: <b>hit</b> if the price reached the target, <b>expired</b> if not. <b>pass</b> means no target.</p>
            </section>
            <section>
                <h3 className="hot-info__h">On a row</h3>
                <dl className="hot-info__dl">
                    <div><dt>Build with Mentor</dt><dd>A setup for that horizon, from the row&apos;s facts.</dd></div>
                    <div><dt>Ask Argus</dt><dd>Question him about the name — one he skipped, or one he picked hours ago.</dd></div>
                    <div><dt>Catalyst read</dt><dd>On This week, for a name with no read yet: Prometheus reads it now (about a minute).</dd></div>
                </dl>
            </section>
        </div>
    )
}
