export const SHOW_MSG                 = 'show-msg'
export const INVALIDATION_EDIT_IDEA   = 'invalidation-edit-idea'
export const INVALIDATION_CLOSE_TRADE = 'invalidation-close-trade'
export const PORTFOLIO_REVIEW         = 'portfolio-review'
// A portfolio review was resolved (dismissed or accepted) → the portfolio list refetches
// its due-review set so the red edit-pencil clears immediately.
export const REVIEW_RESOLVED          = 'review-resolved'
// Manual (broker-less) fill confirmed from a social-chat FillCard → carries the updated
// idea so the app patches its ideas list + refreshes positions.
export const MANUAL_FILLED            = 'manual-filled'
// Manual portfolio activate / exit triggered from a portfolio row → posts the N-leg
// entry / exit FillCard to social chat (carries { portfolioId }).
export const MANUAL_PORTFOLIO_ACTIVATE = 'manual-portfolio-activate'
export const MANUAL_PORTFOLIO_EXIT     = 'manual-portfolio-exit'
// Paper/live entry-confirm card ("Confirm order") → the app switches to the idea's workspace
// and surfaces the OrderConfirmDialog for it (carries { ideaId }).
export const ENTRY_CONFIRM_OPEN        = 'entry-confirm-open'
export const CALL_CONFIRM_OPEN         = 'call-confirm-open'
// Entry-confirm card "Edit" → reopen the idea in its chat to change it (idea → building).
export const ENTRY_CONFIRM_EDIT        = 'entry-confirm-edit'
// Entry-confirm card "Dismiss" → park the triggered idea back to 'waiting' (re-armable).
export const ENTRY_CONFIRM_DISMISS     = 'entry-confirm-dismiss'

function createEventEmitter() {
    const listenersMap = {}
    return {
        on(evName, listener){
            listenersMap[evName] = (listenersMap[evName])? [...listenersMap[evName], listener] : [listener]
            return ()=>{
                listenersMap[evName] = listenersMap[evName].filter(func => func !== listener)
            }
        },
        emit(evName, data) {
            if (!listenersMap[evName]) return
            listenersMap[evName].forEach(listener => listener(data))
        }
    }
}

export const eventBus = createEventEmitter()

export function showUserMsg(msg) {
    eventBus.emit(SHOW_MSG, msg)
}

export function showSuccessMsg(txt) {
    showUserMsg({txt, type: 'success'})
}
export function showErrorMsg(txt) {
    showUserMsg({txt, type: 'error'})
}