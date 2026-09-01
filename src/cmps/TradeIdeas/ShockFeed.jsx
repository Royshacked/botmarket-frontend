import { useState } from 'react'
import PropTypes from 'prop-types'
import { SignalCard, OpportunityCard } from './ShockFeedCard.jsx'
import './ShockFeed.scss'

// The Shocks section body — two sub-tabs: Opportunities (ticker-level, actionable) and
// Signals (channel-level, provisional early-warning context).
//
// Opportunities are shown first and by default because they are FRED-confirmed and
// immediately actionable. Signals are provisional (news-driven, not yet validated) and
// exist mainly as macro context for Argus / Mentor / Atlas.

export function ShockFeed({ signals, opportunities, loading, onBuild, onSymbolClick }) {
    const [tab, setTab] = useState('opportunities')
    const showOpps = tab === 'opportunities'

    if (loading) return <p className="trade-ideas-list__empty">Loading shocks…</p>

    const isEmpty = showOpps ? opportunities.length === 0 : signals.length === 0
    const emptyMsg = showOpps
        ? 'No confirmed opportunities yet — Aether needs a FRED release day to validate predictions.'
        : 'No provisional signals yet — check back after the next news ingest.'

    return (
        <div className="shock-feed">
            <div className="shock-feed__tabs">
                <button
                    className={`shock-feed__tab${showOpps ? ' shock-feed__tab--active' : ''}`}
                    onClick={() => setTab('opportunities')}
                >
                    Opportunities
                    {opportunities.length > 0 && (
                        <span className="shock-feed__tab-count">{opportunities.length}</span>
                    )}
                </button>
                <button
                    className={`shock-feed__tab${!showOpps ? ' shock-feed__tab--active' : ''}`}
                    onClick={() => setTab('signals')}
                >
                    Signals
                    {signals.length > 0 && (
                        <span className="shock-feed__tab-count">{signals.length}</span>
                    )}
                </button>
            </div>

            {isEmpty ? (
                <p className="trade-ideas-list__empty">{emptyMsg}</p>
            ) : (
                <div className="ideas-cards">
                    {showOpps
                        ? opportunities.map((opp, i) => (
                            <OpportunityCard
                                key={opp.card_id ?? i}
                                opportunity={opp}
                                onBuild={onBuild}
                                onSymbolClick={onSymbolClick}
                            />
                        ))
                        : signals.map((sig, i) => (
                            <SignalCard key={sig.prediction_id ?? i} signal={sig} />
                        ))
                    }
                </div>
            )}
        </div>
    )
}

ShockFeed.propTypes = {
    signals:       PropTypes.array,
    opportunities: PropTypes.array,
    loading:       PropTypes.bool,
    onBuild:       PropTypes.func,
    onSymbolClick: PropTypes.func,
}
ShockFeed.defaultProps = { signals: [], opportunities: [] }
