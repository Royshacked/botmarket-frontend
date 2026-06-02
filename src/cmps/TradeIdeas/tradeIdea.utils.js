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
 * @param {object} idea  Trade idea document
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
