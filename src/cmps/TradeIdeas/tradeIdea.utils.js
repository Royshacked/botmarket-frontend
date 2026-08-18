import { openEntityPopup } from '../EntityCard/entityPopup.js'

/**
 * Condition tree → compact one-liner string.
 *
 * Examples:
 *   Leaf only:           "close breaks above 100"
 *   Simple AND:          "close > 100 AND RSI > 30"
 *   Nested AND(OR):      "close > 100 AND (bull flag OR positive earnings)"
 *   Nested OR(AND):      "(close > 100 AND consolidation) OR touches 90"
 */

/**
 * Convert a condition tree node to a compact inline string.
 * Groups that are children of other groups are wrapped in parens.
 *
 * @param {object}  node    Tree node — leaf or group
 * @param {boolean} isRoot  True when this is the outermost call (no wrapping parens)
 * @returns {string|null}
 */
export function treeToOneliner(node, isRoot = true) {
    if (!node || typeof node !== 'object') return null

    // Leaf node
    if (typeof node.condition === 'string') {
        return node.condition.trim() || null
    }

    // Group node
    if (node.operator && Array.isArray(node.children) && node.children.length > 0) {
        const parts = node.children
            .map(child => treeToOneliner(child, false))
            .filter(Boolean)
        if (parts.length === 0) return null
        const joined = parts.join(`  ${node.operator}  `)
        return isRoot ? joined : `(${joined})`
    }

    return null
}

/**
 * Open an idea in its own pop-out window (the /idea/:id page).
 *
 * Thin wrappers over the ONE opener in entityPopup.js — kept as named exports because the call
 * sites read better (`openCallPopup(call)` says what it does) and because they are imported from a
 * dozen places. The mechanism, the hand-off and the window sizing live in entityPopup.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {Window|null}
 */
export function openIdeaPopup(idea) {
    return openEntityPopup('idea', idea)
}

/**
 * Pop-out detail window for a Kairos call. Accepts a full call object (stashed for instant render)
 * or a bare call id (the page then fetches it). Used by the Call cards, social-chat bubbles, and
 * the Positions tab (a call-originated position → its Call).
 *
 * @param {import('../../types.js').Call|string} call
 * @returns {Window|null}
 */
export function openCallPopup(call) {
    return openEntityPopup('call', call)
}

/** Pop-out detail window for a Mentor setup (watched by Talos). */
export function openSetupPopup(setup) {
    return openEntityPopup('setup', setup)
}

// Field triples per trade phase. Single source for how entry/stop/tp conditions
// are stored (nested tree, legacy flat array + logic) so every consumer reads the
// same way instead of re-deriving field names.
const PHASE_FIELDS = {
    entry: { tree: 'entry_condition_tree', flat: 'entry_conditions', logic: 'entry_logic', defaultLogic: 'AND' },
    stop:  { tree: 'stop_condition_tree',  flat: 'stop_conditions',  logic: 'stop_logic',  defaultLogic: 'OR'  },
    tp:    { tree: 'tp_condition_tree',    flat: 'tp_conditions',    logic: 'tp_logic',    defaultLogic: 'OR'  },
}

/**
 * Normalize an idea's phase conditions to a single tree node (or null): the nested
 * tree when present, else the legacy flat array wrapped under the phase's logic.
 * The canonical shim — replaces the copies in ConditionTree.getTree and IdeaDetail.
 *
 * @param {import('../../types.js').Idea} idea
 * @param {'entry'|'stop'|'tp'} phase
 * @returns {object|null}
 */
export function phaseTree(idea, phase) {
    const f = PHASE_FIELDS[phase]
    if (!f || !idea) return null
    if (idea[f.tree]) return idea[f.tree]
    const conds = idea[f.flat]
    if (Array.isArray(conds) && conds.length > 0)
        return { operator: idea[f.logic] ?? f.defaultLogic, children: conds }
    return null
}

/**
 * Best available one-line summary of a phase's conditions: tree → compact
 * oneliner, else the flat array joined by its logic. Returns null when the phase
 * has no conditions. Reads the tree first, so it renders identically wherever it's
 * used (fixes the Monitor card vs ideas-row divergence).
 *
 * @param {import('../../types.js').Idea} idea
 * @param {'entry'|'stop'|'tp'} phase
 * @returns {string|null}
 */
export function phaseSummary(idea, phase) {
    const f = PHASE_FIELDS[phase]
    if (!f || !idea) return null
    if (idea[f.tree]) {
        const s = treeToOneliner(idea[f.tree])
        if (s) return s
    }
    const conds = idea[f.flat]
    if (Array.isArray(conds) && conds.length > 0) {
        const parts = conds.map(c => (typeof c === 'string' ? c : c?.condition)?.trim()).filter(Boolean)
        if (parts.length > 0) return parts.join(`  ${idea[f.logic] ?? f.defaultLogic}  `)
    }
    return null
}

/**
 * Best available one-line summary for a trade idea's entry conditions, falling
 * back to its notes. Priority: entry tree → entry flat array → notes → null.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {string|null}
 */
