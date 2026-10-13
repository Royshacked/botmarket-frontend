import { useEffect, useState } from 'react'
import { strategyService } from '../services/strategy/strategy.service.remote.js'

// An opened Assessed row's DETAIL (backend docs/design/assessment-light-list.md §2.2). The board's list carries only
// what a closed row shows; the evidence, money, flows, risks and the rest are read when the row opens.
//
// CACHED per assessment AND its `assessed_at`: reopening a row is free, and a re-assessment — a new `assessed_at` in
// the next poll of the list — reads the new detail. A module cache, so a row remounted by a poll keeps what it read.
// A row that already carries its detail (the full list from an old server, a test) is used as it is.

const _cache = new Map()

/** Test seam. */
export function _resetAssessmentDetailCache() { _cache.clear() }

const _isWhole = (row) => Boolean(row && 'evidence' in row)

/**
 * → `{ doc, loading, error, retry }`. `doc` is the whole assessment (the row merged with its detail) once read, or
 * the row itself while it loads or after a failure — the panel can always show what the row has.
 */
export function useAssessmentDetail(row, enabled) {
    const s = row?.subject ?? {}
    const kind = s.kind === 'theme' ? 'theme' : 'industry'
    const ref = kind === 'theme' ? s.id : s.code
    const key = `${kind}:${ref}@${row?.assessed_at ?? ''}`
    const whole = _isWhole(row)
    const [state, setState] = useState({ key: null, doc: null, error: null })
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        if (!enabled || whole || !ref) return
        if (_cache.has(key)) { setState({ key, doc: _cache.get(key), error: null }); return }
        let live = true
        setState({ key, doc: null, error: null })
        strategyService.getAssessmentDetail({ subject: kind === 'theme' ? { kind, id: ref } : { kind, code: ref } })
            .then(doc => {
                if (!live) return
                if (doc && typeof doc === 'object') { _cache.set(key, doc); setState({ key, doc, error: null }) }
                else setState({ key, doc: null, error: 'it is no longer published' })
            })
            .catch(err => { if (live) setState({ key, doc: null, error: err?.message || 'the read failed' }) })
        return () => { live = false }
    }, [enabled, whole, key, kind, ref, attempt])

    if (whole) return { doc: row, loading: false, error: null, retry: () => {} }
    const read = state.key === key ? state.doc : (_cache.get(key) ?? null)
    const error = state.key === key ? state.error : null
    return {
        doc: read ? { ...row, ...read } : row,
        loading: Boolean(enabled && !read && !error),
        error,
        retry: () => setAttempt(n => n + 1),
    }
}
