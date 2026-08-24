/**
 * What is actually at stake in an order about to be placed.
 *
 * PURE. Takes the levels a `derive*Overlay` already extracted (chartOverlay.js — the one place that
 * knows how to read an idea's condition trees, a call's proposal and a setup's zones) plus the
 * order plan, and answers the four questions an approval screen has to answer: where do I get in,
 * where do I get out, what does that cost me, and what am I being paid to take it.
 *
 * It deliberately does NOT extract levels itself. Level-reading is one mechanism with one home; a
 * second parser here would be the same numbers derived twice, free to disagree with the chart the
 * user is looking at while they approve.
 *
 * ── The pessimistic convention ───────────────────────────────────────────────
 * Ported from `computeRR` in the backend's services/setup.schema.js, and kept deliberately
 * identical: every leg takes its UNFAVOURABLE side. For a long — the worst entry (highest), the
 * furthest stop (lowest), the nearest target. Quoting the midpoint or the furthest target flatters
 * the trade, and an approval screen is the last place that should happen. Keep the two in sync.
 *
 * Legs are selected BY PRICE, never by array position: levels arrive in whatever order they were
 * derived, so trusting the first target would hand a multi-target plan the R:R of its furthest leg.
 */

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))

/** Prices of one kind, cleaned and de-duplicated. */
function pricesOf(levels, kind) {
    return [...new Set((levels ?? [])
        .filter(l => l?.kind === kind)
        .map(l => num(l.price))
        .filter(p => p != null && p > 0))]
}

/**
 * Asset classes where one unit of quantity is one unit of the quote currency, so
 * `distance × quantity` IS the money at risk. A future or an FX lot carries a contract/lot
 * multiplier we do not have here, so for those the number is reported as a point-value and
 * flagged rather than dressed up as cash.
 */
const UNIT_IS_CURRENCY = new Set(['stock', 'stocks', 'equity', 'equities', 'etf'])

/**
 * @param {Object}   args
 * @param {Array}    args.levels      from deriveIdeaOverlay / deriveCallOverlay / deriveSetupOverlay
 * @param {Array}    args.orders      the order plan ({ quantity } per leg)
 * @param {string}   args.direction   'long' | 'short'
 * @param {string}   [args.assetClass]
 * @param {number}   [args.fallbackEntry]  a known entry price when no entry LEVEL exists
 *                                         (a resting entry's trigger); ignored if not finite
 * @returns {{
 *   entry: number|null, stop: number|null, targets: number[],
 *   stopDistance: number|null, stopPct: number|null, rr: number|null,
 *   quantity: number|null, riskAmount: number|null, riskIsCurrency: boolean,
 *   warnings: string[]
 * }}
 */
export function summarizeOrderRisk({ levels = [], orders = [], direction, assetClass = null, fallbackEntry = null } = {}) {
    const isLong = String(direction || '').toLowerCase() !== 'short'
    const warnings = []

    const entries = pricesOf(levels, 'entry')
    const stops   = pricesOf(levels, 'stop')
    const tps     = pricesOf(levels, 'tp')

    // Worst fill first. With no entry level at all this is a market order — fall back to a known
    // trigger price if one was passed, otherwise the entry is simply "market" and every derived
    // number below is honestly null rather than computed off a guess.
    const entry = entries.length
        ? (isLong ? Math.max(...entries) : Math.min(...entries))
        : num(fallbackEntry)

    // The failsafe rests at the far side — the most the plan admits losing.
    const stop = stops.length ? (isLong ? Math.min(...stops) : Math.max(...stops)) : null

    // Targets ordered by how soon they are reached, so the first one shown is the first one hit.
    const targets = [...tps].sort((a, b) => (isLong ? a - b : b - a))

    const quantity = (orders ?? []).reduce((sum, o) => {
        const q = num(o?.quantity)
        return q != null ? sum + q : sum
    }, 0) || null

    let stopDistance = null, stopPct = null, rr = null, riskAmount = null

    if (entry != null && stop != null) {
        // Signed by direction, so a stop on the WRONG side reads as negative rather than silently
        // becoming a positive "risk" via Math.abs — a long stopped above its entry is a broken plan
        // and has to say so, not be tidied into a plausible number.
        stopDistance = isLong ? entry - stop : stop - entry
        if (entry > 0) stopPct = (stopDistance / entry) * 100
        if (stopDistance <= 0) {
            warnings.push(isLong
                ? 'The stop sits at or above the entry — this plan cannot lose the way it is written.'
                : 'The stop sits at or below the entry — this plan cannot lose the way it is written.')
        } else if (quantity != null) {
            riskAmount = stopDistance * quantity
        }

        // Nearest target = least reward, per the convention above.
        if (targets.length && stopDistance > 0) {
            const reward = isLong ? targets[0] - entry : entry - targets[0]
            if (reward > 0) rr = Math.round((reward / stopDistance) * 100) / 100
            else warnings.push('The first target is on the losing side of the entry.')
        }
    }

    // The one warning worth interrupting for. An order with no stop is not a trade with a wide
    // stop, it is a position with no exit plan at all — and it was previously invisible here.
    if (stop == null) {
        warnings.push('No stop on this order — nothing will close it automatically if it goes against you.')
    }
    if (!targets.length) warnings.push('No take-profit level on this order.')

    const riskIsCurrency = UNIT_IS_CURRENCY.has(String(assetClass || '').toLowerCase())
    if (riskAmount != null && !riskIsCurrency) {
        warnings.push('Risk is price-distance × quantity — it does not include a contract or lot multiplier.')
    }

    return { entry, stop, targets, stopDistance, stopPct, rr, quantity, riskAmount, riskIsCurrency, warnings }
}

