import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { paperService } from '../../services/paper/paper.service.remote.js'

/**
 * Paper trading control + results, rendered inside UserProfile.
 *
 * A manager for the user's N named simulated accounts ("Scalping", "Swing", …): each
 * card shows live equity/P&L, cost config, reset and delete, plus its recent trades on
 * expand. A "New account" form creates more. The global mode toggle at the top is
 * TRANSITIONAL — it routes new ideas to the default paper account until the per-idea
 * account picker replaces it. Reuses user-profile__* styles.
 */
const money = (n, ccy = 'USD') =>
    n == null ? '—' : `${n < 0 ? '-' : ''}${ccy === 'USD' ? '$' : ''}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

const pnlColor = n => (n > 0 ? 'var(--color-long)' : n < 0 ? 'var(--color-short)' : 'var(--text-secondary)')

export function PaperTradingSection() {
    const [accounts, setAccounts] = useState([])
    const [enabled,  setEnabled]  = useState(false)
    const [busy,     setBusy]     = useState(false)
    const [error,    setError]    = useState(null)
    const [confirmOn, setConfirmOn] = useState(false)
    const [creating,  setCreating]  = useState(false)

    useEffect(() => { _load() }, [])

    async function _load() {
        try {
            const [accs, st] = await Promise.all([
                paperService.listAccounts(),
                paperService.getState(),
            ])
            setAccounts(accs)
            setEnabled(!!st?.enabled)
            setError(null)
        } catch (err) {
            setError(err?.response?.status === 404
                ? 'Paper API not found — restart the backend to enable it.'
                : 'Could not load paper accounts.')
        }
    }

    // Turning paper ON routes new ideas to a simulated account, so confirm intent first.
    function requestToggle() {
        if (enabled) applyToggle()
        else setConfirmOn(true)
    }
    async function applyToggle() {
        setBusy(true)
        try {
            const st = await paperService.setMode(!enabled)
            setEnabled(!!st?.enabled)
            setAccounts(await paperService.listAccounts())   // first enable creates the default account
            window.dispatchEvent(new CustomEvent('paper-mode-changed'))
        } finally { setBusy(false) }
    }
    async function confirmToggle() { setConfirmOn(false); await applyToggle() }

    // ── Per-account mutations (parent owns the list; endpoints return the updated acct) ──
    async function patchAccount(id, patch) {
        const updated = await paperService.updateAccount(id, patch)
        setAccounts(list => list.map(a => (a.accountId === id ? updated : a)))
    }
    async function resetAccount(id, startingBalance) {
        const updated = await paperService.resetAccountById(id, startingBalance)
        setAccounts(list => list.map(a => (a.accountId === id ? updated : a)))
    }
    async function deleteAccount(id) {
        await paperService.deleteAccount(id)
        setAccounts(list => list.filter(a => a.accountId !== id))
        window.dispatchEvent(new CustomEvent('paper-mode-changed'))
    }
    async function createAccount(draft) {
        setBusy(true)
        try {
            const created = await paperService.createAccount(draft)
            setAccounts(list => [...list, created])
            setCreating(false)
            window.dispatchEvent(new CustomEvent('paper-mode-changed'))
        } finally { setBusy(false) }
    }

    return (
        <section className="user-profile__section">
            <h2 className="user-profile__section-title">Paper Trading</h2>

            {error && (
                <p style={{ fontSize: '0.78rem', color: 'var(--color-warning, #e6a817)', marginBottom: 8 }}>{error}</p>
            )}

            {/* Global mode toggle (transitional) */}
            <div className="user-profile__row user-profile__row--inline">
                <span className="user-profile__label">
                    Simulation mode
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>
                        Route new ideas to your default paper account
                    </span>
                </span>
                <button
                    className={`user-profile__btn ${enabled ? 'user-profile__btn--primary' : 'user-profile__btn--ghost'}`}
                    onClick={requestToggle}
                    disabled={busy}
                >
                    {enabled ? 'On' : 'Off'}
                </button>
            </div>

            {confirmOn && (
                <PaperOnConfirm busy={busy} onConfirm={confirmToggle} onCancel={() => setConfirmOn(false)} />
            )}

            {/* Accounts */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 8px' }}>
                <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', margin: 0 }}>
                    Accounts
                </h3>
                {!creating && (
                    <button className="user-profile__btn user-profile__btn--ghost" onClick={() => setCreating(true)} disabled={busy}>
                        + New account
                    </button>
                )}
            </div>

            {creating && (
                <NewAccountForm busy={busy} onCreate={createAccount} onCancel={() => setCreating(false)} />
            )}

            {accounts.length === 0 && !creating
                ? <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No paper accounts yet — create one to start simulating.</p>
                : accounts.map(acct => (
                    <AccountCard
                        key={acct.accountId}
                        acct={acct}
                        onPatch={patchAccount}
                        onReset={resetAccount}
                        onDelete={deleteAccount}
                    />
                  ))
            }
        </section>
    )
}

// ── Account card ────────────────────────────────────────────────────────────────

function AccountCard({ acct, onPatch, onReset, onDelete }) {
    const [open,   setOpen]   = useState(false)
    const [name,   setName]   = useState(acct.name ?? '')
    const [draftBalance, setDraftBalance] = useState(String(acct.startingBalance ?? ''))
    const [trades, setTrades] = useState(null)
    const [busy,   setBusy]   = useState(false)
    const [err,    setErr]    = useState(null)

    const ccy = acct.currency ?? 'USD'
    const s   = acct.settings ?? {}

    // Lazy-load this account's recent trades the first time it's expanded.
    useEffect(() => {
        if (!open || trades != null) return
        paperService.getAccountTrades(acct.accountId, { limit: 25 })
            .then(setTrades)
            .catch(() => setTrades([]))
    }, [open, trades, acct.accountId])

    async function run(fn) {
        setBusy(true); setErr(null)
        try { await fn() }
        catch (e) {
            setErr(e?.response?.status === 409
                ? (e?.response?.data?.error ?? 'Account has open positions or resting orders.')
                : 'Action failed.')
        }
        finally { setBusy(false) }
    }

    const saveName = () => {
        const next = name.trim()
        if (!next || next === acct.name) { setName(acct.name ?? ''); return }
        run(() => onPatch(acct.accountId, { name: next }))
    }
    const saveSetting = patch => run(() => onPatch(acct.accountId, patch))
    const doReset  = () => {
        if (!window.confirm(`Reset "${acct.name}"? This clears its simulated positions, orders and P&L.`)) return
        run(async () => {
            await onReset(acct.accountId, draftBalance ? Number(draftBalance) : undefined)
            setTrades(null)   // force a reload on next expand
        })
    }
    const doDelete = () => {
        if (!window.confirm(`Delete "${acct.name}"? This removes the account and its simulated history.`)) return
        run(() => onDelete(acct.accountId))
    }

    return (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: 'var(--bg-surface)' }}>
            {/* Header row: name + headline equity + expand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                    className="user-profile__input"
                    style={{ flex: 1, fontWeight: 700 }}
                    value={name}
                    disabled={busy}
                    onChange={e => setName(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    aria-label="Account name"
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{money(acct.equity, ccy)}</span>
                <button className="user-profile__btn user-profile__btn--ghost" onClick={() => setOpen(o => !o)} aria-label="Toggle details">
                    {open ? '▾' : '▸'}
                </button>
            </div>

            {/* Collapsed P&L glance */}
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: pnlColor(acct.realizedPnl) }}>R {money(acct.realizedPnl, ccy)}</span>
                <span style={{ color: pnlColor(acct.unrealized) }}>U {money(acct.unrealized, ccy)}</span>
                <span style={{ color: 'var(--text-dim)' }}>{acct.openPositions ?? 0} open</span>
            </div>

            {err && <p style={{ fontSize: '0.72rem', color: 'var(--color-short)', margin: '6px 0 0' }}>{err}</p>}

            {open && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <Stat label="Cash"  value={money(acct.cashBalance, ccy)} />
                        <Stat label="Start" value={money(acct.startingBalance, ccy)} />
                        <Stat label="Exposure" value={money(acct.marginUsed, ccy)}
                            color={acct.overLeveraged ? 'var(--color-short)' : undefined} />
                        <Stat label="Buying power"
                            value={acct.buyingPower != null ? money(acct.buyingPower, ccy) : '∞'} />
                    </div>
                    {acct.overLeveraged && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--color-short)', margin: '0 0 8px' }}>
                            Over buying power — exposure exceeds equity × leverage (advisory; fills still simulate).
                        </p>
                    )}

                    <div className="user-profile__row user-profile__row--inline">
                        <span className="user-profile__label">Spread (bps)</span>
                        <input className="user-profile__input" style={{ width: '6rem' }} type="number"
                            defaultValue={s.spreadBps ?? 0} disabled={busy}
                            onBlur={e => saveSetting({ spreadBps: Number(e.target.value) })} />
                    </div>
                    <div className="user-profile__row user-profile__row--inline">
                        <span className="user-profile__label">Commission / trade</span>
                        <input className="user-profile__input" style={{ width: '6rem' }} type="number"
                            defaultValue={s.commissionPerTrade ?? 0} disabled={busy}
                            onBlur={e => saveSetting({ commissionPerTrade: Number(e.target.value) })} />
                    </div>
                    <div className="user-profile__row user-profile__row--inline">
                        <span className="user-profile__label">
                            Max leverage
                            <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)' }}>0 = off (no cap)</span>
                        </span>
                        <input className="user-profile__input" style={{ width: '6rem' }} type="number" min="0" step="0.5"
                            defaultValue={s.maxLeverage ?? 0} disabled={busy}
                            onBlur={e => saveSetting({ maxLeverage: Number(e.target.value) })} />
                    </div>
                    <div className="user-profile__row user-profile__row--inline">
                        <span className="user-profile__label">Reset balance to</span>
                        <input className="user-profile__input" style={{ width: '8rem' }} type="number"
                            value={draftBalance} disabled={busy}
                            onChange={e => setDraftBalance(e.target.value)} />
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="user-profile__btn user-profile__btn--ghost" onClick={doReset} disabled={busy}>Reset</button>
                        <button className="user-profile__btn user-profile__btn--danger" onClick={doDelete} disabled={busy}>Delete</button>
                    </div>

                    {/* Recent trades */}
                    <h4 style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', margin: '14px 0 6px' }}>
                        Recent trades
                    </h4>
                    {trades == null
                        ? <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Loading…</p>
                        : trades.length === 0
                            ? <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>No simulated trades yet.</p>
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                                {trades.map(t => <TradeRow key={t.tradeId} t={t} ccy={ccy} />)}
                              </div>
                    }
                </div>
            )}
        </div>
    )
}

// ── New-account form ────────────────────────────────────────────────────────────

function NewAccountForm({ busy, onCreate, onCancel }) {
    const [name, setName] = useState('')
    const [balance, setBalance] = useState('100000')
    const canCreate = name.trim().length > 0 && !busy

    return (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
            <div className="user-profile__row user-profile__row--inline">
                <span className="user-profile__label">Name</span>
                <input className="user-profile__input" style={{ width: '10rem' }} value={name} autoFocus
                    placeholder="e.g. Scalping" disabled={busy}
                    onChange={e => setName(e.target.value)} />
            </div>
            <div className="user-profile__row user-profile__row--inline">
                <span className="user-profile__label">Starting balance</span>
                <input className="user-profile__input" style={{ width: '8rem' }} type="number" value={balance} disabled={busy}
                    onChange={e => setBalance(e.target.value)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button className="user-profile__btn user-profile__btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
                <button className="user-profile__btn user-profile__btn--primary" disabled={!canCreate}
                    onClick={() => onCreate({ name: name.trim(), startingBalance: balance ? Number(balance) : undefined })}>
                    {busy ? 'Creating…' : 'Create'}
                </button>
            </div>
        </div>
    )
}

// ── Shared bits ─────────────────────────────────────────────────────────────────

const _confirmBackdrop = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
const _confirmCard = {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '18px 20px', maxWidth: 380, width: '90%', boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
}

function PaperOnConfirm({ busy, onConfirm, onCancel }) {
    return createPortal(
        <div style={_confirmBackdrop} onClick={busy ? undefined : onCancel}>
            <div style={_confirmCard} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: 'var(--text-primary)' }}>
                    Turn on paper mode?
                </h3>
                <p style={{ margin: '0 0 16px', fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    New ideas will route to a <strong>simulated</strong> account and place no real
                    orders. Your live broker and any existing live positions are unaffected — this
                    only changes where <em>new</em> ideas go.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="user-profile__btn user-profile__btn--ghost" onClick={onCancel} disabled={busy}>
                        Cancel
                    </button>
                    <button className="user-profile__btn user-profile__btn--primary" onClick={onConfirm} disabled={busy}>
                        {busy ? 'Enabling…' : 'Turn on paper'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

function Stat({ label, value, color }) {
    return (
        <div style={{ background: 'var(--bg-elevated, var(--bg-surface))', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
        </div>
    )
}

function TradeRow({ t, ccy }) {
    const pnl  = t.exit?.realizedPnl
    const open = t.status === 'open'
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontFamily: 'var(--font-mono)', padding: '4px 8px', background: 'var(--bg-elevated, var(--bg-surface))', borderRadius: 4 }}>
            <span style={{ fontWeight: 700, minWidth: 56 }}>{t.symbol}</span>
            <span style={{ color: t.direction === 'long' ? 'var(--color-long)' : 'var(--color-short)' }}>
                {t.direction === 'long' ? '↑' : '↓'}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
                {t.entry?.price ?? '?'}{!open && t.exit?.price != null ? ` → ${t.exit.price}` : ''}
            </span>
            <span style={{ marginLeft: 'auto', color: open ? 'var(--text-dim)' : pnlColor(pnl), fontWeight: 700 }}>
                {open ? 'open' : money(pnl, ccy)}
            </span>
            {!open && t.exit?.reason && (
                <span style={{ color: 'var(--text-dim)', fontSize: '0.68rem', textTransform: 'uppercase' }}>{t.exit.reason}</span>
            )}
        </div>
    )
}