export function conditionSummary(idea) {
    if (!idea) return null
    return phaseSummary(idea, 'entry') || (idea.notes?.trim() || null)
}

/**
 * First timeframe found in a condition tree, flat conditions array, or single
 * leaf — depth-first. Leaves carry an optional `timeframe` ("15min", "4hr", …);
 * bare-string (legacy) conditions carry none. Returns the first non-empty
 * timeframe, or null when nothing under the node is timed.
 *
 * @param {object|array|string|null} node
 * @returns {string|null}
 */
function firstTimeframe(node) {
    if (!node) return null
    if (Array.isArray(node)) {
        for (const child of node) {
            const tf = firstTimeframe(child)
            if (tf) return tf
        }
        return null
    }
    if (typeof node !== 'object') return null        // bare-string condition — untimed
    if (typeof node.condition === 'string') return node.timeframe || null
    if (Array.isArray(node.children)) return firstTimeframe(node.children)
    return null
}

/**
 * Chart timeframe most relevant to a trade idea — entry leads, then stop, then
 * tp. For each phase the first *timed condition* wins (the specific timeframe the
 * structured/price leaf trades on), then the phase-level `*_timeframe` default.
 * This mirrors the backend's reference timeframe (`_refTimeframe` →
 * `firstLeafTimeframe(entry_condition_tree)` before `entry_timeframe`), so the
 * chart matches what the idea is actually evaluated on — e.g. an idea with
 * `entry_timeframe: "day"` but a "1hr" structured entry leaf shows the 1hr chart.
 *
 * Works on both a saved idea and the in-progress `pending_trade` from chat (both
 * carry the same field names). Returns null when nothing is set, so callers fall
 * back to their chart default.
 *
 * @param {import('../../types.js').Idea|object} idea
 * @returns {string|null}
 */
export function deriveIdeaInterval(idea) {
    if (!idea) return null
    return firstTimeframe(idea.entry_condition_tree)
        || firstTimeframe(idea.entry_conditions)
        || idea.entry_timeframe
        || idea.timeframe
        || firstTimeframe(idea.stop_condition_tree)
        || firstTimeframe(idea.stop_conditions)
        || idea.stop_timeframe
        || firstTimeframe(idea.tp_condition_tree)
        || firstTimeframe(idea.tp_conditions)
        || idea.tp_timeframe
        || null
}

/**
 * Chart interval for a Kairos call's pop-out / detail chart.
 *
 * Prefers the rung Hermes actually assessed on (`monitor_state.chosen_timeframe`,
 * recorded as `timeframe_used` on each assessment) so the chart matches what the
 * monitor is reading. Falls back to the most recent assessment's record, then a
 * per-horizon default until the first assessment has run. Returns a spelling
 * PriceChart's PERIOD_MAP understands ('5min'/'15min'/'1hr'/'day'/'5'/'15'/'D'…).
 *
 * @param {object} call
 * @returns {string}
 */
export function deriveCallChartInterval(call) {
    const HORIZON_DEFAULT = { intraday: '5', day: '15', swing: 'D' }
    return call?.monitor_state?.chosen_timeframe
        || call?.monitor_state?.last_assessment?.timeframe_used
        || HORIZON_DEFAULT[call?.trade_type]
        || '15'
}

/**
 * Compact created-at label for the ideas table (e.g. "Jun 12").
 *
 * @param {number} ms  Epoch milliseconds (idea.savedAt)
 * @returns {string|null}
 */
export function formatCreatedAt(ms) {
    if (ms == null) return null
    const d = new Date(Number(ms))
    if (isNaN(d.getTime())) return null
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Full created-at label for the row tooltip (date + time).
 *
 * @param {number} ms  Epoch milliseconds (idea.savedAt)
 * @returns {string}
 */
export function formatCreatedAtFull(ms) {
    if (ms == null) return ''
    const d = new Date(Number(ms))
    return isNaN(d.getTime()) ? '' : d.toLocaleString()
}

/**
 * Compact number for the positions UI — trims trailing zeros, caps decimals,
 * returns an em-dash for non-numbers.
 * @param {number} n
 * @param {number} [maxDecimals]
 * @returns {string}
 */
export function formatNum(n, maxDecimals = 5) {
    if (n == null || isNaN(Number(n))) return '—'
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: maxDecimals })
}

/**
 * Price for the positions UI — always ≥2 decimals, up to 5 so sub-dollar / FX
 * instruments (e.g. EURUSD 1.08501, DOGE 0.16234) keep their precision while
 * indices and stocks read cleanly at two (19,234.25 / 152.30). Em-dash for
 * non-numbers.
 * @param {number} n
 * @returns {string}
 */
export function formatPrice(n) {
    if (n == null || isNaN(Number(n))) return '—'
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })
}

/**
 * Signed money P&L with two decimals and an optional currency suffix
 * (e.g. "+12.50 USD"). Em-dash for non-numbers.
 * @param {number} n
 * @param {string} [currency]
 * @returns {string}
 */
