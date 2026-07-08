import { useEffect, useState } from 'react'
import { useNavigate }         from 'react-router-dom'
import { useAuth }             from '../cmps/AuthModal/useAuth'
import { brokerService }       from '../services/broker/broker.service.remote.js'
import { httpService }         from '../services/http.service.js'
import { userService }         from '../services/user/user.service.remote.js'
import { ThemeSwitcher }       from '../cmps/ThemeSwitcher/ThemeSwitcher'
import { AccentSwitcher }      from '../cmps/AccentSwitcher/AccentSwitcher'
import { PaceSlider }          from '../cmps/PaceSlider.jsx'
import { MODEL_OPTIONS, readStoredModel }       from '../cmps/modelOptions.js'
import { REASONING_OPTIONS, readStoredReasoning } from '../cmps/reasoningOptions.js'
import { ROUTING_MODES, readStoredRoutingMode } from '../cmps/routingModeOptions.js'
import { DESIGNS, loadDesign, saveDesign, applyDesign } from '../services/designService.js'
import { queuePrefSync } from '../services/preferences.service.js'
import { PaperTradingSection } from '../cmps/PaperTrading/PaperTradingSection.jsx'
import { ManualTradingSection } from '../cmps/ManualTrading/ManualTradingSection.jsx'
import { useWorkspaceMode } from '../customHooks/useWorkspaceMode'
import './UserProfile.scss'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
function formatMonthKey(key) {
    if (!key) return ''
    const [year, mon] = key.split('-')
    return `${MONTH_NAMES[parseInt(mon) - 1]} ${year}`
}
function barColor(pct) {
    if (pct < 60) return 'var(--color-long)'
    if (pct < 80) return '#e6a817'
    return 'var(--color-error)'
}

const BROKERS = [
    { type: 'ctrader', label: 'cTrader' },
    { type: 'ibkr',    label: 'IBKR'    },
]

// One shared AI setting drives all three agents; each consumer reads its own
// per-agent localStorage keys, so a change is mirrored to every agent's keys.
const AI_AGENT_KEYS = ['idea', 'scanner', 'portfolio']

