import { useState, useMemo } from 'react'
import PropTypes from 'prop-types'
import { adoptService } from '../../services/adopt/adopt.service.remote'
import {
    groupProblems, problemLabel, warningLabel, exclusionLabel, canCommit,
} from './adopt.utils.js'

/**
 * The confirm-and-adopt grid — where a book that already exists becomes a book we manage.
 *
 * Two jobs, and the second is the one that matters:
 *   1. take the book in (a paste, because nobody types twenty holdings into a chat box)
 *   2. show the user EXACTLY which line to fix, and refuse to commit until they have
 *
 * Every number here is asserted by a human reading a bank screen, and none of it can be verified. So
 * the grid is a review surface, not a form: it shows what was parsed, what does not add up, and what
 * cannot be adopted at all — then commits in one gesture. Nothing is real until Adopt.
 *
 * The staging round-trip is the SERVER's: it prices the lines, reconciles them against the stated
 * account value and hands back reason codes. This component never computes a valuation — a second
 * implementation of that arithmetic in a second repo is exactly how the balance would drift.
 */
export function AdoptBookGrid({ draft, onDraftChange, onAdopted, onCancel }) {
    const [paste, setPaste]       = useState('')
    const [busy, setBusy]         = useState(false)
    const [error, setError]       = useState(null)
    const [statedTotal, setTotal] = useState('')
    const [freeCash, setCash]     = useState('')

    const holdings = draft?.holdings ?? []
    const excluded = draft?.excluded ?? []
    const rec      = draft?.reconciliation ?? {}
    const { bySymbol, book } = useMemo(() => groupProblems(rec.problems), [rec.problems])
    const ready = canCommit(draft)

    async function _stage() {
        if (!paste.trim()) return
        setBusy(true); setError(null)
        try {
            // One entry point for both gestures: a first paste stages, a later one MERGES into the
            // same draft. Re-staging would mint a second book and adopt half of each.
            const next = draft
                ? await adoptService.refresh(draft.draftId, { paste })
                : await adoptService.stage({ paste, statedTotal: _num(statedTotal), freeCash: _num(freeCash) })
            onDraftChange?.(next)
            setPaste('')
        } catch (err) { setError(_message(err)) }
        finally { setBusy(false) }
    }

    async function _restate() {
        if (!draft) return
        setBusy(true); setError(null)
        try {
            onDraftChange?.(await adoptService.refresh(draft.draftId, {
                statedTotal: _num(statedTotal), freeCash: _num(freeCash),
            }))
        } catch (err) { setError(_message(err)) }
        finally { setBusy(false) }
    }

    async function _adopt() {
        setBusy(true); setError(null)
        try {
            const res = await adoptService.commit(draft.draftId)
            onAdopted?.(res)
        } catch (err) {
            // `partial_write` is the one refusal that means TRY AGAIN rather than fix something: every
            // step of the commit is idempotent, and the legs already written are skipped on the retry.
            const data = err?.response?.data
            setError(data?.reason === 'partial_write'
                ? `Some holdings didn't land (${(data.failed ?? []).map(f => f.asset).join(', ')}). Press Adopt again to finish.`
                : _message(err))
        } finally { setBusy(false) }
    }

    return (
        <div className="adopt-grid">
            <header className="adopt-grid__head">
                <h2>Your book at the bank</h2>
                <p className="adopt-grid__sub">
                    Paste it in — ticker, how many shares, what you paid. We&apos;ll price it and show you
                    anything that doesn&apos;t add up. Nothing is recorded until you press Adopt.
                </p>
            </header>

            <section className="adopt-grid__paste">
                <textarea
                    value={paste}
                    onChange={e => setPaste(e.target.value)}
                    rows={holdings.length ? 3 : 8}
                    placeholder={'AAPL   100   150.25\nMSFT   50    300\nBRK.B  12    410.10'}
                    aria-label="Paste your holdings"
                />
                <button type="button" onClick={_stage} disabled={busy || !paste.trim()}>
                    {draft ? 'Add these' : 'Read my book'}
                </button>
            </section>

            {holdings.length > 0 && (
                <table className="adopt-grid__table">
                    <thead>
                        <tr><th>Name</th><th>Shares</th><th>You paid</th><th>Now</th><th>Value</th><th /></tr>
                    </thead>
                    <tbody>
                        {holdings.map(h => {
                            const problems = bySymbol.get(h.symbol) ?? []
                            return (
                                <tr key={h.symbol} className={problems.length ? 'is-problem' : ''}>
                                    <td>{h.symbol}{h.direction === 'short' && <span className="adopt-grid__short"> SHORT</span>}</td>
                                    <td>{h.quantity ?? '—'}</td>
                                    <td>{h.avgCost ?? '—'}</td>
                                    <td>{h.mark ?? '—'}</td>
                                    <td>{h.quantity != null && h.mark != null ? _round(h.quantity * h.mark) : '—'}</td>
                                    <td className="adopt-grid__rowmsg">
                                        {problems.map(p => <span key={p}>{problemLabel(p)}</span>)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            )}

            {/* Named, never silently dropped: a holding that vanished would read as "the app lost it". */}
            {excluded.length > 0 && (
                <section className="adopt-grid__excluded">
                    <h3>Not in this book</h3>
                    <ul>
                        {excluded.map(h => (
                            <li key={h.symbol}><strong>{h.symbol}</strong> — {exclusionLabel(h.reason)}</li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="adopt-grid__account">
                <label>
                    What the bank says it&apos;s worth
                    <input value={statedTotal} onChange={e => setTotal(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                    Cash on the side
                    <input value={freeCash} onChange={e => setCash(e.target.value)} inputMode="decimal" />
                </label>
                {draft && <button type="button" onClick={_restate} disabled={busy}>Update</button>}
                {rec.startingBalance != null && (
                    <p className="adopt-grid__sums">
                        Cost basis {rec.costBasis} · worth {rec.marketValue} · cash {rec.freeCash}
                        {draft?.statedCurrency && draft.statedCurrency !== 'USD' &&
                            ` · converted from ${draft.statedCurrency} at ${draft.fxToUsd}`}
                    </p>
                )}
            </section>

            {book.length > 0 && (
                <ul className="adopt-grid__problems">
                    {book.map(p => <li key={p}>{problemLabel(p)}</li>)}
                </ul>
            )}

            {/* Advisory. Deliberately styled apart from the blockers above: a warning that looks like a
                refusal teaches people to ignore both. */}
            {draft?.warnings?.length > 0 && (
                <ul className="adopt-grid__warnings">
                    {draft.warnings.map(w => <li key={w}>{warningLabel(w)}</li>)}
                </ul>
            )}

            {error && <p className="adopt-grid__error" role="alert">{error}</p>}

            <footer className="adopt-grid__foot">
                <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
                <button type="button" className="is-primary" onClick={_adopt} disabled={busy || !ready}>
                    Adopt this book
                </button>
            </footer>
        </div>
    )
}

const _num    = v => (String(v).trim() === '' ? null : Number(v))
const _round  = v => Math.round(v * 100) / 100
const _message = err => err?.response?.data?.error ?? err?.message ?? 'Something went wrong'

AdoptBookGrid.propTypes = {
    draft:         PropTypes.object,
    onDraftChange: PropTypes.func,
    onAdopted:     PropTypes.func,
    onCancel:      PropTypes.func,
}
