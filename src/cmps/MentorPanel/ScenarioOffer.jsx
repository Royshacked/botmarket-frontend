import PropTypes from 'prop-types'
import './ScenarioOffer.scss'

// THE SCENARIOS MENTOR IS ASKING ABOUT, on the turn he asks (Roy, 2026-11-07: "show them when mentor asks — it showed
// after I already chose"). The worksheet holds only what the user took, so this is drawn from the turn's offer
// (state.view.offer) and goes with that turn. No buttons: the answer is a sentence in the chat, because the same reply
// also carries the risk limit and the reward to risk.

const price = (n) => `$${n}`

export function ScenarioOffer({ offer }) {
    const options = offer?.options ?? []
    if (!options.length) return null
    const many = options.length > 1
    return (
        <section className="scenario-offer" aria-label="Scenarios to choose from">
            <p className="scenario-offer__lead">
                {many ? `Mentor is asking: ${options.map(o => o.id).join(', ')} or both. Answer in the chat.` : 'Mentor is offering this scenario. Answer in the chat.'}
            </p>
            <ul className="scenario-offer__list">
                {options.map(o => (
                    <li className="scenario-offer__option" key={o.id}>
                        <span className="scenario-offer__name"><strong>{o.id}</strong>{o.label ? ` · ${o.label}` : ''}</span>
                        <span className="scenario-offer__levels">
                            {o.arm != null && <span>Arms on a day close through {price(o.arm)}</span>}
                            <span>Stop {price(o.stop)}{o.arm != null ? ' (assumed)' : ''}</span>
                            {o.target != null && <span>Target {price(o.target)}</span>}
                        </span>
                    </li>
                ))}
            </ul>
            {many && <p className="scenario-offer__note">With both, the first to fill takes the full size and the other is cancelled.</p>}
        </section>
    )
}

ScenarioOffer.propTypes = {
    offer: PropTypes.shape({
        options: PropTypes.arrayOf(PropTypes.shape({
            id:     PropTypes.string.isRequired,
            label:  PropTypes.string,
            arm:    PropTypes.number,
            stop:   PropTypes.number.isRequired,
            target: PropTypes.number,
        })),
    }),
}