export function UserProfile() {
    const { user, setUser, signout } = useAuth()
    const navigate                   = useNavigate()

    // Active workspace (from the header switch) — the two non-active mode sections
    // below are dimmed + disabled so it's clear which one is live.
    const { workspace } = useWorkspaceMode(user?._id)

    const [connections,  setConnections]  = useState({})
    const [accountData,  setAccountData]  = useState({})
    const [savingBroker, setSavingBroker] = useState(null)

    const [editMode,      setEditMode]      = useState(false)
    const [draftFullname, setDraftFullname] = useState('')
    const [saving,        setSaving]        = useState(false)

    const [tokenUsage, setTokenUsage] = useState({ month: '', totalCost: 0, budgetUsd: 20, percentUsed: 0 })

    const [aiPref, setAiPref] = useState({
        routingMode: readStoredRoutingMode('ideaRoutingMode'),
        model:       readStoredModel('ideaModel'),
        reasoning:   readStoredReasoning('ideaReasoning'),
    })

    const [design, setDesign] = useState(loadDesign())
    function handleDesign(id) {
        setDesign(id)
        saveDesign(id)
        applyDesign(id)
        queuePrefSync()
    }

    function handleAiPref(field, value) {
        const suffix = field.charAt(0).toUpperCase() + field.slice(1)
        AI_AGENT_KEYS.forEach(agent => localStorage.setItem(`${agent}${suffix}`, value))
        setAiPref(prev => ({ ...prev, [field]: value }))
        queuePrefSync()
    }

    useEffect(() => {
        if (!user) { navigate('/'); return }
        _loadAll()

        const params     = new URLSearchParams(window.location.search)
        const brokerType = params.get('type')
        if (params.get('broker') === 'connected' && brokerType) {
            window.history.replaceState({}, '', window.location.pathname)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on user change; navigate is stable
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
        } catch { /* broker data unavailable — leave empty */ }

        try {
            const usage = await userService.getTokenUsage(user._id)
            setTokenUsage(usage)
        } catch { /* usage unavailable — leave null */ }
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
        } catch { /* ignore — UI already reflects intent */ }
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
        } catch { /* keep edit mode open on failure */ }
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
                        <div className="user-profile__row user-profile__row--inline">
                            <span className="user-profile__label">Accent</span>
                            <AccentSwitcher />
                        </div>
                        <div className="user-profile__row user-profile__row--inline">
                            <span className="user-profile__label">Design</span>
                            <select
                                className="user-profile__select"
                                style={{ width: 'auto', minWidth: '9rem' }}
                                value={design}
                                onChange={e => handleDesign(e.target.value)}
                            >
                                {DESIGNS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                            </select>
                        </div>
                    </section>

                    <section className="user-profile__section">
                            <h2 className="user-profile__section-title">
                                Token Budget{tokenUsage.month ? ` — ${formatMonthKey(tokenUsage.month)}` : ''}
                            </h2>

                            <div className="user-profile__usage-bar-track">
                                <div
                                    className="user-profile__usage-bar-fill"
                                    style={{
                                        width:           `${tokenUsage.percentUsed}%`,
                                        backgroundColor: barColor(tokenUsage.percentUsed),
                                    }}
                                />
                            </div>

                            <div className="user-profile__usage-meta">
                                <span>${tokenUsage.totalCost.toFixed(2)} of ${tokenUsage.budgetUsd.toFixed(2)}</span>
                                <span className="user-profile__usage-pct" style={{ color: barColor(tokenUsage.percentUsed) }}>
                                    {tokenUsage.percentUsed}%
                                </span>
                            </div>
                    </section>

                    <section className="user-profile__section">
                        <h2 className="user-profile__section-title">AI Preferences</h2>
                        <div className="user-profile__row user-profile__row--inline">
                            <span className="user-profile__label">Text speed</span>
                            <PaceSlider />
                        </div>
                        <div className="user-profile__agent">
                            <div className="user-profile__agent-field">
                                <span className="user-profile__label">AI Mode</span>
                                <select
                                    className="user-profile__select"
                                    style={{ width: 'auto', minWidth: '9rem' }}
                                    value={aiPref.routingMode}
                                    onChange={e => handleAiPref('routingMode', e.target.value)}
                                >
                                    {ROUTING_MODES.map(m => (
                                        <option key={m.id} value={m.id} title={m.title}>{m.short}</option>
                                    ))}
                                </select>
                            </div>
                            {aiPref.routingMode === 'manual' && (
                                <>
                                    <div className="user-profile__agent-field">
                                        <span className="user-profile__label">Model</span>
                                        <select
                                            className="user-profile__select"
                                            style={{ width: 'auto', minWidth: '9rem' }}
                                            value={aiPref.model}
                                            onChange={e => handleAiPref('model', e.target.value)}
                                        >
                                            {MODEL_OPTIONS.map(m => (
                                                <option key={m.id} value={m.id}>{m.short}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="user-profile__agent-field">
                                        <span className="user-profile__label">Reasoning</span>
                                        <select
                                            className="user-profile__select"
                                            style={{ width: 'auto', minWidth: '9rem' }}
                                            value={aiPref.reasoning}
                                            onChange={e => handleAiPref('reasoning', e.target.value)}
                                        >
                                            {REASONING_OPTIONS.map(r => (
                                                <option key={r.id} value={r.id}>{r.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
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

                    <section
                        className={`user-profile__section user-profile__section--brokers${workspace !== 'live' ? ' user-profile__section--inactive' : ''}`}
                        aria-disabled={workspace !== 'live' || undefined}
                    >
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

                    <PaperTradingSection inactive={workspace !== 'paper'} />

                    <ManualTradingSection inactive={workspace !== 'manual'} />

                </div>

            </div>
        </div>
    )
}
