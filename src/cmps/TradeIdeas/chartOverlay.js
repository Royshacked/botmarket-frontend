import { isLivePosition, isTerminal, isAwaitingConfirm, isInvalidated } from '../../services/entityStatus.js'
// Derive what to draw on an idea/call's chart: trade LEVELS (entry/stop/tp/zones) + relevant
// INDICATORS. Consumed by IdeaDetail / CallPage → PriceChart, which just draws the spec.
//
// Level sourcing is clean-numeric only (no free-text parsing):
//   - Call: entry_zones / reference_levels (pre-proposal) → proposal entry/stop/tp (ready) →
//     position_state entry/stop/targets/exit (in position / closed).
//   - Idea: invalidation band always; when IN POSITION, entry (from the live position fill) +
//     stop/tp (nativeProtection). An idea's entry/stop/tp live as FREE TEXT in leaf conditions and
//     are intentionally NOT parsed here (deferred) — so a pre-position idea shows only its
//     invalidation band.
//
// Indicators are extracted from the item's free text (idea conditions / call patterns) by
// textToIndicators — the frontend mirror of the backend _buildStudies (chart.evaluator.js) +
// studiesToIndicators (studyTranslate.js). Keep the two in sync.

import { phaseTree } from './tradeIdea.utils.js'

// ── Indicator extraction (mirror of backend _buildStudies + studiesToIndicators) ──
const MAX_INDICATORS = 3

/**
 * Free-text (conditions / pattern names) → klinecharts indicator descriptors
 * { name, calcParams, overlay }. overlay:true draws on the candle pane; false = own sub-pane.
 * VOL is intentionally omitted — the chart always shows a volume pane already.
 */
