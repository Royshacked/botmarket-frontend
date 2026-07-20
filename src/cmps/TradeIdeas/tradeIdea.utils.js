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
 * Open an idea in its own pop-out window (the /idea/:id page). The idea object is
 * handed to the new window directly (and mirrored to localStorage as a fallback)
 * so it renders instantly without a round-trip; IdeaPage also falls back to the
 * API when neither is present, so a direct URL still works.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {Window|null}
 */
export function openIdeaPopup(idea) {
    localStorage.setItem(`popup-idea-${idea.id}`, JSON.stringify(idea))
    const popup = window.open(`/idea/${idea.id}`, `idea-${idea.id}`, 'width=960,height=720')
    if (popup) popup.__ideaData = idea
    return popup
}

/**
 * Pop-out detail window for a Kairos call (mirrors openIdeaPopup). Accepts a full call object
 * (stashed for instant render) or a bare call id (CallPage fetches it from the API). Used by the
 * Call cards, social-chat bubbles, and the Positions tab (a call-originated position → its Call).
 *
 * @param {import('../../types.js').Call|string} call  a call object or its id
 * @returns {Window|null}
 */
export function openCallPopup(call) {
    const id = typeof call === 'string' ? call : call?.id
    if (!id) return null
    const isObj = call && typeof call === 'object'
    if (isObj) localStorage.setItem(`popup-call-${id}`, JSON.stringify(call))
    const popup = window.open(`/call/${id}`, `call-${id}`, 'width=1180,height=760')
    if (popup && isObj) popup.__callData = call
    return popup
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
 * Group open positions for the Positions tab by their owning idea's portfolio.
 *
 * A position links to an idea (via brokerOrders); an idea may carry a portfolioId.
 * Positions whose idea is in a portfolio collapse under a portfolio group; every
 * other position (standalone idea, or an idea-less/orphan broker position) renders
 * flat in `loose`. Positions are already one-per-account at the broker, so a single
 * idea or portfolio spanning N accounts naturally yields N rows — no extra splitting.
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
    if (idea?.broker === 'paper') return true
    if (String(idea?.mainAccountId ?? '').startsWith('paper-')) return true
    return (idea?.accounts ?? []).some(a =>
        String(typeof a === 'object' ? a.id : a).startsWith('paper-'))
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
    if (idea?.broker === 'manual') return true
    if (String(idea?.mainAccountId ?? '').startsWith('manual-')) return true
    return (idea?.accounts ?? []).some(a =>
        String(typeof a === 'object' ? a.id : a).startsWith('manual-'))
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
