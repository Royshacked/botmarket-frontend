import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { askOpener, hasOpener, listenForPopupEvents } from './popupBridge.js'
import { eventBus, SETUP_INVALIDATION_EDIT, CALL_EXPIRY_EDIT } from './event-bus.service'

// The pop-out → app-window channel. Every test here guards something that would either break the
// hand-off silently or widen it into a hole: a pop-out is a real window, and `postMessage` is
// reachable by anything holding a handle to the app.

const ORIGIN = window.location.origin

function fakeOpener() {
    return { closed: false, postMessage: vi.fn(), focus: vi.fn() }
}
// jsdom delivers no cross-window messages, so drive the listener the way the browser would.
const deliver = (data, origin = ORIGIN) => window.dispatchEvent(new MessageEvent('message', { data, origin }))
const message = (event, payload) => ({ channel: 'ar2trade:popup', event, payload })

let stop = null
beforeEach(() => { delete window.opener })
afterEach(() => { stop?.(); stop = null; vi.restoreAllMocks() })

describe('askOpener', () => {
    it('hands the ask to the opener, same-origin, and brings that window forward', () => {
        const opener = fakeOpener()
        window.opener = opener

        expect(askOpener(SETUP_INVALIDATION_EDIT, { setupId: 's1' })).toBe(true)
        expect(opener.postMessage).toHaveBeenCalledWith(message(SETUP_INVALIDATION_EDIT, { setupId: 's1' }), ORIGIN)
        // Without this the work happens in a window the user isn't looking at, so nothing appears
        // to have happened.
        expect(opener.focus).toHaveBeenCalled()
    })

    // A pop-out reached by a pasted URL has no app behind it. Reporting false is what lets the page
    // render a sentence instead of a button that can only fail.
    it('reports false with no opener, or a closed one', () => {
        expect(askOpener(SETUP_INVALIDATION_EDIT, { setupId: 's1' })).toBe(false)
        window.opener = { ...fakeOpener(), closed: true }
        expect(askOpener(SETUP_INVALIDATION_EDIT, { setupId: 's1' })).toBe(false)
    })

    it('refuses to send an event that is not on the allow-list', () => {
        const opener = fakeOpener()
        window.opener = opener
        expect(askOpener(CALL_EXPIRY_EDIT, { callId: 'c1' })).toBe(false)
        expect(opener.postMessage).not.toHaveBeenCalled()
    })

    it('hasOpener tracks the same condition the buttons gate on', () => {
        expect(hasOpener()).toBe(false)
        window.opener = fakeOpener()
        expect(hasOpener()).toBe(true)
        window.opener = { closed: true }
        expect(hasOpener()).toBe(false)
    })
})

describe('listenForPopupEvents', () => {
    it('re-emits a forwardable ask on the app eventBus', () => {
        const seen = vi.fn()
        const off  = eventBus.on(SETUP_INVALIDATION_EDIT, seen)
        stop = listenForPopupEvents()

        deliver(message(SETUP_INVALIDATION_EDIT, { setupId: 's1' }))
        expect(seen).toHaveBeenCalledWith({ setupId: 's1' })
        off()
    })

    // THE HOLE THIS CLOSES. postMessage is reachable by any window holding a handle to this one, so
    // without the origin check and the allow-list, the app's whole event vocabulary is open to
    // whatever is on the other end.
    it('ignores another origin, another channel, and an event off the list', () => {
        const setup = vi.fn(); const call = vi.fn()
        const offA = eventBus.on(SETUP_INVALIDATION_EDIT, setup)
        const offB = eventBus.on(CALL_EXPIRY_EDIT, call)
        stop = listenForPopupEvents()

        deliver(message(SETUP_INVALIDATION_EDIT, { setupId: 'evil' }), 'https://attacker.example')
        deliver({ channel: 'something-else', event: SETUP_INVALIDATION_EDIT, payload: { setupId: 'evil' } })
        deliver(message(CALL_EXPIRY_EDIT, { callId: 'evil' }))
        deliver(null)

        expect(setup).not.toHaveBeenCalled()
        expect(call).not.toHaveBeenCalled()
        offA(); offB()
    })

    it('stops listening once unsubscribed', () => {
        const seen = vi.fn()
        const off  = eventBus.on(SETUP_INVALIDATION_EDIT, seen)
        listenForPopupEvents()()   // subscribe and immediately unsubscribe

        deliver(message(SETUP_INVALIDATION_EDIT, { setupId: 's1' }))
        expect(seen).not.toHaveBeenCalled()
        off()
    })
})
