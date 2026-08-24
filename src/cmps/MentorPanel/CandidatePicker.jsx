import PropTypes from 'prop-types'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip'
import './CandidatePicker.scss'

// The 2–3 candidate offer, shown when the user has no setup of their own.
//
// The whole point of the step is COMPARISON, so the cards are laid out to be read against each
// other: same fields, same order, R:R and conviction side by side. Mentor is told to rank them
// honestly, so they render in the order given — first is its own recommendation.
//
// Each candidate carries its own lens, because they're meant to differ in character (a reversal
// at the low vs a breakout continuation), not be three wordings of one trade.

const fmtZone = (z) => (z?.lower === z?.upper ? `${z?.lower}` : `${z?.lower}–${z?.upper}`)

export function CandidatePicker({ candidates = [], onPick }) {
    if (!candidates.length) return null

    return (
        <div className="candidate-picker">
            <p className="candidate-picker__lead">
                {candidates.length} ways to play it — pick one and we&apos;ll build it out.
            </p>

            <div className="candidate-picker__grid">
                {candidates.map((c, i) => {
                    const s = c.setup ?? {}
                    return (
                        <button
                            type="button"
                            className="candidate-picker__card"
                            key={`${c.label}-${i}`}
                            onClick={() => onPick?.(c)}
                        >
                            <span className="candidate-picker__head">
                                <span className="candidate-picker__label">{c.label}</span>
                                {i === 0 && <span className="candidate-picker__rec" title="Mentor ranks these honestly — this is its own pick.">pick</span>}
                            </span>

                            <span className="candidate-picker__tags">
                                {s.direction && <span className={`candidate-picker__dir candidate-picker__dir--${s.direction}`}>{s.direction}</span>}
                                {s.trade_mode && <span className="candidate-picker__tag">{s.trade_mode}</span>}
                                {s.timeframe && <span className="candidate-picker__tag">{s.timeframe}</span>}
                            </span>

                            {c.pitch && <span className="candidate-picker__pitch">{c.pitch}</span>}

                            {/* The projected premise's levels. A candidate may itself hold rivals,
                                so say when there is more than one way into it rather than showing
                                one set of numbers as if it were the whole offer. */}
                            <span className="candidate-picker__levels">
                                <span><em>in</em> {fmtZone(s.entry_zones?.[0])}</span>
                                <span><em>stop</em> {fmtZone(s.stop_zones?.[0])}</span>
                                <span><em>target</em> {fmtZone(s.tp_zones?.[0])}</span>
                                {(s.scenarios?.length ?? 0) > 1 && <span><em>+{s.scenarios.length - 1}</em> more way in</span>}
                            </span>

                            <span className="candidate-picker__metrics">
                                {Number.isFinite(s.rr) && (
                                    <span className={`candidate-picker__rr${s.rr < 1.5 ? ' is-thin' : ''}`}>{s.rr}R</span>
                                )}
                                <ConvictionChip conviction={s.conviction} />
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

CandidatePicker.propTypes = {
    candidates: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string,
        pitch: PropTypes.string,
        setup: PropTypes.object,
    })),
    onPick: PropTypes.func,
}
