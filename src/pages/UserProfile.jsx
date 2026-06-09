import { useEffect, useState } from 'react'
import { useNavigate }         from 'react-router-dom'
import { useAuth }             from '../cmps/AuthModal/useAuth'
import { brokerService }       from '../services/broker/broker.service.remote.js'
import { httpService }         from '../services/http.service.js'
import { ThemeSwitcher }       from '../cmps/ThemeSwitcher/ThemeSwitcher'
import './UserProfile.scss'

const BROKERS = [
    { type: 'ctrader', label: 'cTrader' },
    { type: 'ibkr',    label: 'IBKR'    },
]

export function UserProfile() {
    const { user, setUser, signout } = useAuth()
    const navigate                   = useNavigate()

    const [connections,  setConnections]  = useState({})
    const [accountData,  setAccountData]  = useState({})
    const [savingBroker, setSavingBroker] = useState(null)

    const [editMode,      setEditMode]      = useState(false)
    const [draftFullname, setDraftFullname] = useState('')
    const [saving,        setSaving]        = useState(false)

    useEffect(() => {
        if (!user) { navigate('/'); return }
        _loadAll()

        const params     = new URLSearchParams(window.location.search)
        const brokerType = params.get('type')
        if (params.get('broker') === 'connected' && brokerType) {
            window.history.replaceState({}, '', window.location.pathname)
        }
    }, [user])

    async function _loadAll() {
        try {
            const conns = await brokerService.listConnections()
            setConnections(conns)
            const entries = await Promise.all(
                Object.entries(conns)
                    .filter(([, connected]) => connected)
                    .map(async ([type]) => {
                        try {
                            const data = await brokerService.getTradingAccounts(type)
                            return [type, data]
                        } catch { return [type, null] }
                    })
            )
            setAccountData(Object.fromEntries(entries))
        } catch {}
    }

    async function handleAccountChange(brokerType, accountId) {
        setSavingBroker(brokerType)
        try {
            await brokerService.setSelectedAccount(brokerType, accountId)
            setAccountData(prev => ({
                ...prev,
                [brokerType]: { ...prev[brokerType], selectedAccountId: accountId },
            }))
        } finally { setSavingBroker(null) }
    }

    async function handleDisconnect(brokerType) {
        try {
            await brokerService.disconnect(brokerType)
            setConnections(prev => ({ ...prev, [brokerType]: false }))
            setAccountData(prev => { const n = { ...prev }; delete n[brokerType]; return n })
        } catch {}
    }

    function handleConnect(brokerType) {
        window.location.href = brokerService.getConnectUrl(brokerType)
    }

    function handleEditStart() {
        setDraftFullname(user.fullname || '')
        setEditMode(true)
    }

    function handleEditCancel() {
        setEditMode(false)
        setDraftFullname('')
    }

    async function handleApply() {
        if (!draftFullname.trim()) return
        setSaving(true)
        try {
            const updated = await httpService.patch(`api/user/${user.id}`, { fullname: draftFullname.trim() })
            const next = { ...user, fullname: updated.fullname }
            setUser(next)
            sessionStorage.setItem('loggedinUser', JSON.stringify(next))
            setEditMode(false)
        } catch {}
        finally { setSaving(false) }
    }

    if (!user) return null

    return (
        <div className="user-profile">

            <div className="user-profile__body">

                {/* ── Left column ── */}
                <div className="user-profile__col">

                    <section className="user-profile__section">
                        <h2 className="user-profile__section-title">Account</h2>

                        <div className="user-profile__row">
                            <span className="user-profile__label">Username</span>
                            <span className="user-profile__value">{user.username || '—'}</span>
                        </div>

                        <div className="user-profile__row">
                            <span className="user-profile__label">Full name</span>
                            {editMode
                                ? <input
                                    className="user-profile__input"
                                    value={draftFullname}
                                    onChange={e => setDraftFullname(e.target.value)}
                                    autoFocus
                                  />
                                : <span className="user-profile__value">{user.fullname || '—'}</span>
                            }
                        </div>

                        {editMode
                            ? <div className="user-profile__edit-actions">
                                <button
                                    className="user-profile__btn user-profile__btn--primary"
                                    onClick={handleApply}
                                    disabled={saving || !draftFullname.trim()}
                                >
                                    {saving ? 'Saving…' : 'Apply Changes'}
                                </button>
                                <button
                                    className="user-profile__btn user-profile__btn--ghost"
                                    onClick={handleEditCancel}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                              </div>
                            : <button
                                className="user-profile__btn user-profile__btn--ghost"
                                onClick={handleEditStart}
                              >
                                Edit Profile
                              </button>
                        }
                    </section>

                    <section className="user-profile__section">
                        <h2 className="user-profile__section-title">Appearance</h2>
                        <div className="user-profile__row user-profile__row--inline">
                            <span className="user-profile__label">Theme</span>
                            <ThemeSwitcher />
                        </div>
                    </section>

                    <div className="user-profile__spacer" />

                    <button
                        className="user-profile__btn user-profile__btn--signout"
                        onClick={async () => { await signout(); navigate('/') }}
                    >
                        Sign out
                    </button>

                </div>

                {/* ── Right column ── */}
                <div className="user-profile__col">

                    <section className="user-profile__section user-profile__section--brokers">
                        <h2 className="user-profile__section-title">Brokers</h2>

                        {BROKERS.map(({ type, label }) => {
                            const connected = !!connections[type]
                            const data      = accountData[type]
                            const accounts  = data?.accounts ?? []
                            const selected  = data?.selectedAccountId ?? ''

                            return (
                                <div key={type} className="user-profile__broker">
                                    <div className="user-profile__broker-header">
                                        <span className="user-profile__broker-name">{label}</span>
                                        <span className={`user-profile__broker-status${connected ? ' connected' : ''}`}>
                                            {connected ? 'Connected' : 'Not connected'}
                                        </span>
                                    </div>

                                    {connected && accounts.length > 0 && (
                                        <div className="user-profile__row">
                                            <span className="user-profile__label">Trading account</span>
                                            <select
                                                className="user-profile__select"
                                                value={selected}
                                                disabled={savingBroker === type}
                                                onChange={e => handleAccountChange(type, e.target.value)}
                                            >
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.id}>
                                                        {acc.login ?? acc.id}
                                                        {acc.currency ? ` — ${acc.currency}` : ''}
                                                        {acc.balance  != null ? ` — ${acc.balance.toLocaleString()}` : ''}
                                                        {acc.isLive   ? '' : ' (demo)'}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="user-profile__broker-actions">
                                        {connected
                                            ? <button
                                                className="user-profile__btn user-profile__btn--danger"
                                                onClick={() => handleDisconnect(type)}
                                              >
                                                Disconnect
                                              </button>
                                            : <button
                                                className="user-profile__btn user-profile__btn--primary"
                                                onClick={() => handleConnect(type)}
                                              >
                                                Connect {label}
                                              </button>
                                        }
                                    </div>
                                </div>
                            )
                        })}
                    </section>

                </div>

            </div>
        </div>
    )
}
