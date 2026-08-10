/**
 * Pure helpers for adopting a book the app didn't build (backend: docs/design/adopted-book.md).
 *
 * The backend answers in REASON CODES — `bad_quantity:AAPL`, `cash_not_derivable_excluded`,
 * `non_us_listing` — because a code is what a machine can route on. Turning those into what a person
 * reads, and into WHICH CELL lights up, is this file's whole job. It is pure so the mapping is
 * testable without rendering anything, and so the grid never has to parse a string mid-render.
 *
 * The one rule underneath all of it: a problem must always point somewhere. A refusal the user can't
 * act on is worse than no refusal at all — they retype the whole book hoping something changes.
 */

/** Codes that name a row: `code:SYMBOL`. Split once, here, so no component does string surgery. */
export function splitCode(code) {
    const raw = String(code ?? '')
    const at  = raw.indexOf(':')
    return at < 0
        ? { code: raw, target: null }
        : { code: raw.slice(0, at), target: raw.slice(at + 1) }
}

/**
 * Group a draft's blocking problems by the row they belong to.
 * @returns {{ bySymbol: Map<string, string[]>, book: string[] }}
 *   `book` holds the problems that belong to the ACCOUNT rather than to any row (a missing total, a
 *   rate we couldn't resolve) — they get their own place in the UI, because highlighting a random
 *   holding for an account-level problem is how a user ends up editing the wrong thing.
 */
export function groupProblems(problems = []) {
    const bySymbol = new Map()
    const book     = []
    for (const p of (Array.isArray(problems) ? problems : [])) {
        const { code, target } = splitCode(p)
        if (!target) { book.push(code); continue }
        // `missing_symbol:line 4` targets a LINE of the paste, not a holding we know the name of.
        if (/^line /i.test(target)) { book.push(p); continue }
        const key = target.toUpperCase()
        bySymbol.set(key, [...(bySymbol.get(key) ?? []), code])
    }
    return { bySymbol, book }
}

const ROW_LABELS = {
    bad_quantity:     'How many shares?',
    bad_avg_cost:     'What did you pay per share?',
    duplicate_symbol: 'This name is listed twice — keep one row.',
    incomplete_row:   'This row needs both a size and a price.',
    missing_symbol:   'This line has numbers but no ticker.',
}

const BOOK_LABELS = {
    no_rows:                      'No holdings read yet — paste your book or add a row.',
    no_account_value:             'What does the bank say the account is worth?',
    negative_cash:               "Cash can't be negative — we don't model a margin account.",
    account_value_below_holdings: 'The account value is less than the holdings are worth. One of the two numbers is off.',
    no_fx_rate:                   "We couldn't get a rate for that currency, so the account can't be valued.",
    cash_not_derivable_unpriced:  'Tell us the cash balance directly — one holding has no price, so we cannot work it out from the total.',
    cash_not_derivable_excluded:  'Tell us the cash balance directly — your stated total includes holdings we are not adopting, so we cannot work it out from the total.',
}

/** What a person reads for a problem code. Falls back to the code, never to silence. */
export function problemLabel(code) {
    const { code: bare, target } = splitCode(code)
    return ROW_LABELS[bare] ?? BOOK_LABELS[bare] ?? (target ? `${bare} (${target})` : bare)
}

/** Advisory, not blocking — a column we assumed from a wider export. */
export function warningLabel(code) {
    const { code: bare, target } = splitCode(code)
    return bare === 'assumed_columns'
        ? `We read the first two numbers as size and cost${target ? ` for ${target}` : ''} — worth a check.`
        : bare
}

/**
 * Why a line is NOT in the book. Two reasons, two sentences, deliberately: one is a limit of ours
 * and one is probably a typo, and telling them apart is the difference between a user shrugging and
 * a user fixing it.
 */
export function exclusionLabel(reason) {
    return reason === 'non_us_listing'
        ? 'Listed outside the US — we can’t price, research or review it. If the company has a US line (an ADR), add that instead.'
        : 'We couldn’t price this one. Check the ticker first — it’s usually a typo.'
}

/** Can this draft be committed? Mirrors the backend gate so the button doesn't lie. */
export function canCommit(draft) {
    if (!draft) return false
    if (!(draft.holdings?.length > 0)) return false
    if (draft.reconciliation?.problems?.length) return false
    return draft.reconciliation?.startingBalance != null
}

/**
 * Whether a holding was ADOPTED — recorded on the user's word, never decided by us.
 *
 * Read from the server-stamped flag only. Deriving it (say, from a manual broker plus a past
 * `ordersPlacedAt`) is exactly the drift that made the frontend once report legacy paper fills as
 * live: two implementations of one rule in two repos.
 */
export function isAdoptedIdea(idea) {
    return idea?.adopted === true
}

/**
 * A book that was adopted is ALREADY IN POSITION, so it must never be offered an "activate".
 * Offering it would invite the user to go buy what they already own — the backend would refuse the
 * call (its ACTIVATABLE set is waiting/looking/hit), so the bug is the button existing at all.
 */
export function isAdoptedBook(ideas = []) {
    return ideas.length > 0 && ideas.every(isAdoptedIdea)
}
