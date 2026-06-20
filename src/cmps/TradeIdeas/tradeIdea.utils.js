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
 * Best available one-line summary for a trade idea's entry conditions.
 * Priority: condition tree → flat conditions array → notes → null
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {string|null}
 */
export function conditionSummary(idea) {
    if (!idea) return null

    // New tree format
    if (idea.entry_condition_tree) {
        const s = treeToOneliner(idea.entry_condition_tree)
        if (s) return s
    }

    // Legacy flat array
    if (Array.isArray(idea.entry_conditions) && idea.entry_conditions.length > 0) {
        const logic = idea.entry_logic ?? 'AND'
        const parts = idea.entry_conditions
            .map(c => (typeof c === 'string' ? c : c?.condition)?.trim())
            .filter(Boolean)
        if (parts.length > 0) return parts.join(`  ${logic}  `)
    }

    // Final fallback: notes
    return idea.notes?.trim() || null
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
 * True when an idea must not be deleted from the client — it's live on the broker
 * (in position: 'long'/'short') or fired and awaiting confirmation ('hit'). Deleting
 * it would orphan a real position/order, so the bin/Delete control is disabled for
 * these. A 'closed' idea is done and stays deletable.
 *
 * @param {import('../../types.js').Idea} idea
 * @returns {boolean}
 */
export function isDeleteLocked(idea) {
    return ['hit', 'long', 'short'].includes(idea?.status)
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
