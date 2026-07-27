import PropTypes from 'prop-types'
import { COVERAGE_DIMENSIONS } from './coverageMeta'
import './CoverageChips.scss'

// Mentor's progress display — the replacement for ChatPhaseHeading.
//
// The other agents walk numbered phases, so their heading is a single step ("Phase 3 — Structure").
// Mentor has no phases: it works by invariants, covering markets / company / technicals in whatever
// order the conversation takes, often several in one turn. So progress is a SET, not a position —
// three chips that fill in, order-free.
//
// This is deliberately honest about a non-linear process. It shows what has been read, never
// implies what comes next, and never claims a step is "done" before Mentor says so.

export function CoverageChips({ coverage = [], compact = false }) {
    const covered = new Set(Array.isArray(coverage) ? coverage : [])

    return (
        <div className={`coverage-chips${compact ? ' coverage-chips--compact' : ''}`} role="status" aria-label="Analysis coverage">
            {COVERAGE_DIMENSIONS.map(({ key, label, hint }) => {
                const done = covered.has(key)
                return (
                    <span
                        key={key}
                        className={`coverage-chips__chip${done ? ' is-covered' : ''}`}
                        title={done ? `${label} — read. ${hint}` : `${label} — not read yet. ${hint}`}
                    >
                        <span className="coverage-chips__mark" aria-hidden="true">
                            {done ? (
                                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                                </svg>
                            ) : (
                                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                                    <circle cx="8" cy="8" r="4" strokeDasharray="2.2 2.2" />
                                </svg>
                            )}
                        </span>
                        <span className="coverage-chips__label">{label}</span>
                    </span>
                )
            })}
        </div>
    )
}

CoverageChips.propTypes = {
    coverage: PropTypes.arrayOf(PropTypes.string),
    compact:  PropTypes.bool,
}
