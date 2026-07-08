export const SHOW_MSG                 = 'show-msg'
export const INVALIDATION_EDIT_IDEA   = 'invalidation-edit-idea'
export const INVALIDATION_CLOSE_TRADE = 'invalidation-close-trade'
export const PORTFOLIO_REVIEW         = 'portfolio-review'
// Manual (broker-less) fill confirmed from a social-chat FillCard → carries the updated
// idea so the app patches its ideas list + refreshes positions.
export const MANUAL_FILLED            = 'manual-filled'
// Manual portfolio activate / exit triggered from a portfolio row → posts the N-leg
// entry / exit FillCard to social chat (carries { portfolioId }).
export const MANUAL_PORTFOLIO_ACTIVATE = 'manual-portfolio-activate'
export const MANUAL_PORTFOLIO_EXIT     = 'manual-portfolio-exit'

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