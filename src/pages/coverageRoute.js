/**
 * WHERE AN `OPEN_COVERAGE` LANDS — the two surfaces a coverage card can ask for, and which of them
 * each ask is actually entitled to move.
 *
 * The workspace is two columns. The LEFT holds the agent desks, one of which is Prometheus; the
 * RIGHT holds the Radar, one tab of which is the coverage book. A coverage card names one of three
 * asks, and they do not want the same thing:
 *
 *   • 'revise' — Prometheus's verdict card. The ask is a re-model, so it runs the pencil's pipeline:
 *     the desk opens ON that thesis in update mode with the turn already in flight.
 *   • 'open'   — a refresh that rewrote a thesis. The ask is to READ it, and the book is where it is
 *     read. That is the RIGHT column, and it is visible whatever the left column is showing.
 *   • nothing resolved — we could not read the doc, so the book may not have the name either. Land
 *     on Prometheus, where the name is one click away instead of nowhere.
 *
 * WHY THIS IS ITS OWN FUNCTION (2026-09-24). 'open' used to share the unresolved-doc fallback, which
 * switches the left column to the Analyst desk as well. That desk is kept mounted behind
 * `display:none` and is not in `chatResetKey` (see deskReset), so it holds whatever was last
 * researched or revised there. A user who revised CIFR through one card and then pressed a second
 * card for WIX was shown CIFR's revise turn — it read as Prometheus answering the new card with the
 * old name's thesis. The tab switch bought nothing on that path (the book is in the other column)
 * and was the entire defect.
 *
 * Pure, and out of the 3,000-line page, for the reason the doorway resolver was: the rule is one
 * line of judgment that is worth being able to assert, and inside the component it was not.
 *
 * @param {object}  args
 * @param {string}  args.mode      the card's ask — 'revise', 'open', or absent
 * @param {boolean} args.resolved  whether the coverage doc was actually read
 * @returns {{ revise: boolean, book: boolean, desk: boolean }} which moves to make
 */
export function coverageRoute({ mode, resolved } = {}) {
    // A revise needs the document — there is nothing to open in update mode without it. Unresolved,
    // it falls through and is treated like any other ask we could not answer.
    if (mode === 'revise' && resolved) return { revise: true, book: false, desk: false }
    return { revise: false, book: true, desk: !resolved }
}
