import PropTypes from 'prop-types'

// The flow the user is in, as steps — done, here, next — instead of paragraphs (backend one-axl.md §6, 2026-11-13).
// infoFlow.js decides which flow and which step; this only draws it. A vertical stepper: the Info column is narrow.

export function FlowDiagram({ flow }) {
    if (!flow) return null
    return (
        <section className="flow-diagram" aria-label={flow.title}>
            <h3 className="flow-diagram__title">{flow.title}</h3>
            <ol className="flow-diagram__steps">
                {flow.steps.map((step, i) => {
                    const state = i < flow.current ? 'done' : i === flow.current ? 'here' : 'next'
                    return (
                        <li key={step} className={`flow-diagram__step flow-diagram__step--${state}`} aria-current={state === 'here' ? 'step' : undefined}>
                            <span className="flow-diagram__dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
                            <span className="flow-diagram__label">{step}</span>
                            {state === 'here' && <span className="flow-diagram__here">you are here</span>}
                        </li>
                    )
                })}
            </ol>
        </section>
    )
}

FlowDiagram.propTypes = {
    flow: PropTypes.shape({ title: PropTypes.string, steps: PropTypes.arrayOf(PropTypes.string), current: PropTypes.number }),
}
