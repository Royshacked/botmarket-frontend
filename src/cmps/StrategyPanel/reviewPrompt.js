/**
 * The turn Pythia's "review due" card runs when the user confirms it.
 *
 * Written as the USER's ask rather than injected as a wordless instruction, exactly as Axl's brief
 * is: the thread then reads as a conversation, so the follow-up ("why drop Energy?") reaches Pythia
 * with the review and the question that produced it already in the history.
 *
 * The trigger's own sentence rides in — "stance matured: Energy", "macro catalyst passed:
 * 2026-01-19", "no review in 34 days" — so the review opens on what actually came due instead of
 * re-deriving it. It is the same string the card shows, carried from `reviewDecision` on the server.
 *
 * Its own module rather than an export off the panel: a pure helper beside its component is this
 * codebase's shape for exactly this (see ToolStatusChip/waitingLabel.js), and it keeps the panel a
 * components-only file.
 */
export const reviewPrompt = (reason) =>
    `The house view is due for review${reason ? ` — ${reason}` : ''}. Re-read the regime, grade what has closed out, and reaffirm the stances that still hold rather than starting over.`
