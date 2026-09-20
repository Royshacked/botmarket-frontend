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
 * Subscribe this browser. The permission is asked FIRST, straight off the click — the prompt only
 * shows inside the click's activation, and a network round-trip before it can outlive that. Then
 * the server's public key, the subscription, and the registration. Throws with a readable message
 * on each way it can fail; a subscription the server never learned of is undone, so the switch
 * never reads On for a device that gets nothing.
 */
export async function enablePush() {
    if (!pushSupport()) throw new Error('This browser cannot receive push notifications')
    // No worker → `serviceWorker.ready` would wait forever (the dev server, a failed registration).
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) throw new Error('No service worker on this page — push needs the installed build')

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Notifications were not allowed')

    const { enabled, publicKey } = await httpService.get('api/push/config')
    if (!enabled || !publicKey) throw new Error('Push notifications are not configured on the server')
    const serverKey = urlBase64ToUint8Array(publicKey)

    // An existing subscription is reused only if it was minted for THIS server key. After a key
    // rotation the old one would be sent to with the new key and refused forever (a 403 is not
    // the dead-subscription path the server prunes), so it is replaced here.
    let sub = await reg.pushManager.getSubscription()
    if (sub && !sameKey(sub.options?.applicationServerKey, serverKey)) {
        await sub.unsubscribe().catch(() => {})
        sub = null
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey })

    try {
        await httpService.post('api/push/subscriptions', { subscription: sub.toJSON() })
    } catch (err) {
        await sub.unsubscribe().catch(() => {})
        throw err
    }
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
    try { await httpService.delete('api/push/subscriptions', { endpoint }) } catch { /* a dead row is dropped on the next send anyway */ }
}

/** The VAPID public key as the PushManager wants it. PURE. */
export function urlBase64ToUint8Array(base64) {
    const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
    const raw    = atob(padded)
    return Uint8Array.from(raw, ch => ch.charCodeAt(0))
}

/** Byte equality between a subscription's stored key (an ArrayBuffer, or null) and ours. PURE. */
export function sameKey(stored, ours) {
    if (!stored) return false
    const a = new Uint8Array(stored)
    if (a.length !== ours.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== ours[i]) return false
    return true
}

/**
 * Where this page is running, for the Alerts page — the three facts a "notifications stopped
 * working" report needs: which browser, whether it is the installed app or a tab (or an in-app
 * WebView, which has its own storage and no subscription of the app's), and which origin (a
 * subscription is per origin). PURE over the globals it is handed.
 */
export function describeDevice(win = globalThis) {
    const ua      = String(win.navigator?.userAgent ?? '')
    const browser = /Instagram|FBAN|FBAV|WhatsApp|Telegram|Line\//i.test(ua) ? 'in-app browser'
        : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
        : /EdgA?\//i.test(ua)        ? 'Edge'
        : /Firefox|FxiOS/i.test(ua)  ? 'Firefox'
        : /CriOS|Chrome/i.test(ua)   ? 'Chrome'
        : /Safari/i.test(ua)         ? 'Safari'
        : 'browser'
    const standalone = Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches || win.navigator?.standalone)
    const origin     = win.location?.host ?? ''
    return { browser, standalone, origin, line: `${browser} · ${standalone ? 'installed app' : 'browser tab'} · ${origin}` }
}
