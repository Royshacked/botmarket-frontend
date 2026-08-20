import PropTypes from 'prop-types'
import './ZoneEditor.scss'

// The zone editor — the genuinely new piece of Mentor's UI.
//
// A legacy idea was a condition TREE (leaves, operators, timeframes), so it needed ConditionTree.jsx.
// A setup is BANDS: entry / stop / take-profit, each a `lower`–`upper` range with a quantity. That's
// a much simpler shape and it deserves a much simpler editor.
//
// IT EDITS A SCENARIO, NOT THE SETUP. A price zone is a scenario — a premise owning its own entry,
// stop, targets and conditions — and the setup's flat `entry_zones`/`stop_zones`/`tp_zones` are the
// server's EXECUTION PROJECTION of whichever premise armed, i.e. output. Writing to them would look
// accepted here and be silently discarded on Generate, because normalizeSetup reads `scenarios`.
//
// Two rules this component enforces, because they're what make a band monitorable:
//   • lower ≤ upper. Edges are SORTED on commit rather than rejected — the user is typing two
//     numbers, and which one lands first is not a thing to scold them about.
//   • a band may be zero-width. That's an exact level, not an error; the server accepts it and the
//     gate is inclusive on both edges so it can still trip.
//
// Quantities: ONE entry zone per scenario, carrying the WHOLE position — scenarios are rivals, so
// the first to fulfil takes the trade and sizes are never added across them. Exit zones split that
// position (multiple = staged exits), and the running total is shown so a mis-split is visible.

const GROUPS = [
    { key: 'entry_zones', label: 'Entry',  suffix: 'e', hint: 'Where you want to be filled. One per entry scenario — a second entry is a second scenario, not a second zone.',
      priceLabel: 'Entry price', pricePh: 'price' },
    { key: 'stop_zones',  label: 'Stop',   suffix: 's', hint: 'Where this premise is wrong. The far edge rests at the broker as the failsafe.',
      priceLabel: 'Stop', pricePh: 'stop' },
    { key: 'tp_zones',    label: 'Target', suffix: 't', hint: 'The far edge IS your take-profit, and the limit rests there. The near edge is where Talos wakes to offer you a partial on the way — the gap between them is how long you get to answer. Equal edges = an exact level, taken without asking. Several zones = staged exits.',
      priceLabel: 'Target', pricePh: 'target' },
]

const num = (v) => (v === '' || v == null ? null : Number(v))

/**
 * What each edge of a band is CALLED. Entry and stop are ranges, so their edges are just edges. A
 * target is not: the far edge is the take-profit itself and the near edge opens the conversation
 * about banking early (see the group hint). Which of `lower`/`upper` is which depends on the
 * direction, so without one we stay generic rather than guess and label the exit wrong.
 */
function edgeNames(key, direction) {
    if (key !== 'tp_zones' || !direction) {
        return { lower: 'lower edge', upper: 'upper edge', lowerPh: 'from', upperPh: 'to' }
    }
    return direction === 'long'
        ? { lower: 'window edge', upper: 'target',      lowerPh: 'window', upperPh: 'target' }
        : { lower: 'target',      upper: 'window edge', lowerPh: 'target', upperPh: 'window' }
}

