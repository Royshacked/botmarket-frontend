import PropTypes from 'prop-types'
import './HouseChip.scss'

// "On the house's list" — the name's industry is one Pythia (the house's industry desk) currently rates for the
// book: swing, or long term (backend docs/design/argus-on-pythia.md §3.4). The server works the label out from the
// name's industry, never the model, so the chip is a fact. It is the house's view of the INDUSTRY, not of the
// stock, and it adds nothing to the score — the tooltip says so. Renders nothing without a label.
const BOOK = { swing: 'swing', long_term: 'long term' }

export function HouseChip({ house }) {
    const book = BOOK[house?.book]
    if (!book) return null
    const via = house.themes?.length ? ` (via ${house.themes.join(', ')})` : ''
    const flags = [house.hype ? 'HYPE — a crash-risk flag' : null, house.avoid ? 'the house rates the industry itself Avoid' : null].filter(Boolean)
    const title = `On the house's ${book} list — ${house.industry ?? 'its industry'}${via}.${flags.length ? ` ${flags.join('; ')}.` : ''} The house's view of the industry, not of this stock; it adds nothing to the score.`
    return (
        <span className={`house-chip${house.hype || house.avoid ? ' house-chip--flagged' : ''}`} title={title}>
            <span className="house-chip__label">House · {book}</span>
        </span>
    )
}

HouseChip.propTypes = {
    house: PropTypes.shape({
        book:     PropTypes.oneOf(['swing', 'long_term']),
        industry: PropTypes.string,
        hype:     PropTypes.bool,
        avoid:    PropTypes.bool,
        themes:   PropTypes.arrayOf(PropTypes.string),
    }),
}