export function formatPnl(n, currency) {
    if (n == null || isNaN(Number(n))) return '—'
    const v    = Number(n)
    const body = `${v > 0 ? '+' : ''}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return currency ? `${body} ${currency}` : body
}

/**
 * Signed percentage P&L with two decimals and a % suffix (e.g. "+3.25%").
 * Em-dash for non-numbers. Pairs with positionPnlPct.
 * @param {number} n
 * @returns {string}
 */
export function formatPnlPct(n) {
    if (n == null || isNaN(Number(n))) return '—'
    const v = Number(n)
    return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

/**
 * True when a broker position belongs to an idea — matched on broker + account +
 * positionId (a positionId is only unique within its account). The single link
 * predicate shared by matchPositionsForIdea, positionOwnerIdea and groupPositions
 * so the position↔idea join is defined in exactly one place.
 * @returns {boolean}
 */
export function positionBelongsToIdea(pos, idea) {
    return (idea?.brokerOrders ?? []).some(bo =>
        String(bo.positionId ?? '') === String(pos?.id ?? '') &&
        bo.broker === pos?.broker &&
        String(bo.accountId ?? '') === String(pos?.accountId ?? '')
    )
}

/**
 * Open broker positions belonging to an idea, matched on broker + account +
 * positionId (a positionId is only unique within its account) — mirrors the
 * matching used to open a position's owning idea.
 * @returns {object[]}
 */
export function matchPositionsForIdea(idea, positions = []) {
    const links = idea?.brokerOrders ?? []
    if (!links.length || !positions.length) return []
    return positions.filter(p => positionBelongsToIdea(p, idea))
}

/**
 * Open broker positions belonging to ANY entity — idea, setup or call.
 *
 * The same join as matchPositionsForIdea under a kind-neutral name: `brokerOrders` is an envelope
 * field, so every kind carries it (Talos stamps execution onto a setup; a call self-shadows with
 * its own linkage since P3b). This is the ONE way a detail view answers "which positions are
 * mine".
 *
 * It exists because the three pop-outs each matched by SYMBOL instead, which is not an identity:
 * a portfolio holding and a setup on the same ticker are different entities, so opening a setup on
 * AVGO showed the portfolio's AVGO position too — and PopoutFooter reads a non-empty list as "in
 * position", which then delete-locked a setup that owned nothing.
 *
 * Strict by design: no symbol fallback. An entity with no linked position owns no position, which
 * is the whole point.
 */
export const positionsForEntity = matchPositionsForIdea

/**
 * The idea that owns a broker position (the inverse of matchPositionsForIdea), or
 * null when no loaded idea links it — e.g. a broker position whose idea was deleted.
 * @returns {object|null}
 */
export function positionOwnerIdea(pos, ideas = []) {
    return ideas.find(i => positionBelongsToIdea(pos, i)) ?? null
}

/**
 * What clicking a position row should open. A call-originated position carries a stamped `callId`
 * (its execution idea is ownedBy:'hermes' and hidden from the ideas list, so it can't resolve to a
 * visible idea) → open the Call pop-out, preferring the loaded call object for an instant render and
 * falling back to the bare id (CallPage fetches it). Otherwise open its owning visible idea. Returns
 * null for an owner-less/orphan broker position (e.g. a paper trade whose idea was deleted) → no-op.
 * Pure — the single source for the Positions-tab open routing.
 *
 * @returns {{ kind: 'call', call: object|string } | { kind: 'idea', idea: object } | null}
 */
export function positionOpenTarget(pos, ideas = [], calls = []) {
    if (pos?.callId) {
        const call = calls.find(c => c.id === pos.callId)
        return { kind: 'call', call: call ?? pos.callId }
    }
    const idea = positionOwnerIdea(pos, ideas)
    return idea ? { kind: 'idea', idea } : null
}

/**
 * Blend several broker positions of the ONE holding into the single position it really is.
 *
 * A holding can sit behind more than one broker position: a book placed across two accounts, or —
 * the case this was written for — a scale-in on a HEDGING venue (cTrader/MT5), which cannot add to a
 * position and opens a sibling instead. Left unfolded, the user's book showed "MU 10 @ 987" and
 * "MU 3 @ 1018" as two holdings of the same name, and neither line is the number they own.
 *
 * Prices are SIZE-WEIGHTED, which is the whole point: the mean of 987 and 1018 is 1002.82, while
 * what was actually paid for 13 shares averages 994.42. Money P&L sums.
 *
 * `id` / `broker` / `accountId` are carried from the first leg so the row still resolves its owning
 * entity (clicking it opens the holding) — they identify ONE leg and must never be used to close the
 * blended row. Closing a folded holding means closing every leg; `legs` is there for that.
 *
 * @param {object[]} legs
 * @returns {object} a position-shaped object with `folded: true` and `legs`
 */
export function blendLegs(legs = []) {
    const first = legs[0] ?? {}
    let volume = 0, entryValue = 0, markValue = 0, pnl = 0, anyPnl = false, openedAt = null
    const accounts = new Set(), accountNos = new Set()

    for (const p of legs) {
        const vol   = Math.abs(Number(p.volume)) || 0
        const entry = Number(p.entryPrice)
        const mark  = Number(p.currentPrice)
        volume += vol
        if (isFinite(entry) && entry > 0) entryValue += entry * vol
        // Fall back to the entry when a leg has no mark yet, so one unpriced leg cannot drag the
        // blended mark below what the position is worth (it would read as a fake loss).
        markValue += (isFinite(mark) && mark > 0 ? mark : (isFinite(entry) ? entry : 0)) * vol
        if (p.pnl != null && !isNaN(Number(p.pnl))) { pnl += Number(p.pnl); anyPnl = true }
        if (p.openedAt != null) openedAt = openedAt == null ? p.openedAt : Math.min(openedAt, p.openedAt)
        if (p.accountId != null) accounts.add(String(p.accountId))
        if (p.accountNo != null) accountNos.add(String(p.accountNo))
    }

    return {
        ...first,
        volume,
        entryPrice:   volume > 0 && entryValue > 0 ? entryValue / volume : (first.entryPrice ?? null),
        currentPrice: volume > 0 && markValue  > 0 ? markValue  / volume : (first.currentPrice ?? null),
        pnl:          anyPnl ? pnl : null,
        openedAt,
        // A holding spread over several accounts has no single account to name — the caller shows
        // the leg rows for that. Uniform is the normal case (a scale-in lands on the same account).
        accountId: accounts.size   === 1 ? [...accounts][0]   : first.accountId ?? null,
        accountNo: accountNos.size === 1 ? [...accountNos][0] : null,
        folded: true,
        legs,
    }
}

/**
 * One entry per HOLDING, not per broker position — the Positions tab's row list.
 *
 * Positions that belong to the same entity fold into one blended row (see blendLegs) with their legs
 * kept for expansion; a holding with a single position passes straight through untouched, which is
 * the overwhelmingly common case and must render exactly as it did before. A position no loaded
 * entity claims (an orphan, or the read-only dialog which passes no `ideas`) is its own group, so
 * callers that don't know their entities behave unchanged.
 *
 * @param {object[]} positions
 * @param {object[]} ideas
 * @returns {Array<{ ownerId: string|null, legs: object[], position: object }>}
 */
export function foldHoldingLegs(positions = [], ideas = []) {
    const groups  = []
    const byOwner = new Map()

    for (const pos of positions) {
        const ownerId = positionOwnerIdea(pos, ideas)?.id ?? null
        if (!ownerId) { groups.push({ ownerId: null, legs: [pos] }); continue }
        let g = byOwner.get(ownerId)
        if (!g) { g = { ownerId, legs: [] }; byOwner.set(ownerId, g); groups.push(g) }
        g.legs.push(pos)
    }

    return groups.map(g => ({ ...g, position: g.legs.length === 1 ? g.legs[0] : blendLegs(g.legs) }))
}

/**
 * Group open positions for the Positions tab by their owning idea's portfolio.
 *
 * A position links to an idea (via brokerOrders); an idea may carry a portfolioId.
 * Positions whose idea is in a portfolio collapse under a portfolio group; every
 * other position (standalone idea, or an idea-less/orphan broker position) renders
 * flat in `loose`. Positions are already one-per-account at the broker, so a single
 * idea or portfolio spanning N accounts naturally yields N rows — no extra splitting.
/**
 * Ideas grouped into their portfolios, newest first. Ideas with no `portfolioId` are not returned —
 * this answers "what books exist", not "where does every idea live".
 *
 * Distinct from groupPositions() above, which groups POSITIONS and therefore only ever sees books
 * that already have something open. A book being constructed, or one whose ideas are all still
 * pre-entry, exists here and not there.
 *
 * NOTE: TradeIdeasList's private `_separateIdeas` builds the same portfolio map inline, alongside
 * the broker-fork grouping it also needs. It should collapse onto this once the Floor design either
 * graduates or is dropped — folding it in now would mean editing the shipped list for a trial.
 *
 * @param {object[]} ideas
 * @returns {Array<{portfolioId:string,name:string,savedAt:number,ideas:object[]}>}
 */
export function portfoliosFromIdeas(ideas = []) {
    const m = new Map()
    for (const idea of ideas) {
        if (!idea?.portfolioId) continue
        if (!m.has(idea.portfolioId)) {
            m.set(idea.portfolioId, {
                portfolioId: idea.portfolioId,
                name:        idea.portfolioName || 'Portfolio',
                savedAt:     idea.savedAt,
                ideas:       [],
            })
        }
        m.get(idea.portfolioId).ideas.push(idea)
    }
    return [...m.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
}

/**
 * Reopening a BOOK is two different acts, and which one it is comes from the book's own state — not
 * from who asked for it or how they said it.
 *
 * Nothing in a position yet → an EDIT. The plan is still a draft; re-planning it costs nothing, and
 * it is exactly what "change my book" means while the book is only a proposal.
 *
 * Any leg in a position → a REVIEW. Re-planning would send every holding back to `waiting`, which
 * takes a live position off monitoring in order to rewrite a plan the market has already acted on.
 * A review instead reads the book where it stands and proposes changes the user confirms, so the
 * positions are never quietly stood down. "I want to look at my book again" IS a review trigger —
 * that is what the user is asking for, whichever word they use.
 *
 * `isDeleteLocked` is the app's existing word for "live at the broker" (long/short only — a 'hit'
 * idea has a parked order and no position). It is the same predicate handleUpdatePlan uses to refuse
 * a re-plan, which is this same fact seen from the far end of the edit.
 *
 * @param {object[]} bookIdeas  one portfolio's ideas (a row from portfoliosFromIdeas)
 * @returns {boolean} true when reopening this book must be a review, not an edit
 */
export function isPortfolioReview(bookIdeas = []) {
    return (Array.isArray(bookIdeas) ? bookIdeas : []).some(isDeleteLocked)
}

/**
 *
 * @param {object[]} positions
 * @param {object[]} ideas
 * @returns {{ portfolios: Array<{portfolioId:string,name:string,savedAt:number,positions:object[],ideas:object[]}>, loose: object[] }}
 */
export function groupPositions(positions = [], ideas = []) {
    const pfMap = new Map()   // portfolioId → group
    const loose = []

    for (const pos of positions) {
        const idea  = positionOwnerIdea(pos, ideas)
        const pfId  = idea?.portfolioId
        if (!pfId) { loose.push(pos); continue }

        if (!pfMap.has(pfId)) {
            pfMap.set(pfId, {
                portfolioId: pfId,
                name:        idea.portfolioName || 'Portfolio',
                savedAt:     idea.savedAt || 0,
                positions:   [],
                ideas:       [],
            })
        }
        const g = pfMap.get(pfId)
        g.positions.push(pos)
        if (!g.ideas.includes(idea)) g.ideas.push(idea)
    }

    const portfolios = [...pfMap.values()]
        .map(g => ({ ...g, accounts: _positionsByAccount(g.positions) }))
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    return { portfolios, loose }
}

// Split positions into per-account sub-groups, first-seen order preserved. A
// portfolio spanning several accounts renders one collapsible sub-row per account.
function _positionsByAccount(positions = []) {
    const m = new Map()
    for (const p of positions) {
        const key = String(p.accountId ?? '—')
        if (!m.has(key)) m.set(key, { accountId: p.accountId ?? null, accountNo: p.accountNo ?? null, positions: [] })
        m.get(key).positions.push(p)
    }
    return [...m.values()]
}

/**
 * Aggregate a set of positions into the fields a portfolio / account summary row
 * shows: count, summed money P&L, return-on-cost % (Σpnl ÷ Σ|entry·qty|, the same
 * quantity as a single position's price-move %), earliest entry time, workspace, and
 * the single broker / account number when the set is uniform (else null → the caller
 * shows "N accts" / hides the broker). P&L is null when nothing in the set is priced.
 *
 * @param {object[]} positions
 * @returns {{count:number,pnl:number|null,currency:string|null,pnlPct:number|null,enteredAt:number|null,workspace:'paper'|'manual'|'live',broker:string|null,accountNo:string|null}}
 */
export function summarizePositions(positions = []) {
    let pnl = 0, cost = 0, enteredAt = null, currency = null, anyPnl = false
    const brokers = new Set(), accounts = new Set()

    for (const p of positions) {
        const raw = Number(p.pnl)
        if (p.pnl != null && !isNaN(raw)) { pnl += raw; anyPnl = true }
        const entry = Number(p.entryPrice), qty = Math.abs(Number(p.volume))
        if (isFinite(entry) && entry > 0 && isFinite(qty)) cost += entry * qty
        if (p.openedAt != null) enteredAt = enteredAt == null ? p.openedAt : Math.min(enteredAt, p.openedAt)
        currency = currency ?? (p.currency ?? null)
        if (p.broker) brokers.add(p.broker)
        if (p.accountNo != null) accounts.add(String(p.accountNo))
    }

    return {
        count:     positions.length,
        pnl:       anyPnl ? pnl : null,
        currency,
        pnlPct:    anyPnl && cost > 0 ? (pnl / cost) * 100 : null,
        enteredAt,
        workspace: positions.length ? positionWorkspace(positions[0]) : 'live',
        broker:    brokers.size  === 1 ? [...brokers][0]  : null,
        accountNo: accounts.size === 1 ? [...accounts][0] : null,
    }
}

/**
 * Unrealized P&L of a position as a percentage of its entry price — the simple
 * price-move return, signed by direction: (mark − entry) / entry × dir × 100.
 * Uses the position's own live mark (currentPrice), so it needs no cost basis.
 * Returns null when the mark or entry is missing / zero (shows '—' rather than 0).
 * @returns {number|null}
 */
export function positionPnlPct(pos) {
    const entry = Number(pos?.entryPrice)
    const mark  = Number(pos?.currentPrice)
    // Non-positive / non-finite entry or mark = unpriced (null/0 sentinel) or bad data.
    if (!isFinite(entry) || entry <= 0 || !isFinite(mark) || mark <= 0) return null
    const sign = pos?.direction === 'short' ? -1 : 1
    return ((mark - entry) / entry) * sign * 100
}

/**
 * The workspace a broker position belongs to: 'paper' | 'manual' | 'live'. Mirrors the
 * idea-side deriver (isPaperIdea / isManualIdea) with the same dual signal: the broker
 * stamped on the position, then the `paper-<userId>` / `manual-<userId>` account-id
 * prefix as a fallback (a paper/manual position whose broker field isn't the literal
 * workspace name still resolves by its virtual account id).
 * @returns {'paper'|'manual'|'live'}
 */
export function positionWorkspace(pos) {
    const acct = String(pos?.accountId ?? '')
    if (pos?.broker === 'paper'  || acct.startsWith('paper-'))  return 'paper'
    if (pos?.broker === 'manual' || acct.startsWith('manual-')) return 'manual'
    return 'live'
}

/**
 * Live unrealized P&L for a single idea, summed across its open positions (an
 * idea can span multiple accounts). Returns null when nothing is live (pending /
 * unfilled) so the UI shows '—' rather than a misleading 0.
 * @returns {{ pnl: number, currency: string|null }|null}
 */
export function ideaPnl(idea, positions = []) {
    const matched = matchPositionsForIdea(idea, positions)
    if (!matched.length) return null
    const pnl = matched.reduce((sum, p) => sum + (Number(p.pnl) || 0), 0)
    return { pnl, currency: matched.find(p => p.currency)?.currency ?? null }
}

/**
 * Live unrealized P&L for a portfolio (its ideas), summed across every idea's
 * open positions. Returns null when none of the ideas are live. Mixed-currency
 * portfolios are summed naively and labelled with the first currency seen —
 * fine while accounts are single-currency (revisit if multi-currency lands).
 * @returns {{ pnl: number, currency: string|null }|null}
 */
export function portfolioPnl(ideas = [], positions = []) {
    let pnl = 0, currency = null, any = false
    for (const idea of ideas) {
        const r = ideaPnl(idea, positions)
        if (!r) continue
        any = true
        pnl += r.pnl
        currency = currency ?? r.currency
    }
    return any ? { pnl, currency } : null
}

/**
 * True when an idea has at least one entry condition (flat array or tree).
 * Used to decide activation target: conditions → 'looking' (monitor watches),
 * none → 'hit' (fire immediately, pending confirmation).
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {boolean}
 */
export function hasEntryConditions(idea) {
    if (!idea) return false
    if (Array.isArray(idea.entry_conditions) && idea.entry_conditions.length > 0) return true
    const t = idea.entry_condition_tree
    return !!(t && (typeof t.condition === 'string' || (Array.isArray(t.children) && t.children.length > 0)))
}

/**
 * Status a 'waiting' idea should move to when activated.
 *   - resting entry (broker-native stop-market) → 'resting' (broker holds a working order)
 *   - has entry conditions                       → 'looking' (monitor watches)
 *   - no conditions                              → 'hit' (fire immediately, pending confirm)
 * @param {import('../../types.js').Idea} idea
 * @returns {'resting'|'looking'|'hit'}
 */
export function activationStatus(idea) {
    if (idea?.entryOrderType === 'stop') return 'resting'
    return hasEntryConditions(idea) ? 'looking' : 'hit'
}

/**
 * Activating a whole book: what "go live" MEANS for a portfolio, in one place.
 *
 * Two different acts wearing one word. On a broker (paper or live) each waiting leg moves to its own
 * activation status and the app takes it from there. In MANUAL there is no broker to tell, so
 * nothing flips — the N-leg entry card is posted and the user reports the real fills against it
 * (the backend parks the legs at awaiting_manual_fill). Flipping statuses there would claim
 * positions nobody opened.
 *
 * Already lived twice — the ideas table and the cards — and a third surface (the Floor's portfolio
 * list) is what made the copies a rule rather than a coincidence. Legs that are not 'waiting' are
 * left alone: activating a book is not a re-entry for the parts of it already working.
 *
 * @param {import('../../types.js').Idea[]} ideas   the book's legs
 * @param {{ isManual?: boolean, onStatusChange?: Function, onManualEntry?: Function }} handlers
 */
export function activatePortfolio(ideas, { isManual = false, onStatusChange, onManualEntry } = {}) {
    if (isManual) { onManualEntry?.(); return }
    for (const idea of ideas ?? []) {
        if (idea?.status === 'waiting') onStatusChange?.(idea.id, activationStatus(idea))
    }
}

/**
 * True when an idea must not be deleted from the client — it holds a real broker
 * position ('long'/'short'). Deleting it would orphan that position, so the
 * bin/Delete control is disabled. A 'hit' idea has only a parked order plan (nothing
 * at the broker yet), so it IS deletable — the delete flow just confirms intent first
 * (see isDeleteConfirmRequired). A 'closed' idea is done and stays freely deletable.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {boolean}
 */
export function isDeleteLocked(idea) {
    return isLiveStatus(idea?.status)
}

/**
 * True when an idea belongs to the PAPER-trading workspace, derived from the idea
 * alone — no live broker session required, so it holds for a still-'waiting' idea.
 * Primary signal is the top-level `broker` stamped at save time; the `paper-<userId>`
 * account-id prefix is a fallback for legacy ideas saved before `broker` was persisted.
 *
 * Paper vs live is a global per-user mode applied at save time, so a batch (portfolio)
 * is uniformly one mode and any member reflects the whole. The list uses this to scope
 * the two workspaces: an idea shows when isPaperIdea(idea) === the current paper mode.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {boolean}
 */
export function isPaperIdea(idea) {
    return ideaWorkspaceMode(idea) === 'paper'
}

/**
 * Whether an idea belongs to the MANUAL (broker-less real-money) workspace. Sibling of
 * isPaperIdea with the same signal precedence: the top-level `broker` stamped at save
 * time, then the `manual-<userId>` account-id prefix as a fallback.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {boolean}
 */
export function isManualIdea(idea) {
    return ideaWorkspaceMode(idea) === 'manual'
}

/**
 * The workspace an idea belongs to: 'paper' | 'manual' | 'live'.
 *
 * PREFERS the server-stamped `mode`. That field is frozen when the venue is bound at save time —
 * the one moment it is genuinely knowable — so re-deriving it here is recomputing a decision the
 * backend already made, in a second repo, where the two rules can silently drift. They DID drift:
 * a broker-only variant on the backend recorded legacy paper fills as live trades.
 *
 * The local derivation below survives ONLY as a fallback for documents saved before `mode` was
 * stamped, and mirrors backend services/venue.resolve.resolveMode exactly (broker first, then the
 * `paper-`/`manual-` account-id prefix). Once a backfill migration stamps the old docs, this whole
 * function collapses to `idea?.mode ?? 'live'` and the duplicate rule is gone.
 *
 * Kept in sync by a shared case table — see tradeIdea.workspace.test.js and the backend's
 * venueResolve.test.js, which assert the SAME inputs.
 */
export function ideaWorkspaceMode(idea) {
    // ⚠ `mode` MEANS TWO DIFFERENT THINGS depending on the kind, which is why this reads the value
    // rather than merely checking the field exists. On an `idea` and a `setup` it is the workspace;
    // on a CALL it is the build LENS (discretionary | smc | institutional — see kairos.modes.js).
    // The lens values happen not to collide with the workspace names, so a call falls straight
    // through to `broker` below and resolves correctly. That is luck holding a contract together:
    // name a future lens 'live' and every call on it silently changes workspace. If a lens is ever
    // added, check it against this list first. (The backend records the same collision under
    // project_trade_pipeline_pivot.)
    if (idea?.mode === 'paper' || idea?.mode === 'manual' || idea?.mode === 'live') return idea.mode

    if (idea?.broker === 'paper' || idea?.broker === 'manual') return idea.broker

    const ids = [idea?.mainAccountId, idea?.accountId, ...(Array.isArray(idea?.accounts) ? idea.accounts : [])]
    for (const raw of ids) {
        const id = String((raw && typeof raw === 'object' ? (raw.id ?? raw.accountId) : raw) ?? '')
        if (id.startsWith('paper-'))  return 'paper'
        if (id.startsWith('manual-')) return 'manual'
    }
    return 'live'
}

/**
 * The workspace an idea belongs to: 'paper' | 'manual' | 'live' (default). The single
 * deriver the list/monitor/confirm views scope on — an idea shows when
 * ideaWorkspace(idea) === the active workspace. Paper takes precedence, then manual,
 * else live (real broker / legacy).
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {'paper'|'manual'|'live'}
 */
export function ideaWorkspace(idea) {
    if (isPaperIdea(idea))  return 'paper'
    if (isManualIdea(idea)) return 'manual'
    return 'live'
}

/**
 * The workspace ANY execution-tier entity belongs to — an idea, a call or a setup.
 *
 * Same function, kind-neutral name, and that is the whole point of it existing. The rule was written
 * when `ideas` was the only kind, so as `call` and `setup` arrived the lists that show them grew
 * their own inline copies instead — one of which mapped every non-cTrader, non-manual call to PAPER,
 * so a live IBKR call would have shown up in the paper workspace. The fields it reads (`mode`,
 * `broker`, the account ids) are the ones every kind carries, so nothing about it was ever
 * idea-specific except the name.
 *
 * `ideaWorkspace` stays as-is for the existing idea call sites; scope a NEW list through this.
 *
 * @param {{mode?:string, broker?:string, accounts?:unknown[], mainAccountId?:unknown, accountId?:unknown}} entity
 * @returns {'paper'|'manual'|'live'}
 */
export const entityWorkspace = ideaWorkspace

/**
 * Filter any list of execution-tier entities down to the workspace on screen.
 *
 * Kept as a helper rather than left inline at each list because "which of these belong to the book
 * I am looking at" is one question, and each place that answered it separately answered it slightly
 * differently. A non-array is an empty list, so a still-loading feed scopes to nothing rather than
 * throwing.
 */
export function inWorkspace(entities, workspace) {
    return Array.isArray(entities) ? entities.filter(e => entityWorkspace(e) === workspace) : []
}

// ── Idea status groups ──────────────────────────────────────────────────────
// Single source for the status literal-sets that were duplicated across
// TradeIdeaRow / IdeaDetail / MainPage.
//   live       — holds a real broker position (long/short)
//   post-order — an order has been placed: pending confirm ('hit') or in position
//   system     — driven by the monitor/broker, not the user's status toggle
export const LIVE_STATUSES       = ['long', 'short']
export const POST_ORDER_STATUSES = ['hit', 'long', 'short']
export const SYSTEM_STATUSES     = ['hit', 'long', 'short', 'closed']

export const isLiveStatus      = (status) => LIVE_STATUSES.includes(status)
export const isPostOrderStatus = (status) => POST_ORDER_STATUSES.includes(status)
export const isSystemStatus    = (status) => SYSTEM_STATUSES.includes(status)

/**
 * True when deleting the idea should ask for confirmation first: a 'hit' idea has
 * fired and is awaiting the user's order confirmation, so deleting it discards that
 * pending entry — worth a confirm rather than a one-click bin.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {boolean}
 */
export function isDeleteConfirmRequired(idea) {
    return idea?.status === 'hit'
}

/**
 * True when an idea is missing a stop loss or a take profit — used to flag
 * (e.g. immediate) ideas that were generated without exits so the user is
 * reminded to add them.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {boolean}
 */
export function needsExitConditions(idea) {
    if (!idea) return false
    const hasStop = Array.isArray(idea.stop_conditions) && idea.stop_conditions.length > 0
    const hasTp   = Array.isArray(idea.tp_conditions)   && idea.tp_conditions.length   > 0
    return !hasStop || !hasTp
}

/**
 * The broker's tradable symbol for an idea, but only when it differs from the
 * authored (canonical) asset — i.e. an aliased instrument like NQ → US100. Returns
 * null when the broker trades it under the same name (nothing extra to surface).
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {string|null}
 */
export function brokerSymbolLabel(idea) {
    const bs = idea?.brokerSymbol
    if (!bs || !idea.asset) return null
    return bs !== idea.asset ? bs : null
}

/**
 * Human label for the broker a (forked) child trades on — its broker symbol when
 * aliased, else the broker name, else the asset. Used in the multi-broker group's
 * child rows where the asset is already shown on the group header.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {string}
 */
export function brokerChildLabel(idea) {
    return brokerSymbolLabel(idea) ?? idea?.broker ?? idea?.asset ?? '—'
}

/**
 * Human label for the order side, e.g. "Buy Market" / "Sell Short Market".
 *
 * @param {string} direction  'long' | 'short'
 * @param {string} type       'market' | 'limit' (default 'market')
 * @returns {string}
 */
export function orderTypeLabel(direction, type = 'market') {
    const t = String(type || 'market')
    const cap = t.charAt(0).toUpperCase() + t.slice(1)
    if (direction === 'short') return `Sell Short ${cap}`
    return `Buy ${cap}`
}

/**
 * Build the per-account order preview for a hit idea.
 *
 * Quantity semantics: the idea's `quantity` is the size for the MAIN account
 * (idea.mainAccountId). Every other attached account scales by its balance ratio
 * to the main account: quantity × (account.balance / mainAccount.balance).
 *
 * `idea.accounts` may hold account-id strings or full account objects; both are
 * resolved against `availableAccounts` (which carries broker/login/balance).
 *
 * @param {import('../../types.js').Idea} idea
 * @param {import('../../types.js').Account[]} availableAccounts
 * @returns {import('../../types.js').OrderPreview[]}
 */
export function buildOrderPreview(idea, availableAccounts = []) {
    if (!idea || !Array.isArray(idea.accounts) || idea.accounts.length === 0) return []

    const byId = new Map(availableAccounts.map(a => [String(a.id), a]))
    const ids  = idea.accounts.map(a => String(typeof a === 'object' ? a.id : a))

    const mainId   = idea.mainAccountId != null ? String(idea.mainAccountId) : ids[0]
    const mainAcct = byId.get(mainId)
    const baseQty  = Number(idea.quantity) || 0
    const orderType = orderTypeLabel(idea.direction, idea.type)

    const orders = []
    for (const accId of ids) {
        const acct = byId.get(accId)
        if (!acct) continue   // can't resolve broker/balance — skip

        const isMain = accId === mainId
        const ratio  = (!isMain && mainAcct?.balance && acct.balance)
            ? acct.balance / mainAcct.balance
            : 1
        const quantity = Math.round(baseQty * ratio * 10000) / 10000

        orders.push({
            broker:    acct.broker,
            accountId: accId,
            accountNo: acct.login ?? accId,
            quantity,
            orderType,
            isMain,
        })
    }
    return orders
}
