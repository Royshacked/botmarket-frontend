import PropTypes from 'prop-types'
import { tiers, conditionRows, readiness } from './talosWatch.js'
import './TalosWatch.scss'

// ── What Talos is doing, and what it found ────────────────────────────────────
//
// The setup pop-out showed the PLAN (thesis, scenarios, levels) and the monitor's MONOLOGUE (the
// journal), and nothing in between. So the two questions a user actually opens this window to ask
// had no answer on the page: is this being watched right now, and what is standing in its way.
//
// Both were already in the document. This renders them.
//
//   THE CASCADE — which of the three tiers is live, and the one fact that makes each legible.
//   THE FINDINGS — the last full read's conditions, one row each, with what the monitor SAW.
//
// The findings block is the important half. A verdict of "wait" tells the user nothing on its own;
// "the CHoCH printed but the sector is red" tells them whether to keep waiting, re-draw, or drop it.
// All of that was being written to `last_assessment` every wake and read by nobody.

const MET_MARK = { yes: '✓', no: '✗', unchecked: '?' }

// 'unchecked' is deliberately NOT a failure state in the copy. It means the monitor could not look —
// a broken provider, an empty search — which is a reason to go and get the data, where 'no' is a
// reason to wait. The tooltip says so, because the glyph alone cannot.
const MET_TITLE = {
    yes:       'Talos checked this and it is happening',
    no:        'Talos checked this and it is not happening',
    unchecked: "Talos could NOT check this — not the same as 'no'",
}

const READINESS_COPY = {
    ready:  { label: 'ready', title: 'Every trigger is present and Talos is proposing the entry' },
    almost: { label: 'almost', title: 'Every trigger is present and Talos still is not taking it — see what it flagged' },
}

/** One tier of the cascade. Dimmed when it isn't the one doing the work right now. */
function TierRow({ tier }) {
    return (
        <li className={`talos-watch__tier${tier.active ? ' is-active' : ''}`}>
            <span className="talos-watch__tier-dot" aria-hidden="true" />
            <span className="talos-watch__tier-name">{tier.n}. {tier.name}</span>
            <span className="talos-watch__tier-detail">{tier.detail}</span>
        </li>
    )
}
TierRow.propTypes = { tier: PropTypes.object.isRequired }

/** One graded condition: whether it is happening, what it says, and what the monitor saw. */
function FindingRow({ row }) {
    return (
        <li className={`talos-watch__finding met--${row.met}`}>
            <span className="talos-watch__met" title={MET_TITLE[row.met]}>{MET_MARK[row.met] ?? '?'}</span>
            <span className="talos-watch__finding-body">
                <span className="talos-watch__finding-text">
                    {row.text}
                    {row.weight === 'primary' && <em className="setup-page__cond-tag"> trigger</em>}
                </span>
                {/* The note is the whole point — it is what Talos actually SAW, in its own words. */}
                {row.note && <span className="talos-watch__finding-note">{row.note}</span>}
            </span>
        </li>
    )
}
FindingRow.propTypes = { row: PropTypes.object.isRequired }

export function TalosWatch({ setup }) {
    const last  = setup?.monitor_state?.last_assessment ?? null
    const rows  = conditionRows(setup)
    const ready = readiness(setup)
    const when  = last?.at ? new Date(last.at).toLocaleString() : null

    return (
        <section className="talos-watch" aria-label="What Talos is doing">
            <span className="setup-page__section-label">What Talos is doing</span>
            <ul className="talos-watch__tiers">
                {tiers(setup).map(t => <TierRow key={t.key} tier={t} />)}
            </ul>

            {/* Before the first read there is nothing to report, and saying so beats an empty box:
                a setup can sit for days without ever needing a full read, and that is the system
                working, not a failure. */}
            {!last ? (
                <p className="talos-watch__empty">
                    No full read yet — Talos only pays for one when price reaches a zone or leaves the map.
                </p>
            ) : (
                <div className="talos-watch__read">
                    <div className="talos-watch__read-head">
                        <span className={`monitor-journal__verdict verdict--${last.verdict}`}>{last.verdict}</span>
                        {ready && (
                            <span className={`talos-watch__readiness is-${ready}`} title={READINESS_COPY[ready].title}>
                                {READINESS_COPY[ready].label}
                            </span>
                        )}
                        {last.timeframe_used && <span className="talos-watch__read-tf">on the {last.timeframe_used}</span>}
                        {when && <span className="talos-watch__read-when">{when}</span>}
                    </div>

                    {last.read && <p className="talos-watch__read-line">{last.read}</p>}

                    {rows.length > 0 && (
                        <ul className="talos-watch__findings">
                            {rows.map(r => <FindingRow key={r.id} row={r} />)}
                        </ul>
                    )}

                    {/* Only ever set on a non-enter verdict, and it is the monitor's own answer to
                        "so what is missing" — the sentence the user came here for. */}
                    {last.warning && <p className="talos-watch__warning">{last.warning}</p>}
                </div>
            )}
        </section>
    )
}
TalosWatch.propTypes = { setup: PropTypes.object.isRequired }
