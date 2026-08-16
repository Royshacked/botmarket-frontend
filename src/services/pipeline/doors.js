// ── The delivery doors ─────────────────────────────────────────────────────────
// WHERE a hopped artifact lands, and how every one of them is dropped once the run that produced it
// is over. The routing half of the conveyor (who gets it, and how) is hop.js; this is only the set
// of doors it can put something through, held in one place so nothing can go missing from it.
//
// TWO KINDS OF DOOR, because there are two ways to take delivery (a contract's `deliver`): an INBOX
// for a desk that takes the envelope whole, a SEED for one that opens on a sentence someone wrote
// for it. Both are consumed by an EFFECT keyed on the artifact — see useSeedTurn and MentorPanel's
// hand-off effect.
//
// WHICH IS WHY `clear` EXISTS. An effect with a changed dep also runs on MOUNT, so a delivered
// artifact left lying in the sender's state is not inert: the next time that panel remounts, the
// hand-off replays itself into a conversation nobody asked for. Seen live (2026-08-16) — a finished
// AVGO setup, and half an hour later Argus's hand-off sentence sent itself to Mentor again, opening
// a fresh draft off any pipeline and badging a desk the user had never been to.
//
// `clear` therefore nulls EVERY setter it was handed, not the ones some table happens to list. The
// version that named them by hand named three of the five, and the two it forgot are exactly the two
// that misfired — a door reachable only from outside the conveyor (a calendar row into Mentor, an
// Axl routing into Prometheus) is still a door, and still has to be shut.
//
// Pure: it holds the setters it is given and nothing else.

/**
 * @param {Object<string, function>} setters  every hand-off door's state setter, by name. Anything
 *                                            passed here is cleared by `clear`, table or no table.
 * @returns {{inbox:object, pipelineSeed:object, clear:function}} the two routing tables (keyed by
 *          AGENT, which is what a hop plan names) and the one way to drop everything in flight.
 */
export function handoffDoors(setters = {}) {
    const inbox = {
        scanner: setters.setScanInbox,
        kairos:  setters.setKairosInbox,
        analyst: setters.setAnalystInbox,
        mentor:  setters.setMentorInbox,
    }
    // The conveyor's seed doors. Mentor and Prometheus are seeded only from OUTSIDE a chain, so they
    // are deliberately absent here — a hop must not be able to open them — and are cleared anyway.
    const pipelineSeed = {
        scanner:   setters.setScannerSeed,
        portfolio: setters.setPortfolioSeed,
    }

    return {
        inbox,
        pipelineSeed,
        /** Drop every hand-off in flight, so none of them can re-fire on a later remount. */
        clear() {
            for (const set of Object.values(setters)) set?.(null)
        },
    }
}
