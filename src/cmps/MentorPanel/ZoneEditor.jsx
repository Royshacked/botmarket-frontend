import PropTypes from 'prop-types'
import './ZoneEditor.scss'

// The zone editor — the genuinely new piece of Mentor's UI.
//
// A legacy idea was a condition TREE (leaves, operators, timeframes), so it needed ConditionTree.jsx.
// A setup is LEVELS: entry / stop / take-profit, each an exact price with a quantity and, optionally,
// a condition of its own. That is a much simpler shape and it deserves a much simpler editor.
//
// IT USED TO EDIT BANDS — two edges per level, sorted on commit. Bands are gone
// (docs/desks/talos-guards.md): they existed only because the monitor sampled price too rarely to
// catch an exact level, and it does not any more. A LEGACY document still holds real bands, and its
// row shows the edge that actually acts (see zonePrice) — touching it collapses the band to that
// price, which is the migration rather than a loss.
//
// IT EDITS A SCENARIO, NOT THE SETUP. A price zone is a scenario — a premise owning its own entry,
// stop, targets and conditions — and the setup's flat `entry_zones`/`stop_zones`/`tp_zones` are the
// server's EXECUTION PROJECTION of whichever premise armed, i.e. output. Writing to them would look
// accepted here and be silently discarded on Generate, because normalizeSetup reads `scenarios`.
//
// One number per level, written to BOTH stored edges. The sort-on-blur that used to keep two edges
// in order is gone with the edges: a price cannot be out of order with itself.
//
// Quantities: ONE entry zone per scenario, carrying the WHOLE position — scenarios are rivals, so
// the first to fulfil takes the trade and sizes are never added across them. Exit zones split that
// position (multiple = staged exits), and the running total is shown so a mis-split is visible.

const GROUPS = [
    { key: 'entry_zones', label: 'Entry',  suffix: 'e', hint: 'Where you want to be filled. One per entry scenario — a second entry is a second scenario, not a second zone.',
      priceLabel: 'Entry price', pricePh: 'price' },
    { key: 'stop_zones',  label: 'Stop',   suffix: 's', hint: 'Where this premise is wrong. It rests at the broker as the failsafe — a condition on it can only tighten the exit, never replace it.',
      priceLabel: 'Stop', pricePh: 'stop' },
    { key: 'tp_zones',    label: 'Target', suffix: 't', hint: 'Where you take profit. With no condition it rests as a limit and fills on its own; WITH one it waits for the monitor to propose it, because a resting limit would fill regardless of what the condition said. Several targets = staged exits.',
      priceLabel: 'Target', pricePh: 'target' },
]

const num = (v) => (v === '' || v == null ? null : Number(v))

/**
 * The price a level is AT.
 *
 * Moot for anything authored now — a level is zero-width, so both stored edges are the same number.
 * It matters for a LEGACY document whose bands a Mentor really did draw: showing `lower` would put
 * "199" in the box for a 199–201 entry, which reads as a fact and is not one.
 *
 * So it returns the edge the band ACTS at, matching what the broker was already holding:
 *   • target — the far edge, where the limit rests
 *   • stop   — the far edge, the failsafe (setup.schema.zoneLevel decides this server-side)
 *   • entry  — no far/near meaning without knowing fade-vs-breakout, so `lower`, unchanged.
 *
 * Nothing is invented: every value returned is an edge the document actually holds. Pure.
 *
 * Module-local on purpose: the component is its only caller, and exporting a helper from a component
 * file is the fast-refresh warning this codebase already carries two of.
 */
function zonePrice(zone, key, direction) {
    if (!zone) return null
    if (zone.lower === zone.upper) return zone.lower
    const long = direction !== 'short'
    if (key === 'tp_zones')   return long ? zone.upper : zone.lower
    if (key === 'stop_zones') return long ? zone.lower : zone.upper
    return zone.lower
}