/**
 * The single price a band is ABOUT, for the prices-only editor.
 *
 * Almost always moot: a plan typed into the express form is zero-width everywhere, so both edges are
 * the same number. It matters on one path — unlocking a setup somebody shared, whose bands their
 * Mentor already drew. Showing `lower` there would put "199" in the box for a 199–201 entry, which
 * reads as a fact and is not one.
 *
 * So it returns the edge the band is NAMED BY, which each group already documents:
 *   • target — the far edge IS the take-profit, where the limit rests (see edgeNames)
 *   • stop   — the far edge is what rests at the broker as the failsafe (see GROUPS)
 *   • entry  — no far/near meaning without knowing fade-vs-breakout, so `lower`, unchanged.
 *
 * Nothing is invented: every value returned is an edge the sender actually wrote. Pure.
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
 * `pricesOnly` is the EXPRESS FORM's shape, and the reason it exists is a division of labour rather
 * than a simplification.
 *
 * A user with a plan already made has PRICES — "entry 199, stop 196.5, target 210". They do not have
 * bands, and asking them to invent a lower and an upper edge asks them to do work that is not
 * theirs: band width is ATR-and-structure judgment (Mentor's prompt specifies it — a breakout zone
 * is a window opening at the trigger, a TP window is its mirror, breadth ~0.5-1 ATR). So the form
 * takes the number they have and Mentor draws the band afterwards.
 *
 * Each price is written as a ZERO-WIDTH band (lower === upper), which is already a legal zone — an
 * exact level, monitorable as-is. So the wire shape never changes, nothing downstream learns a new
 * case, and a form that is never handed to Mentor still generates something that works.
 */
