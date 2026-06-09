import { useEffect, useState } from 'react'
import { useNavigate }         from 'react-router-dom'
import { useAuth }             from './AuthModal/useAuth'
import { brokerService }       from '../services/broker/broker.service.remote.js'
import './PreferencesModal.scss'

const BROKERS = [
    { type: 'ctrader', label: 'cTrader' },
    { type: 'ibkr',    label: 'IBKR'    },
]

function fmt(value, currency) {
    if (value == null) return '—'
    const n = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return currency ? `${n} ${currency}` : n
}

function AccountStats({ info }) {
    if (!info) return null
    return (
        <div className="prefs-modal__account-stats">
            <div className="prefs-modal__stat">
                <span className="prefs-modal__stat-label">Balance</span>
                <span className="prefs-modal__stat-value">{fmt(info.balance, info.currency)}</span>
            </div>
            <div className="prefs-modal__stat">
                <span className="prefs-modal__stat-label">Account</span>
                <span className="prefs-modal__stat-value">{info.login ?? info.id ?? '—'}</span>
            </div>
            {info.broker && (
                <div className="prefs-modal__stat">
                    <span className="prefs-modal__stat-label">Broker</span>
                    <span className="prefs-modal__stat-value">{info.broker}</span>
                </div>
            )}
            <div className="prefs-modal__stat">
                <span className="prefs-modal__stat-label">Type</span>
                <span className="prefs-modal__stat-value">{info.isLive ? 'Live' : 'Demo'}</span>
            </div>
        </div>
    )
}

export function PreferencesModal({ onClose }) {
    const { user, signout } = useAuth()
    const navigate          = useNavigate()

    const [connections,  setConnections]  = useState({})
    const [accountData,  setAccountData]  = useState({})
    const [accountInfo,  setAccountInfo]  = useState({})
    const [savingBroker, setSavingBroker] = useState(null)

    useEffect(() => {
        _loadAll()
        window.addEventListener('focus', _loadAll)
        return () => window.removeEventListener('focus', _loadAll)
    }, [])

    async function _loadAll() {
        try {
            const conns = await brokerService.listConnections()
            setConnections(conns)

            const connectedTypes = Object.entries(conns)
                .filter(([, connected]) => connected)
                .map(([type]) => type)

            const dataEntries = await Promise.all(connectedTypes.map(async type => {
                try   { return [type, await brokerService.getTradingAccounts(type)] }
                catch { return [type, null] }
            }))

            const dataMap = Object.fromEntries(dataEntries)
            setAccountData(dataMap)
            setAccountInfo(_deriveInfo(dataMap))
        } catch {
            // broker routes unreachable
        }
    }

    function _deriveInfo(dataMap) {
        return Object.fromEntries(
            Object.entries(dataMap).map(([type, data]) => {
                if (!data) return [type, null]
                const { accounts, selectedAccountId } = data
                const selected = accounts?.find(a => a.id === selectedAccountId)
                    ?? accounts?.[0]
                    ?? null
                return [type, selected]
            })
        )
    }

    async function handleAccountChange(brokerType, accountId) {
        setSavingBroker(brokerType)
        try {
            await brokerService.setSelectedAccount(brokerType, accountId)
            setAccountData(prev => {
                const updated = { ...prev, [brokerType]: { ...prev[brokerType], selectedAccountId: accountId } }
                setAccountInfo(_deriveInfo(updated))
                return updated
            })
        } finally {
            setSavingBroker(null)
        }
    }

    async function handleDisconnect(brokerType) {
        try {
            await brokerService.disconnect(brokerType)
            setConnections(prev => ({ ...prev, [brokerType]: false }))
            setAccountData(prev => { const n = { ...prev }; delete n[brokerType]; return n })
            setAccountInfo(prev => { const n = { ...prev }; delete n[brokerType]; return n })
        } catch {}
    }

    function handleConnect(brokerType) {
        window.location.href = brokerService.getConnectUrl(brokerType)
    }

    function handleApply() {
        onClose()
        navigate('/')
    }

    const stored   = JSON.parse(sessionStorage.getItem('loggedinUser') || '{}')
    const username = stored.username || user?.username || '—'
    const fullname = stored.fullname || user?.fullname || '—'

    return (
        <div className="prefs-modal" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className="prefs-modal__panel">

                <div className="prefs-modal__header">
                    <span className="prefs-modal__title">Preferences</span>
                    <button className="prefs-modal__close" onClick={onClose}>✕</button>
                </div>

                <div className="prefs-modal__body">
                    <h3 className="prefs-modal__section-title">Profile</h3>

                    <div className="prefs-modal__field">
                        <span className="prefs-modal__label">Username</span>
                        <span className="prefs-modal__value">{username}</span>
                    </div>

                    <div className="prefs-modal__field">
                        <span className="prefs-modal__label">Full name</span>
                        <span className="prefs-modal__value">{fullname}</span>
                    </div>

                    <div className="prefs-modal__divider" />

                    <h3 className="prefs-modal__section-title">Brokers</h3>

                    {BROKERS.map(({ type, label }) => {
                        const connected = !!connections[type]
                        const data      = accountData[type]
                        const accounts  = data?.accounts ?? []
                        const selected  = data?.selectedAccountId ?? ''
                        const info      = accountInfo[type]

                        return (
                            <div key={type} className="prefs-modal__broker">
                                <div className="prefs-modal__broker-header">
                                    <span className="prefs-modal__broker-name">{label}</span>
                                    <span className={`prefs-modal__broker-status ${connected ? 'connected' : ''}`}>
                                        {connected ? 'Connected' : 'Not connected'}
                                    </span>
                                </div>

                                {connected && accounts.length > 0 && (
                                    <div className="prefs-modal__field">
                                        <span className="prefs-modal__label">Trading account</span>
                                        <select
                                            className="prefs-modal__broker-select"
                                            value={selected}
                                            disabled={savingBroker === type}
                                            onChange={e => handleAccountChange(type, e.target.value)}
                                        >
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.login ?? acc.id}
                                                    {acc.currency ? ` — ${acc.currency}` : ''}
                                                    {acc.isLive   ? '' : ' (demo)'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {connected && <AccountStats info={info} />}

                                <div className="prefs-modal__broker-actions">
                                    {connected
                                        ? <button className="prefs-modal__broker-disconnect" onClick={() => handleDisconnect(type)}>
                                            Disconnect
                                          </button>
                                        : <button className="prefs-modal__broker-connect" onClick={() => handleConnect(type)}>
                                            Connect {label}
                                          </button>
                                    }
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="prefs-modal__footer">
                    <button
                        className="prefs-modal__signout"
                        onClick={async () => { await signout(); onClose(); navigate('/') }}
                    >
                        Sign out
                    </button>
                    <button className="prefs-modal__apply" onClick={handleApply}>
                        Apply
                    </button>
                </div>

            </div>
        </div>
    )
}