export function textToIndicators(text) {
    const t   = String(text || '')
    const out = []
    const seen = new Set()
    const add = (name, calcParams, overlay) => {
        const key = `${name}(${calcParams.join(',')})`
        if (!seen.has(key) && out.length < MAX_INDICATORS) { out.push({ name, calcParams, overlay }); seen.add(key) }
    }

    // All matches are WORD-BOUNDED so incidental substrings don't trigger an indicator.
    if (/\bvwap\b/i.test(t)) add('VWAP', [], true)
    if (/\bmacd\b/i.test(t)) add('MACD', [12, 26, 9], false)
    if (/\bbollinger\b|\bbb\b/i.test(t)) add('BOLL', [20, 2], true)
    // RSI / ATR — a bare mention ("RSI divergence") is a real reference; use the named period or
    // the standard default (14).
    const rsi = t.match(/\brsi\b\s*\(?\s*(\d+)?/i); if (rsi) add('RSI', [Number(rsi[1] ?? 14)], false)
    const atr = t.match(/\batr\b\s*\(?\s*(\d+)?/i); if (atr) add('ATR', [Number(atr[1] ?? 14)], false)
    // EMA / SMA need an explicit period — a bare "moving average" doesn't say which to draw.
    for (const m of t.matchAll(/\bema\s*\(?\s*(\d+)/gi)) add('EMA', [Number(m[1])], true)
    for (const m of t.matchAll(/\bsma\s*\(?\s*(\d+)/gi)) add('MA',  [Number(m[1])], true)
    return out
}

// ── helpers ───────────────────────────────────────────────────────────────────
// null and '' must be rejected BEFORE Number(), which coerces both to 0 — a "level" at price zero
// is not a level, and it drew a line at the bottom of the chart for any absent stop, fill price or
// reference level. Shared by all three derive* functions, so this is fixed in exactly one place.
const num = (v) => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

/** Volume-weighted average entry across a set of positions, or null. */
function weightedAvgEntry(positions) {
    let cost = 0, qty = 0
    for (const p of positions || []) {
        const e = Number(p?.entryPrice), q = Math.abs(Number(p?.volume))
        if (Number.isFinite(e) && e > 0 && Number.isFinite(q) && q > 0) { cost += e * q; qty += q }
    }
    return qty > 0 ? cost / qty : null
}

/** Flatten a condition tree's leaf `condition` strings (handles nested trees + legacy flat). */
function collectConditions(node, out) {
    if (!node) return
    if (typeof node === 'string') { out.push(node); return }
    if (node.condition) out.push(String(node.condition))
    if (Array.isArray(node.children)) node.children.forEach(c => collectConditions(c, out))
}

// A leaf whose condition references an indicator or a timeframe/period — its numbers are NOT prices.
const NON_PRICE_LEAF = /rsi|macd|bollinger|\bema\b|\bsma\b|\bvwap\b|\batr\b|volume|\bma\b|day|week|month|hour|min|period|\bbar/i

/**
 * Extract a PRICE from a condition leaf string, conservatively — returns null unless it's clearly a
 * plain price level, so an idea's free-text stop/tp/entry conditions never draw a WRONG line. Skips
 * indicator-threshold / timeframe leaves; takes the number after a comparator/touch keyword, else a
 * decimal-looking number.
 */
export function parseConditionPrice(cond) {
    const s = String(cond || '')
    if (!s || NON_PRICE_LEAF.test(s)) return null
    let m = s.match(/(?:>=|<=|>|<|touch(?:es)?|cross(?:es)?|above|below|reach(?:es)?|hits?|breaks?|at)\s*\$?\s*(\d[\d,]*\.?\d*)/i)
    if (!m) m = s.match(/\$?\b(\d[\d,]*\.\d+)\b/)   // else a decimal-looking price
    if (!m) return null
    const n = Number(m[1].replace(/,/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
}

/** Distinct prices parsed from a phase's condition-tree leaves (skips non-price leaves). */
function treePrices(tree) {
    const conds = []
    collectConditions(tree, conds)
    return [...new Set(conds.map(parseConditionPrice).filter(p => p != null))]
}

/** Drop levels with the same kind at a (near-)identical price so we don't stack duplicate lines. */
function dedupeLevels(levels) {
    const seen = new Set()
    return levels.filter(l => {
        if (l.price == null) return false
        const key = `${l.kind}|${l.price.toFixed(4)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

// ── Setup ───────────────────────────────────────────────────────────────────
/**
 * A `setup`'s levels. Its plan is authored as ZONES (entry/stop/tp), not single prices — a zone is
 * a region price has to reach, so each edge is a real level and both are drawn.
 *
 * The zone edges are already clean numbers (setup.schema normalizeZones), so unlike an idea there
 * is no free-text parsing here and nothing is deferred.
 *
 * @param {object} setup
 * @returns {{ levels: Array, indicators: Array }}
 */
export function deriveSetupOverlay(setup) {
    if (!setup) return { levels: [], indicators: [] }
    const levels = []
    const side   = setup.direction || null

    const pushZones = (zones, kind, label) => {
        (zones || []).forEach((z, i) => {
            const tag = (zones.length > 1 && kind === 'tp') ? `${label}${i + 1}` : label
            if (num(z?.lower) != null) levels.push({ kind, price: num(z.lower), label: tag, side })
            if (num(z?.upper) != null) levels.push({ kind, price: num(z.upper), label: tag, side })
        })
    }
    pushZones(setup.entry_zones, 'entry', 'Entry')
    pushZones(setup.stop_zones,  'stop',  'Stop')
    pushZones(setup.tp_zones,    'tp',    'TP')

    // The validity range — beyond it the premise is gone (setup.schema §validity).
    const v = setup.validity || {}
    if (num(v.lower) != null) levels.push({ kind: 'invalidation', price: num(v.lower), label: 'Invalidation' })
    if (num(v.upper) != null) levels.push({ kind: 'invalidation', price: num(v.upper), label: 'Invalidation' })

    const text = [setup.thesis || '', ...(setup.conditions || []).map(c => c?.text || '')].join(' ; ')
    return { levels: dedupeLevels(levels), indicators: textToIndicators(text) }
}

// ── Idea ────────────────────────────────────────────────────────────────────
/**
 * @param {object} idea
 * @param {object[]} positions  open positions matched to this idea (for the in-position entry)
 * @returns {{ levels: Array, indicators: Array }}
 */
export function deriveIdeaOverlay(idea, positions = []) {
    if (!idea) return { levels: [], indicators: [] }
    const levels = []
    const side   = idea.direction || null

    // Entry: in position → the actual fill (weighted avg); otherwise the planned entry parsed from
    // the entry conditions.
    if (positions.length > 0) {
        const entry = weightedAvgEntry(positions)
        if (entry != null) levels.push({ kind: 'entry', price: entry, label: 'Entry', side })
    } else {
        treePrices(phaseTree(idea, 'entry')).forEach(p => levels.push({ kind: 'entry', price: p, label: 'Entry', side }))
    }

    // Stop / TP: prefer the clean native-protection numbers; otherwise parse them from the condition
    // trees (nativeProtection is null for software-monitored / paper ideas). Conservative parse — a
    // leaf that isn't a plain price contributes nothing rather than a wrong line.
    const npStop = num(idea.nativeProtection?.stop)
    if (npStop != null) levels.push({ kind: 'stop', price: npStop, label: 'Stop', side })
    else treePrices(phaseTree(idea, 'stop')).forEach(p => levels.push({ kind: 'stop', price: p, label: 'Stop', side }))

    const npTp = num(idea.nativeProtection?.tp)
    if (npTp != null) levels.push({ kind: 'tp', price: npTp, label: 'TP', side })
    else {
        const tps = treePrices(phaseTree(idea, 'tp'))
        tps.forEach((p, i) => levels.push({ kind: 'tp', price: p, label: tps.length > 1 ? `TP${i + 1}` : 'TP', side }))
    }

    // Invalidation envelope — drawn whether or not in position.
    const inv = idea.invalidation || {}
    if (num(inv.low)  != null) levels.push({ kind: 'invalidation', price: num(inv.low),  label: 'Invalidation' })
    if (num(inv.high) != null) levels.push({ kind: 'invalidation', price: num(inv.high), label: 'Invalidation' })

    const condTexts = []
    for (const phase of ['entry', 'stop', 'tp']) collectConditions(phaseTree(idea, phase), condTexts)

    return { levels: dedupeLevels(levels), indicators: textToIndicators(condTexts.join(' ; ')) }
}

// ── Call ────────────────────────────────────────────────────────────────────
/**
 * @param {object} call
 * @returns {{ levels: Array, indicators: Array }}
 */
export function deriveCallOverlay(call) {
    if (!call) return { levels: [], indicators: [] }
    const levels = []
    const ps     = call.position_state
    const p      = call.monitor_state?.last_assessment?.proposal
    const status = call.status
    const side   = ps?.entry?.direction || call.bias || null

    if (ps && (isLivePosition(status) || isTerminal(status))) {
        const entry = ps.entry?.fill_price ?? ps.entry?.intended
        if (num(entry) != null) levels.push({ kind: 'entry', price: num(entry), label: 'Entry', side })
        if (num(ps.stop?.current) != null) levels.push({ kind: 'stop', price: num(ps.stop.current), label: 'Stop', side })
        ;(ps.targets || []).forEach((t, i) => {
            if (num(t?.price) != null) levels.push({ kind: 'tp', price: num(t.price), label: `TP${i + 1}${t.hit_at ? ' ✓' : ''}`, side })
        })
        if (status === 'closed' && num(ps.outcome?.exit_price) != null) {
            levels.push({ kind: 'exit', price: num(ps.outcome.exit_price), label: 'Exit', side })
        }
    } else if (p && (isAwaitingConfirm(status) || isInvalidated(call.invalidation_status))) {
        if (num(p.entry) != null) levels.push({ kind: 'entry', price: num(p.entry), label: 'Entry', side })
        if (num(p.stop)  != null) levels.push({ kind: 'stop',  price: num(p.stop),  label: 'Stop',  side })
        ;(p.take_profit || []).forEach((t, i) => {
            if (num(t?.price) != null) levels.push({ kind: 'tp', price: num(t.price), label: `TP${i + 1}`, side })
        })
    } else {
        // Pre-proposal: the entry zone(s) + reference levels the call was authored with. The zone IS
        // the planned entry region (a ready call has no single entry price yet), so label it as such.
        for (const z of call.entry_zones || []) {
            if (num(z.lower) != null) levels.push({ kind: 'zone', price: num(z.lower), label: 'Entry zone', side: z.side })
            if (num(z.upper) != null) levels.push({ kind: 'zone', price: num(z.upper), label: 'Entry zone', side: z.side })
        }
        for (const r of call.reference_levels || []) {
            if (num(r.price) != null) levels.push({ kind: 'ref', price: num(r.price), label: r.kind || 'Level' })
        }
    }

    // Indicators the call references — from its pattern names / look-fors and the thesis prose.
    const patText = [call.thesis || '', ...(call.patterns || []).map(pt => `${pt.name || ''} ${pt.look_for || ''}`)].join(' ; ')
    return { levels: dedupeLevels(levels), indicators: textToIndicators(patText) }
}
