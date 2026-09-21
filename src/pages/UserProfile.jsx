import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { useAuth }             from '../cmps/AuthModal/useAuth'
import { brokerService }       from '../services/broker/broker.service.remote.js'
import { httpService }         from '../services/http.service.js'
import { userService }         from '../services/user/user.service.remote.js'
import { ThemeSwitcher }       from '../cmps/ThemeSwitcher/ThemeSwitcher'
import { AccentSwitcher }      from '../cmps/AccentSwitcher/AccentSwitcher'
import { CandleColorPicker }   from '../cmps/CandleColorPicker/CandleColorPicker'
import { ModeSwitcher }        from '../cmps/ModeSwitcher/ModeSwitcher'
import { loadAppearance }      from '../services/themeService.js'
import { PaceSlider }          from '../cmps/PaceSlider.jsx'
import { chatModelOptions, readStoredModel, MODEL_OPTIONS, DEFAULT_MODEL, TALOS_MODEL_KEY, TALOS_MODEL_OPTIONS, TALOS_DEFAULT_MODEL, readStoredTalosModel } from '../cmps/modelOptions.js'
import { AI_MODEL_KEY } from '../services/aiPrefKeys.js'
import { DESIGNS, loadDesign, saveDesign, applyDesign } from '../services/designService.js'
import { queuePrefSync } from '../services/preferences.service.js'
import { PaperTradingSection } from '../cmps/PaperTrading/PaperTradingSection.jsx'
import { ManualTradingSection } from '../cmps/ManualTrading/ManualTradingSection.jsx'
import { PushAlertsSection } from '../cmps/PushAlerts/PushAlertsSection.jsx'
import { useWorkspaceMode } from '../customHooks/useWorkspaceMode'
import { initials } from '../services/util.service.js'
import { NAV, VENUE_OF_WORKSPACE, tabFromHash } from './profileTabs.js'
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

const WORKSPACE_LABEL = { live: 'Live', paper: 'Paper', manual: 'Manual' }

// ONE setting — the model — shared by every conversational desk, under one key
// (services/aiPrefKeys.js). There is no desk list, so a new desk is honoured as soon as it
// calls readStoredModel().
//
// The AI-Mode (manual/auto/classifier) and Reasoning selectors that used to sit beside this are
// GONE, along with the whole routing layer behind them. Both changed a request parameter
// mid-conversation, and both a model change and a reasoning change invalidate the prompt cache:
// the conversation is re-read at 1x and re-written at 1.25x instead of read at 0.1x. Picking a
// cheaper model or a lighter effort for one turn never repaid that, and the penalty grew with
// conversation length while the saving did not. The model is now a per-user choice that holds
// for the life of a thread.
//
// Hermes — the Kairos monitor — used to have its own model+reasoning card here. Kairos and
// Hermes are dormant (trading runs Argus → Mentor → Talos), so the card named a desk that
// isn't running and was removed.
//
// NOTE: the hermesModel/hermesReasoning keys it wrote are NOT dead. assess.shared.js reads them
// for the live Talos as one "how hard should my monitors think" knob. `hermesModel` got its card
// back on 2026-09-20 as "Monitors" — ADMIN ONLY, because what it offers are the candidate models
// under evaluation for the Talos read (cmps/modelOptions.js TALOS_MODEL_OPTIONS): the admin picks
// one, their own setups are read on it from the next wake, and the journal rows say which model
// made each read. `hermesReasoning` stays UI-less (capped at `low` server-side anyway).
//
// SINCE 2026-09-21 BOTH SELECTORS ARE THE ADMIN'S ALONE. A non-admin's desks and setup reads run
// on the HOUSE models (backend services/houseModels.service.js) — one choice the admin makes for
// everyone, in the "House models" card below — and whatever their client still sends is not
// consulted server-side. The admin's own two selectors stay: that is how a candidate is tried on
// the admin's own account before it becomes the house's.

