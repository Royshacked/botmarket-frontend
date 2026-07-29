import PropTypes from 'prop-types'
import './ZoneEditor.scss'

// The zone editor — the genuinely new piece of Mentor's UI.
//
// A legacy idea was a condition TREE (leaves, operators, timeframes), so it needed ConditionTree.jsx.
// A setup is BANDS: entry / stop / take-profit, each a `lower`–`upper` range with a quantity. That's
// a much simpler shape and it deserves a much simpler editor.
//
// Two rules this component enforces, because they're what make a band monitorable:
//   • lower ≤ upper. Edges are SORTED on commit rather than rejected — the user is typing two
//     numbers, and which one lands first is not a thing to scold them about.
//   • a band may be zero-width. That's an exact level, not an error; the server accepts it and the
//     gate is inclusive on both edges so it can still trip.
//
// Quantities are per-zone: entry zones sum to the position (multiple = scale-in), exit zones split
// it (multiple = staged exits). The running total is shown so a mis-split is visible immediately.

const GROUPS = [
    { key: 'entry_zones', label: 'Entry',  hint: 'Where you want to be filled. Several zones = scale-in; whichever price reaches first acts.' },
    { key: 'stop_zones',  label: 'Stop',   hint: 'Where the idea is wrong. The far edge rests at the broker as the failsafe.' },
    { key: 'tp_zones',    label: 'Target', hint: 'Where you bank. Several zones = staged exits.' },
]

const num = (v) => (v === '' || v == null ? null : Number(v))

export function ZoneEditor({ setup, onChange, readOnly = false }) {
    if (!setup) return null

    function updateZone(groupKey, id, field, raw) {
        const zones = (setup[groupKey] ?? []).map(z => (z.id === id ? { ...z, [field]: num(raw) } : z))
        onChange?.({ ...setup, [groupKey]: zones })
    }

    // Sort the edges only when the user leaves the field — doing it per keystroke would fight
    // someone typing "199" into a box that currently reads higher than the other one.
    function commitZone(groupKey, id) {
        const zones = (setup[groupKey] ?? []).map(z => {
            if (z.id !== id) return z
            const { lower, upper } = z
            if (Number.isFinite(lower) && Number.isFinite(upper) && lower > upper) return { ...z, lower: upper, upper: lower }
            return z
        })
        onChange?.({ ...setup, [groupKey]: zones })
    }

    function addZone(groupKey) {
        const zones  = setup[groupKey] ?? []
        const prefix = groupKey === 'entry_zones' ? 'ez' : groupKey === 'stop_zones' ? 'sz' : 'tp'
        const next   = { id: `${prefix}${zones.length + 1}`, lower: null, upper: null, quantity: null, note: null }
        onChange?.({ ...setup, [groupKey]: [...zones, next] })
    }

    function removeZone(groupKey, id) {
        onChange?.({ ...setup, [groupKey]: (setup[groupKey] ?? []).filter(z => z.id !== id) })
    }

    return (
        <div className="zone-editor">
            {GROUPS.map(({ key, label, hint }) => {
                const zones = setup[key] ?? []
                const total = zones.reduce((s, z) => s + (Number(z.quantity) || 0), 0)

                return (
                    <section className="zone-editor__group" key={key}>
                        <header className="zone-editor__head">
                            <h4 className="zone-editor__title" title={hint}>{label}</h4>
                            {total > 0 && <span className="zone-editor__total">{total}</span>}
                            {!readOnly && (
                                <button type="button" className="zone-editor__add" onClick={() => addZone(key)} title={`Add a ${label.toLowerCase()} zone`}>
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
    setup: PropTypes.shape({
        entry_zones: PropTypes.arrayOf(zoneShape),
        stop_zones:  PropTypes.arrayOf(zoneShape),
        tp_zones:    PropTypes.arrayOf(zoneShape),
    }),
    onChange: PropTypes.func,
    readOnly: PropTypes.bool,
}
