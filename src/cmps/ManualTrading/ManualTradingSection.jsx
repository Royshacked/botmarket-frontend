import { useEffect, useState } from 'react'
import { manualService } from '../../services/manual/manual.service.remote.js'

/**
 * Manual (broker-less real-money) account manager, rendered inside UserProfile.
 *
 * A leaner sibling of PaperTradingSection: manual accounts have NO cost model (you report
 * real fills) and NO global toggle (manual is a workspace VIEW you switch from the header,
 * and an account binds per idea). Each card shows live equity/P&L for the positions you're
 * tracking, plus reset/delete. Trade history is deferred (handled with the Axl work).
 * Reuses user-profile__* styles.
 */
const money = (n, ccy = 'USD') =>
    n == null ? '—' : `${n < 0 ? '-' : ''}${ccy === 'USD' ? '$' : ''}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

const pnlColor = n => (n > 0 ? 'var(--color-long)' : n < 0 ? 'var(--color-short)' : 'var(--text-secondary)')

export function ManualTradingSection({ inactive = false }) {
    const [accounts, setAccounts] = useState([])
    const [busy,     setBusy]     = useState(false)
    const [error,    setError]    = useState(null)
    const [creating, setCreating] = useState(false)

    useEffect(() => { _load() }, [])

    async function _load() {
        try {
            setAccounts(await manualService.listAccounts())
            setError(null)
        } catch {
            setError('Could not load manual accounts.')
        }
    }

    // Creating/deleting a manual account changes what the header picker + positions show,
    // so broadcast the same event the workspace hooks listen to.
    const _broadcast = () => window.dispatchEvent(new CustomEvent('paper-mode-changed'))

    async function patchAccount(id, patch) {
        const updated = await manualService.updateAccount(id, patch)
        setAccounts(list => list.map(a => (a.accountId === id ? updated : a)))
    }
    async function resetAccount(id, startingBalance) {
        const updated = await manualService.resetAccountById(id, startingBalance)
        setAccounts(list => list.map(a => (a.accountId === id ? updated : a)))
    }
    async function deleteAccount(id) {
        await manualService.deleteAccount(id)
        setAccounts(list => list.filter(a => a.accountId !== id))
        _broadcast()
    }
    async function createAccount(draft) {
        setBusy(true)
        try {
            const created = await manualService.createAccount(draft)
            setAccounts(list => [...list, created])
            setCreating(false)
            _broadcast()
        } finally { setBusy(false) }
    }

    return (
        <section className={`user-profile__section${inactive ? ' user-profile__section--inactive' : ''}`} aria-disabled={inactive || undefined}>
            <h2 className="user-profile__section-title">Manual Trading</h2>
            <p style={{ fontSize: '0.81rem', color: 'var(--text-dim)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Broker-less real-money accounts — the app monitors your ideas and asks you to enter/exit
                at your own broker, then records the real prices you report. Switch to the Manual workspace
                from the header, and bind one account per idea.
            </p>

            {error && (
                <p style={{ fontSize: '0.81rem', color: 'var(--color-warning, #e6a817)', marginBottom: 8 }}>{error}</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px' }}>
                <h3 style={{ fontSize: '0.83rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', margin: 0 }}>
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
                ? <p style={{ fontSize: '0.83rem', color: 'var(--text-dim)' }}>No manual accounts yet — create one to start tracking real-money trades.</p>
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
    const [open, setOpen] = useState(false)
    const [name, setName] = useState(acct.name ?? '')
    const [draftBalance, setDraftBalance] = useState(String(acct.startingBalance ?? ''))
    const [busy, setBusy] = useState(false)
    const [err,  setErr]  = useState(null)

    const ccy = acct.currency ?? 'USD'

    async function run(fn) {
        setBusy(true); setErr(null)
        try { await fn() }
        catch (e) {
            setErr(e?.response?.status === 409
                ? (e?.response?.data?.error ?? 'Account has open positions — close them first.')
                : 'Action failed.')
        }
        finally { setBusy(false) }
    }

    const saveName = () => {
        const next = name.trim()
        if (!next || next === acct.name) { setName(acct.name ?? ''); return }
        run(() => onPatch(acct.accountId, { name: next }))
    }
    const doReset = () => {
        if (!window.confirm(`Reset "${acct.name}"? This clears its tracked positions and P&L.`)) return
        run(() => onReset(acct.accountId, draftBalance ? Number(draftBalance) : undefined))
    }
    const doDelete = () => {
        if (!window.confirm(`Delete "${acct.name}"? This removes the account and its tracked history.`)) return
        run(() => onDelete(acct.accountId))
    }

    return (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: 'var(--bg-surface)' }}>
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

            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: pnlColor(acct.realizedPnl) }}>R {money(acct.realizedPnl, ccy)}</span>
                <span style={{ color: pnlColor(acct.unrealized) }}>U {money(acct.unrealized, ccy)}</span>
                <span style={{ color: 'var(--text-dim)' }}>{acct.openPositions ?? 0} open</span>
            </div>

            {err && <p style={{ fontSize: '0.75rem', color: 'var(--color-short)', margin: '6px 0 0' }}>{err}</p>}

            {open && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <Stat label="Cash"  value={money(acct.cashBalance, ccy)} />
                        <Stat label="Start" value={money(acct.startingBalance, ccy)} />
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
                    placeholder="e.g. My Chase account" disabled={busy}
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

function Stat({ label, value, color }) {
    return (
        <div style={{ background: 'var(--bg-elevated, var(--bg-surface))', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: '0.71rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
        </div>
    )
}