export function UserProfile() {
    const { user, setUser, signout, isAdmin } = useAuth()
    const navigate                            = useNavigate()
    const location                            = useLocation()

    // The open tab IS the URL hash — no mirrored state, so a header link to `/profile#paper`
    // and the browser's back button both just work. Selecting pushes a history entry.
    const tab = tabFromHash(location.hash)
    function selectTab(id) {
        if (id !== tab) navigate({ hash: `#${id}` })
    }

    // On a phone the nav is a horizontal pill row — a tab opened by URL can sit off its right
    // edge, so bring the open one into view. A no-op on desktop where the whole nav is visible.
    const navRef = useRef(null)
    useEffect(() => {
        navRef.current?.querySelector('.is-active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }, [tab])

    // Active workspace (from the header switch). It is shown — a chip in the hero and an
    // "Active" badge on the matching venue section — never enforced: every venue stays
    // editable whichever book the user is standing in. The non-active sections used to be
    // dimmed + pointer-events:none, which forced a trip to the header switch just to connect
    // a broker while looking at paper, with nothing on the page saying why.
    const { workspace } = useWorkspaceMode(user?._id)

    const [connections,  setConnections]  = useState({})
    const [accountData,  setAccountData]  = useState({})
    const [savingBroker, setSavingBroker] = useState(null)

    const [editMode,      setEditMode]      = useState(false)
    const [draftFullname, setDraftFullname] = useState('')
    const [saving,        setSaving]        = useState(false)

    const [tokenUsage, setTokenUsage] = useState({ month: '', totalCost: 0, budgetUsd: 20, percentUsed: 0 })

    const [model, setModel] = useState(readStoredModel())
    const [talosModel, setTalosModel] = useState(readStoredTalosModel())

    const [design, setDesign] = useState(loadDesign())
    function handleDesign(id) {
        setDesign(id)
        saveDesign(id)
        applyDesign(id)
        queuePrefSync()
    }

    // One setting, so one handler. It took a `field` name while there were three (model /
    // reasoning / routingMode); keeping that shape with one field left would silently write the
    // model key for any field passed.
    function handleModel(value) {
        localStorage.setItem(AI_MODEL_KEY, value)
        setModel(value)
        queuePrefSync()
    }

    function handleTalosModel(value) {
        localStorage.setItem(TALOS_MODEL_KEY, value)
        setTalosModel(value)
        queuePrefSync()
    }

    // The house models — server state, not a preference: read on load (admin only), written per
    // change. An unset id shows as the server's default for that registry, which is what an unset
    // one resolves to there (llmModels.DEFAULT_MODEL / assess.shared ASSESS_MODEL).
    const [house, setHouse]           = useState(null)   // { chatModel, talosModel } once loaded
    const [houseError, setHouseError] = useState('')
    useEffect(() => {
        if (!isAdmin) return
        userService.getHouseModels()
            .then(h => setHouse({ chatModel: h?.chatModel ?? DEFAULT_MODEL, talosModel: h?.talosModel ?? TALOS_DEFAULT_MODEL }))
            .catch(() => setHouseError('Could not load the house models.'))
    }, [isAdmin])

    async function handleHouse(key, value) {
        const prev = house
        setHouse(h => ({ ...h, [key]: value }))
        setHouseError('')
        try {
            const h = await userService.setHouseModels({ [key]: value })
            setHouse({ chatModel: h?.chatModel ?? DEFAULT_MODEL, talosModel: h?.talosModel ?? TALOS_DEFAULT_MODEL })
        } catch {
            setHouse(prev)
            setHouseError('The house model was not saved.')
        }
    }

    // Dark ⇄ light. Held here (not just inside ModeSwitcher) because the background sliders
    // paint their own track from the active palette at render time — re-keying them on a mode
    // change is what makes those tracks follow the switch.
    const [appearance, setAppearance] = useState(loadAppearance)

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

    const activeVenue = VENUE_OF_WORKSPACE[workspace]

    return (
        <div className="user-profile">

            {/* ── Identity hero — who this page belongs to ── */}
            <header className="user-profile__hero">
                <span className="user-profile__avatar" aria-hidden="true">{initials(user.fullname)}</span>
                <div className="user-profile__identity">
                    <h1 className="user-profile__name">{user.fullname || user.username || 'Trader'}</h1>
                    <div className="user-profile__meta">
                        {user.username && <span className="user-profile__handle">@{user.username}</span>}
                        {isAdmin && <span className="user-profile__chip user-profile__chip--admin">Admin</span>}
                        <span className={`user-profile__chip user-profile__chip--${workspace}`}>
                            {WORKSPACE_LABEL[workspace] ?? workspace} workspace
                        </span>
                    </div>
                </div>
                <button
                    className="user-profile__btn user-profile__btn--signout"
                    onClick={async () => { await signout(); navigate('/') }}
                >
                    Sign out
                </button>
            </header>

            <div className="user-profile__body">

                {/* ── Left: section nav ── */}
                <nav ref={navRef} className="user-profile__nav" aria-label="Profile sections">
                    {NAV.map(group => (
                        <div key={group.label} className="user-profile__nav-group">
                            <span className="user-profile__nav-group-label">{group.label}</span>
                            {group.tabs.map(t => (
                                <button
                                    key={t.id}
                                    className={`user-profile__nav-item${tab === t.id ? ' is-active' : ''}`}
                                    aria-current={tab === t.id ? 'page' : undefined}
                                    onClick={() => selectTab(t.id)}
                                >
                                    {t.label}
                                    {t.id === activeVenue && <span className="user-profile__nav-dot" title="Active workspace" />}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>

                {/* ── Right: the one open section ── */}
                <main className="user-profile__main">

                    {tab === 'account' && (
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
                    )}

                    {tab === 'appearance' && (
                        <section className="user-profile__section">
                            <h2 className="user-profile__section-title">Appearance</h2>
                            <div className="user-profile__row user-profile__row--inline">
                                <span className="user-profile__label">Mode</span>
                                <ModeSwitcher onChange={setAppearance} />
                            </div>
                            <div className="user-profile__row user-profile__row--inline">
                                <span className="user-profile__label">Theme</span>
                                <ThemeSwitcher key={appearance} />
                            </div>
                            <div className="user-profile__row user-profile__row--inline">
                                <span className="user-profile__label">Accent</span>
                                <AccentSwitcher />
                            </div>
                            <div className="user-profile__row user-profile__row--inline">
                                <span className="user-profile__label">Candles</span>
                                <CandleColorPicker />
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
                    )}

                    {tab === 'alerts' && <PushAlertsSection />}

                    {tab === 'ai' && (
                        <section className="user-profile__section">
                            <h2 className="user-profile__section-title">AI Preferences</h2>
                            <div className="user-profile__row user-profile__row--inline">
                                <span className="user-profile__label">Text speed</span>
                                <PaceSlider />
                            </div>
                            {isAdmin ? (
                                <div className="user-profile__agent">
                                    <span className="user-profile__agent-name">Your desks — admin</span>
                                    <div className="user-profile__agent-field">
                                        <span className="user-profile__label">Model</span>
                                        <select
                                            className="user-profile__select"
                                            style={{ width: 'auto', minWidth: '9rem' }}
                                            value={model}
                                            aria-label="Chat model"
                                            onChange={e => handleModel(e.target.value)}
                                        >
                                            {chatModelOptions(isAdmin).map(m => (
                                                <option key={m.id} value={m.id}>{m.short}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <span className="user-profile__agent-note">Your own account only. Everyone else runs on the house models below.</span>
                                </div>
                            ) : (
                                <div className="user-profile__agent">
                                    <span className="user-profile__agent-note">The model your desks run on is set by the house.</span>
                                </div>
                            )}
                            {isAdmin && (
                                <div className="user-profile__agent">
                                    <span className="user-profile__agent-name">House models — admin</span>
                                    <div className="user-profile__agent-field">
                                        <span className="user-profile__label">Desks</span>
                                        <select
                                            className="user-profile__select"
                                            style={{ width: 'auto', minWidth: '9rem' }}
                                            value={house?.chatModel ?? DEFAULT_MODEL}
                                            aria-label="House chat model"
                                            disabled={!house}
                                            onChange={e => handleHouse('chatModel', e.target.value)}
                                        >
                                            {MODEL_OPTIONS.map(m => (
                                                <option key={m.id} value={m.id}>{m.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="user-profile__agent-field">
                                        <span className="user-profile__label">Monitors (Talos)</span>
                                        <select
                                            className="user-profile__select"
                                            style={{ width: 'auto', minWidth: '9rem' }}
                                            value={house?.talosModel ?? TALOS_DEFAULT_MODEL}
                                            aria-label="House Talos model"
                                            disabled={!house}
                                            onChange={e => handleHouse('talosModel', e.target.value)}
                                        >
                                            {TALOS_MODEL_OPTIONS.map(m => (
                                                <option key={m.id} value={m.id}>{m.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <span className="user-profile__agent-note">
                                        What every non-admin's desks and setup reads run on, from their next turn — and the house runs with no user (the market brief, the coverage re-model).
                                        {houseError ? ` ${houseError}` : ''}
                                    </span>
                                </div>
                            )}
                            {isAdmin && (
                                <div className="user-profile__agent">
                                    <span className="user-profile__agent-name">Monitors (Talos) — admin</span>
                                    <div className="user-profile__agent-field">
                                        <span className="user-profile__label">Model</span>
                                        <select
                                            className="user-profile__select"
                                            style={{ width: 'auto', minWidth: '9rem' }}
                                            value={talosModel}
                                            aria-label="Talos model"
                                            onChange={e => handleTalosModel(e.target.value)}
                                        >
                                            {TALOS_MODEL_OPTIONS.map(m => (
                                                <option key={m.id} value={m.id}>{m.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <span className="user-profile__agent-note">Applies to your own setups from their next read. Each journal row names the model that made it.</span>
                                </div>
                            )}
                        </section>
                    )}

                    {tab === 'usage' && (
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
                    )}

                    {tab === 'brokers' && (
                        <section className="user-profile__section">
                            <h2 className="user-profile__section-title">
                                Brokers
                                {activeVenue === 'brokers' && <span className="user-profile__active-badge">Active</span>}
                            </h2>

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
                    )}

                    {tab === 'paper'  && <PaperTradingSection  active={activeVenue === 'paper'} />}

                    {tab === 'manual' && <ManualTradingSection active={activeVenue === 'manual'} />}

                </main>

            </div>
        </div>
    )
}
