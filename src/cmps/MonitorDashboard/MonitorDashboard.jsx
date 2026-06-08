import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { IdeaCard }        from './IdeaCard.jsx'
import { NewsFeed }        from '../NewsFeed/NewsFeed.jsx'
import { TradeIdeaDialog } from '../TradeIdeas/TradeIdeaDialog.jsx'
import { brokerService }   from '../../services/broker/broker.service.remote.js'
import './MonitorDashboard.scss'

const BROKER_LABELS = {
    ctrader: 'cTrader',
    ibkr:    'IBKR',
}

export function MonitorDashboard({ ideas, newsArticles, newsLoading, onUpdate, onStatusChange, onDelete, onEdit }) {
    const [openIdeas, setOpenIdeas] = useState([])

    // { ctrader: bool, ibkr: bool }
    const [connections, setConnections] = useState({})

    // { ctrader: { account, positions } | null, ibkr: ... }
    const [brokerData, setBrokerData] = useState({})

    const inPosition = ideas.filter(i => i.status === 'long' || i.status === 'short').length
    const triggered  = ideas.filter(i => i.status === 'hit').length
    const active     = ideas.filter(i => i.status === 'looking').length
    const pending    = ideas.filter(i => i.status === 'waiting').length
    const closed     = ideas.filter(i => i.status === 'closed').length

    // Load broker connections on mount + after OAuth redirect
    useEffect(() => {
        _loadBrokerData()

        const params = new URLSearchParams(window.location.search)
        if (params.get('broker') === 'connected') {
            window.history.replaceState({}, '', window.location.pathname)
            _loadBrokerData()
        }
    }, [])

    async function _loadBrokerData() {
        try {
            const conns = await brokerService.listConnections()
            setConnections(conns)

            // For each connected broker, fetch account + positions in parallel
            const entries = await Promise.all(
                Object.entries(conns)
                    .filter(([, connected]) => connected)
                    .map(async ([type]) => {
                        try {
                            const [account, positions] = await Promise.all([
                                brokerService.getAccount(type),
                                brokerService.getPositions(type),
                            ])
                            return [type, { account, positions }]
                        } catch {
                            return [type, null]
                        }
                    })
            )
            setBrokerData(Object.fromEntries(entries))
        } catch {
            // broker routes unreachable — stay empty
        }
    }

    function handleConnect(brokerType) {
        window.location.href = brokerService.getConnectUrl(brokerType)
    }

    async function handleDisconnect(brokerType) {
        try {
            await brokerService.disconnect(brokerType)
            setConnections(prev => ({ ...prev, [brokerType]: false }))
            setBrokerData(prev => { const n = { ...prev }; delete n[brokerType]; return n })
        } catch {
            // silently ignore
        }
    }

    function handleOpen(idea) {
        setOpenIdeas(prev => prev.some(i => i.id === idea.id) ? prev : [...prev, idea])
    }

    function handleClose(id) {
        setOpenIdeas(prev => prev.filter(i => i.id !== id))
    }

    const sorted = [...ideas].sort((a, b) => {
        const order = { long: 0, short: 0, hit: 1, looking: 2, waiting: 3, closed: 4 }
        return (order[a.status] ?? 5) - (order[b.status] ?? 5)
    })

    const supportedBrokers = Object.keys(BROKER_LABELS)

    return (
        <div className="monitor-dashboard">

            {/* ── Section header ───────────────────────────────── */}
            <div className="monitor-dashboard__header">
                <div className="monitor-dashboard__title-row">
                    <img
                        className="monitor-dashboard__logo"
                        src="/img/bot-market-logo.png"
                        alt="Bot Market"
                    />
                    <span className="monitor-dashboard__title">Live Monitor</span>
                </div>

                <div className="monitor-dashboard__summary">
                    {inPosition > 0 && <>
                        <span className="monitor-dashboard__stat monitor-dashboard__stat--in-position">
                            {inPosition} in position
                        </span>
                        <span className="monitor-dashboard__stat-sep">·</span>
                    </>}
                    {triggered > 0 && <>
                        <span className="monitor-dashboard__stat monitor-dashboard__stat--triggered">
                            {triggered} triggered
                        </span>
                        <span className="monitor-dashboard__stat-sep">·</span>
                    </>}
                    <span className="monitor-dashboard__stat monitor-dashboard__stat--active">
                        {active} active
                    </span>
                    <span className="monitor-dashboard__stat-sep">·</span>
                    <span className="monitor-dashboard__stat monitor-dashboard__stat--pending">
                        {pending} pending
                    </span>
                    <span className="monitor-dashboard__stat-sep">·</span>
                    <span className="monitor-dashboard__stat monitor-dashboard__stat--closed">
                        {closed} closed
                    </span>
                </div>

                {/* ── Broker panels ─────────────────────────────── */}
                <div className="monitor-dashboard__brokers">
                    {supportedBrokers.map(type => {
                        const connected = connections[type]
                        const data      = brokerData[type]
                        const label     = BROKER_LABELS[type]

                        if (connected && data?.account) {
                            const { account, positions } = data
                            return (
                                <div key={type} className="monitor-dashboard__broker-panel">
                                    <div className="monitor-dashboard__broker-panel-header">
                                        <span className="monitor-dashboard__broker-name">{label}</span>
                                        <button
                                            className="monitor-dashboard__broker-disconnect"
                                            onClick={() => handleDisconnect(type)}
                                            title="Disconnect"
                                        >✕</button>
                                    </div>
                                    <div className="monitor-dashboard__broker-stats">
                                        <div className="monitor-dashboard__broker-stat">
                                            <span className="monitor-dashboard__broker-label">Balance</span>
                                            <span className="monitor-dashboard__broker-value">
                                                {account.currency} {account.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="monitor-dashboard__broker-stat">
                                            <span className="monitor-dashboard__broker-label">Equity</span>
                                            <span className={`monitor-dashboard__broker-value ${account.equity >= account.balance ? 'positive' : 'negative'}`}>
                                                {account.currency} {account.equity?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="monitor-dashboard__broker-stat">
                                            <span className="monitor-dashboard__broker-label">Open</span>
                                            <span className="monitor-dashboard__broker-value">{positions.length} pos</span>
                                        </div>
                                        {account.marginLevel != null && (
                                            <div className="monitor-dashboard__broker-stat">
                                                <span className="monitor-dashboard__broker-label">Margin</span>
                                                <span className={`monitor-dashboard__broker-value ${account.marginLevel < 150 ? 'negative' : ''}`}>
                                                    {account.marginLevel.toFixed(0)}%
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        }

                        return (
                            <button
                                key={type}
                                className="monitor-dashboard__broker-connect"
                                onClick={() => handleConnect(type)}
                            >
                                + Connect {label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ── Ideas ────────────────────────────────────────── */}
            <div className="monitor-dashboard__ideas">
                {sorted.length === 0 ? (
                    <div className="monitor-dashboard__empty">
                        <p>No trade ideas yet</p>
                        <p className="monitor-dashboard__empty-sub">
                            Use the desktop workspace to build your first idea
                        </p>
                    </div>
                ) : (
                    sorted.map(idea => (
                        <IdeaCard
                            key={idea.id}
                            idea={idea}
                            onOpen={handleOpen}
                        />
                    ))
                )}
            </div>

            {/* ── News feed ─────────────────────────────────────── */}
            <div className="monitor-dashboard__news-section">
                <span className="monitor-dashboard__news-label">Market news</span>
                <NewsFeed articles={newsArticles} isLoading={newsLoading} />
            </div>

            {/* ── Idea detail dialogs (one per open idea) ──────── */}
            {openIdeas.map((idea, idx) => (
                <TradeIdeaDialog
                    key={idea.id}
                    idea={idea}
                    index={idx}
                    onClose={() => handleClose(idea.id)}
                    onDelete={onDelete}
                    onEdit={onEdit}
                />
            ))}
        </div>
    )
}

MonitorDashboard.propTypes = {
    ideas:          PropTypes.array.isRequired,
    newsArticles:   PropTypes.array.isRequired,
    newsLoading:    PropTypes.bool,
    onUpdate:       PropTypes.func.isRequired,
    onStatusChange: PropTypes.func.isRequired,
    onDelete:       PropTypes.func.isRequired,
    onEdit:         PropTypes.func,
}
