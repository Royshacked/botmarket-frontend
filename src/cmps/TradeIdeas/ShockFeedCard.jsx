import PropTypes from 'prop-types'
import { EntityCard, SymbolCell, Pill } from '../EntityCard/EntityCard.jsx'
import { AtlasBadge, TalosBadge } from '../AxlHub/AgentBadges.jsx'
import './ShockFeed.scss'

// ── Signal card (channel-level, provisional from news) ────────────────────────

const DIR_LABEL = { up: '↑ rising', down: '↓ falling', neutral: '→ neutral' }
const DIR_CLASS = { up: 'long', down: 'short' }

function LightningBadge() {
    return (
        <svg className="shock-feed__lightning" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M13 2L4.5 13.5H11L10 22l9.5-12H14z"/>
        </svg>
    )
}

export function SignalCard({ signal }) {
    const lagStr = signal.lag_weeks_min === signal.lag_weeks_max
        ? `${signal.lag_weeks_min}w lag`
        : `${signal.lag_weeks_min}–${signal.lag_weeks_max}w lag`

    const dirClass = DIR_CLASS[signal.direction]
    const dirLabel = DIR_LABEL[signal.direction] ?? signal.direction

    const title = (
        <>
            <span className="shock-feed__channel">{signal.channel_id?.replace(/_/g, ' ')}</span>
            {dirClass && <Pill variant="dir" className={`direction--${dirClass}`}>{dirLabel}</Pill>}
            {!dirClass && <Pill variant="type">{dirLabel}</Pill>}
            <Pill variant="type">{signal.magnitude}</Pill>
        </>
    )

    const summary = (
        <>
            <span className="idea-card__summary-text">{signal.reasoning}</span>
            <span className="idea-card__date"> · {lagStr} · conf {(signal.confidence_llm ?? 0).toFixed(2)}</span>
        </>
    )

    const footer = signal.expires_at
        ? <p className="shock-feed__expires">expires {signal.expires_at}</p>
        : null

    return (
        <EntityCard
            status="active"
            badge={<LightningBadge />}
            title={title}
            summary={summary}
            footer={footer}
        />
    )
}
SignalCard.propTypes = { signal: PropTypes.object.isRequired }

// ── Opportunity card (ticker-level, FRED-confirmed) ───────────────────────────

export function OpportunityCard({ opportunity: opp, onBuild, onSymbolClick }) {
    const lagStr = opp.lag_weeks_min === opp.lag_weeks_max
        ? `${opp.lag_weeks_min}w`
        : `${opp.lag_weeks_min}–${opp.lag_weeks_max}w`

    const badge = opp.agent === 'atlas' ? <AtlasBadge size={34} /> : <TalosBadge size={34} />

    const title = (
        <>
            <SymbolCell symbol={opp.ticker} onSymbolClick={onSymbolClick} />
            {opp.ticker_direction && (
                <Pill variant="dir" className={`direction--${opp.ticker_direction}`}>
                    {opp.ticker_direction}
                </Pill>
            )}
            <Pill variant="lens">{opp.channel_id?.replace(/_/g, ' ')}</Pill>
        </>
    )

    const summary = (
        <>
            <span className="idea-card__summary-text">{opp.why}</span>
            <span className="idea-card__date"> · lag {lagStr}</span>
        </>
    )

    const footer = (opp.when || opp.risk_note) ? (
        <p className="shock-feed__opp-meta">
            {opp.when && <span>{opp.when}</span>}
            {opp.when && opp.risk_note && <span className="shock-feed__meta-sep"> · </span>}
            {opp.risk_note && <span className="shock-feed__risk">{opp.risk_note}</span>}
        </p>
    ) : null

    const controls = onBuild ? (
        <button
            className="shock-feed__build-btn"
            onClick={e => { e.stopPropagation(); onBuild(opp) }}
            title={opp.agent === 'atlas' ? 'Build portfolio with Atlas' : 'Build trade with Mentor'}
        >
            Build trade
        </button>
    ) : null

    return (
        <EntityCard
            status="active"
            badge={badge}
            title={title}
            summary={summary}
            footer={footer}
            controls={controls}
        />
    )
}
OpportunityCard.propTypes = {
    opportunity:   PropTypes.object.isRequired,
    onBuild:       PropTypes.func,
    onSymbolClick: PropTypes.func,
}
