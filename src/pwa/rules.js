// The service worker's routing rules, in one place the worker AND its test both read.
//
// INSTALLABLE, NOT OFFLINE. The worker precaches the app shell so the browser offers "Install" and
// so push has somewhere to land. It must never stand between the app and its data: a trading app
// that answers from a cache is worse than one that fails. Every data path is on the navigate
// denylist and has no runtime rule.

/** Navigations that must NOT fall back to the cached index.html — they are data, not pages. */
export const NAVIGATE_DENYLIST = [/^\/api\//, /^\/ws/, /^\/socket\.io/]

/** The one runtime cache: Google Fonts, so an installed app does not open in the fallback font. */
export const FONTS_PATTERN = /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i
export const FONTS_CACHE   = { name: 'google-fonts', maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }

/**
 * The pop-out windows — an idea or a setup opened full-viewport, no header, no chat. RootCmp
 * renders them bare, and the worker must not treat one as "the app": it cannot open the chat on
 * a tap, and its being focused says nothing about whether a card was seen.
 */
export const IDEA_POPOUT     = '/idea/'
export const SETUP_POPOUT    = '/setup/'
export const POPOUT_PREFIXES = [IDEA_POPOUT, SETUP_POPOUT]
export const isPopoutPath = (pathname) => POPOUT_PREFIXES.some(p => String(pathname ?? '').startsWith(p))
