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
    { key: 'entry_zones', label: 'Entry',  suffix: 'e', hint: 'Where you want to be filled. One per way in — a second entry is a second scenario, not a second zone.' },
    { key: 'stop_zones',  label: 'Stop',   suffix: 's', hint: 'Where this premise is wrong. The far edge rests at the broker as the failsafe.' },
    { key: 'tp_zones',    label: 'Target', suffix: 't', hint: 'Where you bank. Several zones = staged exits.' },
]

const num = (v) => (v === '' || v == null ? null : Number(v))

export function ZoneEditor({ scenario, onChange, readOnly = false }) {
    if (!scenario) return null

    const patch = (groupKey, zones) => onChange?.({ ...scenario, [groupKey]: zones })

    function updateZone(groupKey, id, field, raw) {
        patch(groupKey, (scenario[groupKey] ?? []).map(z => (z.id === id ? { ...z, [field]: num(raw) } : z)))
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
            {GROUPS.map(({ key, label, suffix, hint }) => {
                const zones = scenario[key] ?? []
                const total = zones.reduce((s, z) => s + (Number(z.quantity) || 0), 0)
                // A scenario takes the whole position at one entry; scaling in is not supported yet
                // and the server refuses it, so the affordance is not offered.
                const canAdd = !readOnly && !(key === 'entry_zones' && zones.length >= 1)

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

                        {zones.length === 0 && <p className="zone-editor__empty">No {label.toLowerCase()} zone yet.</p>}

                        {zones.map(zone => {
                            const exact = Number.isFinite(zone.lower) && zone.lower === zone.upper
                            return (
                                <div className={`zone-editor__zone${exact ? ' is-exact' : ''}`} key={zone.id}>
                                    <span className="zone-editor__id">{zone.id}</span>

                                    <input
                                        className="zone-editor__num" type="number" inputMode="decimal"
                                        value={zone.lower ?? ''} placeholder="from" disabled={readOnly}
                                        aria-label={`${label} ${zone.id} lower edge`}
                                        onChange={e => updateZone(key, zone.id, 'lower', e.target.value)}
                                        onBlur={() => commitZone(key, zone.id)}
                                    />
                                    <span className="zone-editor__dash">–</span>
                                    <input
                                        className="zone-editor__num" type="number" inputMode="decimal"
                                        value={zone.upper ?? ''} placeholder="to" disabled={readOnly}
                                        aria-label={`${label} ${zone.id} upper edge`}
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

                                    {!readOnly && (
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
    onChange: PropTypes.func,
    readOnly: PropTypes.bool,
}
