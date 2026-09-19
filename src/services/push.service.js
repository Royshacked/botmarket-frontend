// Web push, the device side. The browser's push service mints a subscription for this
// origin; we hand it to the backend, which sends every chat message to it from then on
// (services/push.service.js there). One subscription per browser profile — the phone and
// the desktop each register on their own.
//
// Explicit extension on the import: the `.test.js` suites run under plain `node --test`.
import { httpService } from './http.service.js'

/** What THIS browser can do. PURE over the globals it is handed, so it is testable. */
export function pushSupport(win = globalThis) {
    const nav = win.navigator
    return Boolean(nav?.serviceWorker && win.PushManager && win.Notification)
}

/**
 * Where this browser stands: 'unsupported' | 'denied' | 'off' | 'on'.
 *   denied  the user refused the permission prompt — only the browser's site settings can undo it
 *   off     allowed (or not yet asked) but no live subscription here
 *   on      subscribed on this device
 */
export async function pushStatus() {
    if (!pushSupport()) return 'unsupported'
    if (Notification.permission === 'denied') return 'denied'
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return sub ? 'on' : 'off'
}

/**
 * Subscribe this browser. Asks the permission (must be called from a user gesture, or the
 * browser suppresses the prompt), subscribes with the server's public key, registers with the
 * backend. Throws with a readable message on each way it can fail.
 */
export async function enablePush() {
    if (!pushSupport()) throw new Error('This browser cannot receive push notifications')
    const { enabled, publicKey } = await httpService.get('push/config')
    if (!enabled || !publicKey) throw new Error('Push notifications are not configured on the server')

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Notifications were not allowed')

    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
    await httpService.post('push/subscriptions', { subscription: sub.toJSON() })
    return sub
}

/** Unsubscribe this browser and tell the backend to forget it. Never throws on the way out. */
export async function disablePush() {
    if (!pushSupport()) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    try { await sub.unsubscribe() } catch { /* the browser's side; the server row is what matters */ }
    try { await httpService.delete('push/subscriptions', { endpoint }) } catch { /* a dead row is dropped on the next send anyway */ }
}

/** The VAPID public key as the PushManager wants it. PURE. */
export function urlBase64ToUint8Array(base64) {
    const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
    const raw    = atob(padded)
    return Uint8Array.from(raw, ch => ch.charCodeAt(0))
}