export function ZoneEditor({
    scenario, direction = null, onChange, readOnly = false, lockPrices = false,
    pricesOnly = false, groups = null,
}) {
    if (!scenario) return null

    // Structure — which zones exist, and where they sit.
    const frozen = readOnly || lockPrices

    const patch = (groupKey, zones) => onChange?.({ ...scenario, [groupKey]: zones })

    // UPSERT, not map. In `pricesOnly` an empty group is rendered as one ready-to-type row that does
    // not exist in the data yet — asking someone to press + before they can type their entry price is
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

    // The note is TEXT and must not go through `num` — that is the one field on a zone that is not a
    // number, and coercing it would store NaN and lose what the user wrote.
    function updateNote(groupKey, id, raw) {
        writeZone(groupKey, id, { note: raw === '' ? null : String(raw) })
    }

    // A single price, written to BOTH edges — a zero-width band. Not a sentinel and not a
    // placeholder: it is what the schema calls an exact level, so this shape is monitorable even if
    // Mentor never gets a chance to widen it.
    function updatePrice(groupKey, id, raw) {
        const p = num(raw)
        writeZone(groupKey, id, { lower: p, upper: p })
    }

    // Sort the edges only when the user leaves the field — doing it per keystroke would fight
    // someone typing "199" into a box that currently reads higher than the other one.
    function commitZone(groupKey, id) {
        patch(groupKey, (scenario[groupKey] ?? []).map(z => {
            if (z.id !== id) return z
            const { lower, upper } = z
            if (Number.isFinite(lower) && Number.isFinite(upper) && lower > upper) return { ...z, lower: upper, upper: lower }
            return z
        }))
    }

    function addZone(groupKey, suffix) {
        const zones = scenario[groupKey] ?? []
        // Scoped to the scenario so ids stay unique document-wide — the monitor's `armed_zone_id`
        // has to resolve to exactly one zone across every premise.
        const next  = { id: `${scenario.id ?? 's'}${suffix}${zones.length + 1}`, lower: null, upper: null, quantity: null, note: null }
        patch(groupKey, [...zones, next])
    }

    function removeZone(groupKey, id) {
        patch(groupKey, (scenario[groupKey] ?? []).filter(z => z.id !== id))
    }

    return (
        <div className="zone-editor">
            {GROUPS.filter(g => !groups || groups.includes(g.key)).map(({ key, label, suffix, hint, priceLabel, pricePh }) => {
                const zones = scenario[key] ?? []
                // The ready-to-type row. Its id is minted deterministically — the same one addZone
                // would give it — so it is stable across renders and becomes the real zone's id.
                const rows  = (pricesOnly && !frozen && zones.length === 0)
                    ? [{ id: `${scenario.id ?? 's'}${suffix}1`, lower: null, upper: null, quantity: null, note: null }]
                    : zones
                // Exits can carry a qualifying note; the entry cannot, because it has real
                // conditions of its own and a second free-text box beside them would be two places
                // to say the same thing.
                const notable = pricesOnly && key !== 'entry_zones'
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
                const canAdd = !frozen && !pricesOnly && !(key === 'entry_zones' && rows.length >= 1)

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
                            const exact = Number.isFinite(zone.lower) && zone.lower === zone.upper
                            const edge  = edgeNames(key, direction)

                            // ONE number, written to both edges. Mentor widens it into a real band
                            // later; until then it is an exact level, which is a valid zone rather
                            // than a placeholder — so a form that never reaches Mentor still works.
                            //
                            // The entry is excluded from "add another": a scenario takes the whole
                            // position at one entry, and a second way in is a second SCENARIO.
                            const addAfter = pricesOnly && !frozen
                                && key !== 'entry_zones'
                                && zi === rows.length - 1
                                && Number.isFinite(zonePrice(zone, key, direction))

                            if (pricesOnly) return (
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

                                    {/* THE OPTIONAL "+/- SCENARIO" ON AN EXIT, on its own line. A
                                        stop or a target is usually just a price, but sometimes it
                                        only counts under a condition — "only on a 15min close
                                        below". That is not worth a rival premise and is not an entry
                                        condition either, so it rides on the zone as its note.

                                        Below the boxes rather than beside them: it is prose next to
                                        two numbers, and inline it stretched the row into the wide
                                        field the boxes exist to avoid.

                                        It reaches the monitor — Talos is handed the armed
                                        scenario's zones serialised whole (talos.assess), so what is
                                        written here is read alongside the level it qualifies. */}
                                    {notable && !frozen && (
                                        <input
                                            className="zone-editor__note-input" type="text"
                                            value={zone.note ?? ''} placeholder="only if… (optional)"
                                            aria-label={`${priceLabel} ${zone.id} note`}
                                            title="Optional. A condition on this level — the monitor reads it alongside the price."
                                            onChange={e => updateNote(key, zone.id, e.target.value)}
                                        />
                                    )}
                                    {notable && frozen && zone.note && <p className="zone-editor__note">{zone.note}</p>}
                                    {!notable && zone.note && <p className="zone-editor__note">{zone.note}</p>}
                                </div>
                            )

                            return (
                                <div className={`zone-editor__zone${exact ? ' is-exact' : ''}`} key={zone.id}>
                                    <span className="zone-editor__id">{zone.id}</span>

                                    <input
                                        className="zone-editor__num" type="number" inputMode="decimal"
                                        value={zone.lower ?? ''} placeholder={edge.lowerPh} disabled={frozen}
                                        aria-label={`${label} ${zone.id} ${edge.lower}`}
                                        onChange={e => updateZone(key, zone.id, 'lower', e.target.value)}
                                        onBlur={() => commitZone(key, zone.id)}
                                    />
                                    <span className="zone-editor__dash">–</span>
                                    <input
                                        className="zone-editor__num" type="number" inputMode="decimal"
                                        value={zone.upper ?? ''} placeholder={edge.upperPh} disabled={frozen}
                                        aria-label={`${label} ${zone.id} ${edge.upper}`}
                                        onChange={e => updateZone(key, zone.id, 'upper', e.target.value)}
                                        onBlur={() => commitZone(key, zone.id)}
                                    />

                                    <input
                                        className="zone-editor__qty" type="number" inputMode="numeric" min="0"
                                        value={zone.quantity ?? ''} placeholder="qty" disabled={readOnly}
                                        aria-label={`${label} ${zone.id} quantity`}
                                        onChange={e => updateZone(key, zone.id, 'quantity', e.target.value)}
                                    />

                                    {exact && <span className="zone-editor__flag" title="A zero-width band — an exact level, not a range. Still monitorable.">exact</span>}

                                    {!frozen && (
                                        <button type="button" className="zone-editor__remove" onClick={() => removeZone(key, zone.id)} aria-label={`Remove ${zone.id}`}>
                                            ×
                                        </button>
                                    )}

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
    pricesOnly: PropTypes.bool,
    // Render only these groups, so a caller can split entry from exit into separate blocks.
    // Null = all three, which is what the build worksheet wants.
    groups:     PropTypes.arrayOf(PropTypes.string),
}