/**
 * Why the per-account quantities differ.
 *
 * The sizing rule is one line and it is the same in both implementations — `buildOrderPlan`
 * (backend services/orderPlan.service.js) and `buildOrderPreview` (the legacy-idea fallback in
 * tradeIdea.utils.js): **the MAIN account trades the size you set; every other account scales by
 * its balance ratio to the main account.** The approval screen showed the RESULT of that rule and
 * never the rule, so a second account quietly ordering 4.2 where you asked for 10 looked like a
 * bug or, worse, went unnoticed.
 *
 * The share is derived from the QUANTITIES, not from balances: it is the ratio that was actually
 * applied, which is the thing being explained. Balances aren't on the plan anyway, and re-deriving
 * from them could disagree with the number in the row.
 *
 * `isMain` may already be stamped (the idea/call preview paths do it); a raw backend plan — which
 * is what a `setup` hands over — has no such flag, so it is derived here. One resolution for all
 * three shapes, rather than each call site guessing.
 *
 * @param {Array}  orders          [{ accountId, quantity, isMain? }]
 * @param {string} [mainAccountId] `mainAccountId` (legacy idea) or `main_account_id` (call/setup)
 * @returns {{ rows: Array, total: number|null, mainQuantity: number|null, scaled: boolean }}
 */
export function describeAllocation(orders = [], mainAccountId = null) {
    const list = Array.isArray(orders) ? orders : []
    if (!list.length) return { rows: [], total: null, mainQuantity: null, scaled: false }

    const mainId = mainAccountId != null ? String(mainAccountId) : null
    // Fall back to the first row only when nothing identifies a main account — the same fallback
    // both builders use when mainAccountId is unset.
    const explicit = list.findIndex(o => (typeof o?.isMain === 'boolean' ? o.isMain : mainId != null && String(o?.accountId) === mainId))
    const mainIdx  = explicit >= 0 ? explicit : 0

    const mainQuantity = num(list[mainIdx]?.quantity)
    const rows = list.map((o, i) => {
        const q = num(o?.quantity)
        const isMain = i === mainIdx
        // Rounded to 4dp, the same way both order-plan builders round the quantity it is derived
        // from — 4.2 / 10 is 0.42000000000000004 in binary floating point, and a ratio is not the
        // place to leak that at a consumer.
        const share = (!isMain && q != null && mainQuantity) ? Math.round((q / mainQuantity) * 10000) / 10000 : null
        return {
            ...o,
            isMain,
            // Null rather than 1 for the main row: it has no share OF anything, it IS the base.
            share,
        }
    })

    const total = rows.reduce((sum, r) => {
        const q = num(r.quantity)
        return q != null ? sum + q : sum
    }, 0)

    return {
        rows,
        total: total || null,
        mainQuantity,
        // Only worth explaining when a second account actually got a DIFFERENT size. Two accounts
        // on equal balances order the same quantity, and narrating a rule that visibly did nothing
        // is noise on the one screen that should be quiet.
        scaled: rows.length > 1 && rows.some(r => !r.isMain && r.share != null && Math.abs(r.share - 1) > 0.0001),
    }
}

/**
 * Price formatter that keeps precision where the instrument needs it.
 *
 * The band is chosen by MAGNITUDE, then trailing zeros are trimmed — so an equity at 250.10 prints
 * "250.1" while EURUSD at 1.08425 keeps all five decimals. The cutoff is 10, not 1: every major FX
 * pair except the JPY crosses quotes just above 1.0 (EURUSD ~1.08, GBPUSD ~1.27), so a `< 1` band
 * rounded exactly the rates it existed to protect down to three decimals.
 */
export function fmtPrice(v) {
    const n = num(v)
    if (n == null) return '—'
    const abs = Math.abs(n)
    const dp = abs < 10 ? 5 : abs < 1000 ? 3 : 2
    return n.toFixed(dp).replace(/\.?0+$/, '')
}
