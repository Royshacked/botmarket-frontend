/* eslint-env serviceworker */
// The service worker. Built by vite-plugin-pwa (injectManifest): `self.__WB_MANIFEST` is replaced
// at build time with the list of shell files to precache. Everything else here is explicit.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { NAVIGATE_DENYLIST, FONTS_PATTERN, FONTS_CACHE, isPopoutPath } from './pwa/rules.js'

// ── app shell ─────────────────────────────────────────────────────────────────
// autoUpdate semantics: a new deploy's worker takes over on the next load, no prompt. The app has
// no unsaved local state a refresh could lose — a desk's draft lives on the server.
self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: NAVIGATE_DENYLIST }))
registerRoute(FONTS_PATTERN, new CacheFirst({
    cacheName: FONTS_CACHE.name,
    plugins:   [new ExpirationPlugin({ maxEntries: FONTS_CACHE.maxEntries, maxAgeSeconds: FONTS_CACHE.maxAgeSeconds })],
}))

// ── push ──────────────────────────────────────────────────────────────────────
// The payload is the notification, built server-side from the chat message (services/push.service):
// { title, body, url, icon, tag, data }. The desk wrote the copy; this only shows it.
//
// PRESENCE IS DECIDED HERE, NOT ON THE SERVER. The server sends to every device, always — a socket
// count says nothing about where the human is. THIS device knows: if the app is focused in a
// window right now, the card just slid into social chat in front of the user and a notification
// on top would be noise. Any other state — tab in the background, window minimised, screen off,
// browser closed — shows it.
//
// "A window" means the app proper. A pop-out (an idea or a setup, full-viewport, no chat) has
// nowhere to show a card and nowhere to open one, so it counts for neither check.
async function appWindows() {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    return wins.filter(w => !isPopoutPath(new URL(w.url).pathname))
}

self.addEventListener('push', (event) => {
    let n = null
    try { n = event.data?.json() ?? null } catch { n = null }
    if (!n?.title) return
    event.waitUntil((async () => {
        const wins = await appWindows()
        if (wins.some(w => w.focused)) return
        await self.registration.showNotification(n.title, {
            body:  n.body ?? '',
            icon:  n.icon ?? '/img/pwa-192.png',
            badge: n.icon ?? '/img/pwa-192.png',
            tag:   n.tag ?? undefined,     // a fresher notification about the same subject replaces the stale one
            renotify: Boolean(n.tag),
            data:  { url: n.url ?? '/', ...(n.data ?? {}) },
        })
    })())
})

// A tap opens the app on the message. An open window is told over postMessage and opens the chat
// in place (useChatWs listens) — a live desk must not be reloaded under the user for a chat
// panel. No window: open one on the url, whose `?chat=&msg=` the same hook reads on load. Either
// way it is the landing the in-app preview toast gives.
self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const data = event.notification.data ?? {}
    const url  = new URL(data.url ?? '/', self.location.origin).href
    event.waitUntil((async () => {
        const wins = await appWindows()
        const win  = wins.find(w => w.focused) ?? wins[0] ?? null
        if (win) {
            await win.focus()
            win.postMessage({ type: 'open-chat', conversationId: data.conversationId ?? null, messageId: data.messageId ?? null })
            return
        }
        await self.clients.openWindow(url)
    })())
})

// The browser rotated (or dropped and re-minted) this device's subscription — the push service
// does that on its own schedule. Re-subscribe with the same key and tell the server, or the
// device goes silent with the switch still reading On. Session cookie rides along.
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        const opts = event.oldSubscription?.options
        if (!opts?.applicationServerKey) return
        const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: opts.applicationServerKey })
        await fetch('/api/push/subscriptions', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub.toJSON() }),
        })
    })())
})
