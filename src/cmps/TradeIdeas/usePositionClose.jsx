import { useState } from 'react'
import { ClosePositionDialog } from './ClosePositionDialog.jsx'
import { posKey } from './PositionsTable.jsx'

/**
 * The close-at-market flow, once — for every surface that lists open positions.
 *
 * Closing is never a bare click anywhere in this app: it is a confirm against live details and
 * live market status (ClosePositionDialog), an in-flight lock so a row can't be fired twice, and —
 * for a group — a PARTIAL-failure report, because closing a book of five legs routinely closes
 * four. That is MECHANISM, and it used to live inside the Positions tab alone. The Floor's book is
 * a second surface onto the same positions, and a second copy of this would have drifted the
 * moment one of the two learned something (a new lock, a new error shape) the other didn't.
 *
 * WHICH rows offer a close, and what counts as a "group", stays with the surface that owns the
 * rows — this owns only the asking, the firing and the reporting.
 *
 * Both callbacks are optional: a surface that can't close (the read-only trade-idea dialog) gets
 * `requestClose` / `requestCloseGroup` back as undefined, which is exactly what the row renderers
 * test to decide whether a control exists at all.
 *
 * @param {object}   opts
 * @param {Function} [opts.onClosePosition]   (broker, positionId, accountId) => Promise
 * @param {Function} [opts.onClosePositions]  (positions[]) => Promise<{ closed, failed }>
 */
export function usePositionClose({ onClosePosition, onClosePositions } = {}) {
    const [pendingClose,   setPendingClose]   = useState(null)
    const [closingId,      setClosingId]      = useState(null)
    const [closeError,     setCloseError]     = useState(null)
    // Group (portfolio / account) close-all: the pending group, the key in flight, and the
    // partial-failure report — a group close can succeed for some legs and not others.
    const [pendingGroup,   setPendingGroup]   = useState(null)
    const [closingGroupId, setClosingGroupId] = useState(null)
    const [groupError,     setGroupError]     = useState(null)

    // A failed close used to leave the dialog sitting there unchanged, with the reason only in the
    // devtools console — so a broker refusal, a venue outage or a 500 all looked identical to a
    // click that didn't register, and the user's next move was to press it again. The dialog has
    // always had somewhere to put this (the group close used it); the single close just never did.
    async function confirmClose() {
        const position = pendingClose
        if (!position || !onClosePosition) return
        setClosingId(posKey(position))
        setCloseError(null)
        try {
            await onClosePosition(position.broker, position.id, position.accountId)
            setPendingClose(null)
        } catch (err) {
            console.error('[positions] close failed', err)
            setCloseError(err?.response?.data?.error ?? err?.message ?? 'Close failed')
        } finally {
            setClosingId(null)
        }
    }

    // Opening the dialog on another row must not inherit the previous row's failure.
    function requestClose(position) {
        setCloseError(null)
        setPendingClose(position)
    }

    // Close every position under a portfolio / account header. Partial failure is the normal case
    // worth showing (one leg's venue closed, a manual leg with no broker close), so the dialog
    // stays open reporting what didn't close.
    async function confirmCloseGroup() {
        const group = pendingGroup
        if (!group || !onClosePositions) return
        setClosingGroupId(group.key)
        setGroupError(null)
        try {
            const { failed } = await onClosePositions(group.positions)
            if (failed.length) {
                const names = failed.map(f => f.position.symbol ?? f.position.id).join(', ')
                setGroupError(`${failed.length} of ${group.positions.length} could not be closed: ${names}`)
                // Narrow the pending group to what's still open, so a retry doesn't fire a second
                // close at the legs that already went through.
                setPendingGroup({ ...group, positions: failed.map(f => f.position) })
            } else {
                setPendingGroup(null)
            }
        } catch (err) {
            console.error('[positions] group close failed', err)
            setGroupError(err?.message ?? 'Close failed')
        } finally {
            setClosingGroupId(null)
        }
    }

    function cancelCloseGroup() {
        setPendingGroup(null)
        setGroupError(null)
    }

    // Rendered by the caller as `{closeDialog}` — one element covering both shapes, so no surface
    // has to remember which props a single close takes and which a group does.
    const closeDialog = (
        <>
            <ClosePositionDialog
                position={pendingClose}
                closing={!!pendingClose && closingId === posKey(pendingClose)}
                error={closeError}
                onConfirm={confirmClose}
                onCancel={() => { setPendingClose(null); setCloseError(null) }}
            />
            {pendingGroup && (
                <ClosePositionDialog
                    positions={pendingGroup.positions}
                    label={pendingGroup.label}
                    closing={closingGroupId === pendingGroup.key}
                    error={groupError}
                    onConfirm={confirmCloseGroup}
                    onCancel={cancelCloseGroup}
                />
            )}
        </>
    )

    return {
        requestClose:      onClosePosition  ? requestClose : undefined,
        requestCloseGroup: onClosePositions ? setPendingGroup : undefined,
        closingId,
        closingGroupId,
        closeDialog,
    }
}
