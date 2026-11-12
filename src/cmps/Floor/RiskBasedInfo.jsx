// HOW A RISK-BASED BUILD WORKS (Roy, 2026-11-05: "nothing tells him about the rules of this lens"). Mentor opens such a
// build with the short version in the chat (botmarket-backend prompts/mentor_system_prompt.md, The thesis lens); this is
// the rest, to read when wanted: Info on a desktop (FloorInfo) and on a phone (ChatInfo). Words only.

export function RiskBasedInfo() {
    return (
        <div className="hot-info">
            <section>
                <h3 className="hot-info__h">How risk-based works</h3>
                <p>Mentor builds this way when you bring a name and no setup of your own. Bring a level or a condition of yours and
                    Mentor builds it in your terms instead.</p>
                <p><b>Mentor asks you one thing</b>: your position size, your risk and the R:R you want. Then he builds the whole
                    trade, judges the stop and the target from the chart, sets how long it waits, and saves and arms it, so Talos is
                    watching. Every choice is in his reply, for you to change. An entry still comes to you to confirm.</p>
                <p>Described here for a long. A short is the mirror.</p>
            </section>
            <section>
                <h3 className="hot-info__h">The levels</h3>
                <dl className="hot-info__dl">
                    <div><dt>Stop</dt><dd>under the sellers&apos; last swing down. If price gets back there, the thesis is broken.</dd></div>
                    <div><dt>Target</dt><dd>where sellers last took over above. At the highs, with nothing overhead, a measured move: the current range&apos;s height added to its high.</dd></div>
                    <div><dt>Your numbers</dt><dd>your risk over your position size is how far the stop can be from the entry; your R:R is the minimum reward to risk. Together they set the highest entry price worth paying. Over today&apos;s price, the setup waits for price to come down to it.</dd></div>
                    <div><dt>Size</dt><dd>your position size, set at that level and kept on an entry under it. The risk is then smaller than planned.</dd></div>
                    <div><dt>Entry</dt><dd>Talos waits for price at or under the level, showing strength on the 1h and 4h.</dd></div>
                </dl>
            </section>
            <section>
                <h3 className="hot-info__h">What Mentor builds, and what he offers</h3>
                <dl className="hot-info__dl">
                    <div><dt>A deeper stop</dt><dd>under the low of the whole fall. More room, fewer shares for the same risk, and it may never fill.</dd></div>
                    <div><dt>A second target</dt><dd>half out at the target, half at the next level, with the stop unchanged.</dd></div>
                    <div><dt>A break scenario (B)</dt><dd>a second way in, armed by a day close over the nearest high, with an assumed stop that stays where it is unless redrawn. Mentor builds A and B together; the first to fill takes the full size and the other is cancelled. One word from you drops either.</dd></div>
                </dl>
            </section>
            <section>
                <h3 className="hot-info__h">If it does not go to plan</h3>
                <p><b>Before a fill</b>, a day close under the stop sends you a card to redraw or close. If price runs away without
                    filling, you get a card to redraw it. That setup doesn&apos;t close by itself, unless its wait runs out first.</p>
                <p><b>Once it has filled</b>, the stop and the targets do their job.</p>
            </section>
            <section>
                <h3 className="hot-info__h">What the tests found</h3>
                <p>S&amp;P 500, 2019–2026, with fixed rules standing in for the judgment: about <b>+0.1R a trade</b> after cost, and only
                    on a <b>reversal</b>, a fast fall and then buyers taking control. A continuation or a breakout earned about nothing on
                    the chart alone, and the mirrored short lost.</p>
                <p>The size of your limits, the depth of the stop and waiting for strength did not move the edge. A second target earned
                    about the same and held the trade about 40% longer. Most trades lose small and the winners pay. None of this is a promise.</p>
            </section>
        </div>
    )
}