/**
 * `lockPrices` is NOT `readOnly` with a smaller blast radius — it is the shape of a plan that
 * arrived from somewhere else. Someone hands you their setup; the levels are theirs and you are
 * looking at them, but the SIZE is yours and is the one thing you must type. So the price edges go
 * flat while the quantity boxes stay live, and zones can be neither added nor removed.
 *
 * The two are ordered, not equivalent: `readOnly` wins over everything (a generated setup is not
 * editable at all), and `lockPrices` narrows only the prices.
 *
 * A price is written as a ZERO-WIDTH band (`lower === upper`), which is what the schema calls an
 * exact level. The stored shape is unchanged, so nothing downstream learns a new case — see the
 * note on the storage shape in services/setup.schema.js.
 */
export function ZoneEditor({
    scenario, direction = null, onChange, readOnly = false, lockPrices = false, groups = null,
}) {
    if (!scenario) return null

    // Structure — which zones exist, and where they sit.
    const frozen = readOnly || lockPrices

    const patch = (groupKey, zones) => onChange?.({ ...scenario, [groupKey]: zones })

    // UPSERT, not map. An empty group renders one ready-to-type row that does not exist in the data
    // yet — asking someone to press + before they can type their entry price is
    // a click charged for nothing. The row becomes real on the first keystroke.
    function writeZone(groupKey, id, patchFields) {
        const zones = scenario[groupKey] ?? []
        const next  = zones.some(z => z.id === id)
            ? zones.map(z => (z.id === id ? { ...z, ...patchFields } : z))
            : [...zones, { id, lower: null, upper: null, quantity: null, note: null, ...patchFields }]
        patch(groupKey, next)
    }

    function updateZone(groupKey, id, field, raw) {
        writeZone(groupKey, id, { [field]: num(raw) })
    }

    /**
     * A condition on this LEG — "out early if it closes below the 4hr VWAP".
     *
     * It used to be written to the zone's `note`: free text that rode along to the ENTRY assessment
     * and was dropped from the in-position payload — so a condition typed on a stop was read while
     * waiting to get in and never once after. It is a real `conditions[]` entry now, in exactly the
     * shape an entry condition has, judged by exactly the same read.
     *
     * The three tags are Mentor's to make and are deliberately not asked for here: a trader knows
     * what they meant and has no reason to know this app files conditions on three axes. Text alone
     * normalises server-side to confirming / judgment / live.
     *
     * ONE condition per leg from this surface. A level needing two sentences is a level needing a
     * conversation, and Mentor is on the other side of the same panel.
     */
    function updateLegCondition(groupKey, id, raw) {
        const text = String(raw ?? '').trim()
        const kept = ((scenario[groupKey] ?? []).find(z => z.id === id)?.conditions ?? [])[0]
        writeZone(groupKey, id, {
            conditions: text ? [{ ...(kept ?? {}), id: kept?.id ?? `${id}c1`, text }] : [],
        })
    }

    /** The one leg condition, as text. */
    const legCondition = (zone) => (zone?.conditions?.[0]?.text ?? '')

    // A single price, written to BOTH edges — a zero-width band. Not a sentinel and not a
    // placeholder: it is what the schema calls an exact level, so this shape is monitorable even if
    // Mentor never gets a chance to widen it.
    function updatePrice(groupKey, id, raw) {
        const p = num(raw)
        writeZone(groupKey, id, { lower: p, upper: p })
    }

    return (
        <div className="zone-editor">
            {GROUPS.filter(g => !groups || groups.includes(g.key)).map(({ key, label, suffix, hint, priceLabel, pricePh }) => {
                const zones = scenario[key] ?? []
                // The ready-to-type row. Its id is minted deterministically — the same one addZone
                // would give it — so it is stable across renders and becomes the real zone's id.
                const rows  = (!frozen && zones.length === 0)
                    ? [{ id: `${scenario.id ?? 's'}${suffix}1`, lower: null, upper: null, quantity: null, note: null }]
                    : zones
                // Exits can carry a qualifying note; the entry cannot, because it has real
                // conditions of its own and a second free-text box beside them would be two places
                // to say the same thing.
                const notable = key !== 'entry_zones'
                // Off the REAL zones: a placeholder nobody has typed into contributes no size.
                const total = zones.reduce((s, z) => s + (Number(z.quantity) || 0), 0)
                // A scenario takes the whole position at one entry; scaling in is not supported yet
                // and the server refuses it, so the affordance is not offered.
                //
                // Counted off `rows`, not `zones`: the ready-to-type row IS the one entry allowed,
                // so counting the underlying data would offer a "+" beside it that can only ever
                // produce the row already on screen.
                //
                // In the EXPRESS FORM it moves out of the header entirely (see the inline "+" on the
                // row below), so there is nothing to show up here.
                const canAdd = false

                return (
                    <section className="zone-editor__group" key={key}>
                        <header className="zone-editor__head">
                            <h4 className="zone-editor__title" title={hint}>{label}</h4>
                            {total > 0 && <span className="zone-editor__total">{total}</span>}
                            {canAdd && (
                                <button type="button" className="zone-editor__add" onClick={() => addZone(key, suffix)} title={`Add a ${label.toLowerCase()} zone`}>
                                    +
                                </button>
                            )}
                        </header>

                        {rows.length === 0 && <p className="zone-editor__empty">No {label.toLowerCase()} zone yet.</p>}

                        {rows.map((zone, zi) => {
                            // ONE number, written to both edges. Mentor widens it into a real band
                            // later; until then it is an exact level, which is a valid zone rather
                            // than a placeholder — so a form that never reaches Mentor still works.
                            //
                            // The entry is excluded from "add another": a scenario takes the whole
                            // position at one entry, and a second way in is a second SCENARIO.
                            const addAfter = !frozen
                                && key !== 'entry_zones'
                                && zi === rows.length - 1
                                && Number.isFinite(zonePrice(zone, key, direction))

                            return (
                                <div className="zone-editor__zone zone-editor__zone--price" key={zone.id}>
                                    {/* TWO BOXES, and they are small because what goes in them is
                                        small: a price and a size. The build worksheet's row is wide
                                        because it holds a BAND — two edges and a dash — and carrying
                                        that width over to a single number would leave most of the
                                        field empty and imply there is more to type than there is.

                                        The captions sit under the boxes rather than inside them as
                                        placeholders: a placeholder disappears exactly when you want
                                        to check what you typed into which box. `aria-label` still
                                        names the level (“Stop s1s”), so the caption can stay as
                                        short as the box is. */}
                                    <label className="zone-editor__cell">
                                        <input
                                            className="zone-editor__box" type="number" inputMode="decimal"
                                            value={zonePrice(zone, key, direction) ?? ''} disabled={frozen}
                                            aria-label={`${priceLabel} ${zone.id}`}
                                            onChange={e => updatePrice(key, zone.id, e.target.value)}
                                        />
                                        <span className="zone-editor__cell-label">{pricePh}</span>
                                    </label>

                                    <label className="zone-editor__cell">
                                        <input
                                            className="zone-editor__box" type="number" inputMode="numeric" min="0"
                                            value={zone.quantity ?? ''} disabled={readOnly}
                                            aria-label={`${priceLabel} ${zone.id} quantity`}
                                            onChange={e => updateZone(key, zone.id, 'quantity', e.target.value)}
                                        />
                                        <span className="zone-editor__cell-label">qty</span>
                                    </label>

                                    {!frozen && rows.length > 1 && (
                                        <button type="button" className="zone-editor__remove" onClick={() => removeZone(key, zone.id)} aria-label={`Remove ${zone.id}`}>
                                            ×
                                        </button>
                                    )}

                                    {/* ADD ANOTHER, on the row rather than in the group heading, and
                                        only once THIS one has a price.

                                        Beside the boxes because that is what it does — "another one
                                        of these" reads off the thing it copies, whereas a "+" next to
                                        the word "Target" is as easily read as adding a target to the
                                        setup, or a step to the form.

                                        Gated on filled because staged exits are a SECOND target, and
                                        offering one before the first has a number invites a column of
                                        empty rows to fill downward. Price only, not size: sizing
                                        usually comes last, and requiring it would block naming both
                                        levels while you decide how to split them.

                                        Last row only, or every filled level would carry its own. */}
                                    {addAfter && (
                                        <button
                                            type="button" className="zone-editor__add-inline"
                                            onClick={() => addZone(key, suffix)}
                                            aria-label={`Add another ${label.toLowerCase()}`}
                                            title={key === 'tp_zones'
                                                ? 'Another target — bank part of the position here, the rest higher up.'
                                                : `Another ${label.toLowerCase()} level.`}
                                        >
                                            +
                                        </button>
                                    )}

                                    {/* THE OPTIONAL CONDITION ON AN EXIT, on its own line. A stop or
                                        a target is usually just a price, but sometimes it only counts
                                        under a condition — "only on a 15min close below".

                                        Below the box rather than beside it: it is prose next to a
                                        number, and inline it stretched the row into the wide field
                                        the box exists to avoid.

                                        WHAT IT COSTS DIFFERS BY LEG, and the title says which rather
                                        than leaving it to be discovered from a missing order. A
                                        conditional STOP still rests at the broker — a condition can
                                        only make that exit tighter. A conditional TARGET does not
                                        rest: a limit at the price would fill whatever the condition
                                        said, so it waits for the monitor's read instead. */}
                                    {notable && !frozen && (
                                        <input
                                            className="zone-editor__note-input" type="text"
                                            value={legCondition(zone)} placeholder="only if… (optional)"
                                            aria-label={`${priceLabel} ${zone.id} condition`}
                                            title={key === 'tp_zones'
                                                ? 'Optional. A condition on this target — it will NOT rest as a limit; the monitor proposes it and you confirm.'
                                                : 'Optional. A condition on this stop — the stop rests at the broker either way; this can only tighten it.'}
                                            onChange={e => updateLegCondition(key, zone.id, e.target.value)}
                                        />
                                    )}
                                    {notable && frozen && legCondition(zone) && <p className="zone-editor__note">{legCondition(zone)}</p>}
                                    {zone.note && <p className="zone-editor__note">{zone.note}</p>}
                                </div>
                            )

                        })}
                    </section>
                )
            })}
        </div>
    )
}

const zoneShape = PropTypes.shape({
    id:       PropTypes.string.isRequired,
    lower:    PropTypes.number,
    upper:    PropTypes.number,
    quantity: PropTypes.number,
    note:     PropTypes.string,
})

ZoneEditor.propTypes = {
    scenario: PropTypes.shape({
        id:          PropTypes.string,
        entry_zones: PropTypes.arrayOf(zoneShape),
        stop_zones:  PropTypes.arrayOf(zoneShape),
        tp_zones:    PropTypes.arrayOf(zoneShape),
    }),
    // Which edge of a target band is the take-profit depends on it. Optional: without it the edges
    // stay generically named rather than risk labelling the exit the wrong way round.
    direction: PropTypes.oneOf(['long', 'short']),
    onChange:  PropTypes.func,
    readOnly:  PropTypes.bool,
    // Prices flat, sizes live — a plan someone else drew. See the component doc.
    lockPrices: PropTypes.bool,
    // One price per level instead of two edges — the express form. Mentor draws the bands after.
    // Render only these groups, so a caller can split entry from exit into separate blocks.
    // Null = all three, which is what the build worksheet wants.
    groups:     PropTypes.arrayOf(PropTypes.string),
}
