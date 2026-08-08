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
// A `setup` (Mentor/Talos) reached its zone. Separate from ENTRY_CONFIRM_OPEN because that one
// resolves the entity out of the loaded IDEAS list, which setups are not in — see MainPage.
export const SETUP_CONFIRM_OPEN        = 'setup-confirm-open'
export const CALL_CONFIRM_OPEN         = 'call-confirm-open'
// Call-expiry card "Edit call" → reopen the call in Kairos's in-app edit mode to re-map the
// thesis (re-arms the monitor on save). A stale thesis is the invalidation axis, not a status
// (terminal) calls — updateKairosCall re-arms to 'waiting' regardless of prior status.
export const CALL_EXPIRY_EDIT          = 'call-expiry-edit'
// Entry-confirm card "Edit" → reopen the idea in its chat to change it (idea → building).
export const ENTRY_CONFIRM_EDIT        = 'entry-confirm-edit'
// Entry-confirm card "Dismiss" → park the triggered idea back to 'waiting' (re-armable).
export const ENTRY_CONFIRM_DISMISS     = 'entry-confirm-dismiss'
// Coverage-update card "Open coverage" → open the Analyst (its living coverage book).
export const OPEN_COVERAGE             = 'open-coverage'
// Sector-view card "Open sector view" → open the calendar on its Forecasts tab (the house view is
// a STATE, so the card opens the board rather than a chat — there is nothing to revise from here).
export const OPEN_SECTOR_VIEW          = 'open-sector-view'
// Daily market-brief card "Get the brief" → route to Axl and stream the brief into his thread,
// rather than posting a wall of market prose back into the social chat.
export const MARKET_BRIEF_OPEN         = 'market-brief-open'
// Market-open card "Open the list" → the Floor's queued desk, where work confirmed off-hours (and
// anything the sweep just unparked) is executed one row at a time.
export const OPEN_QUEUED_LIST          = 'open-queued-list'

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