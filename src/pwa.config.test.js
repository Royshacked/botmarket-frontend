// Guards on the PWA config, not on the browser: the manifest points at icon files that exist, the
// install colour is the app's real background, and — the one that matters — the service worker
// never stands between the app and its data.
// Node's built-in harness:  node --test src/pwa.config.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PWA } from '../vite.config.js'
import { NAVIGATE_DENYLIST, FONTS_PATTERN } from './pwa/rules.js'

const ROOT = resolve(import.meta.dirname, '..')

test('every manifest icon is a file under public/, and the set covers install + maskable', () => {
    const icons = PWA.manifest.icons
    for (const icon of icons) {
        assert.ok(existsSync(resolve(ROOT, 'public', icon.src.replace(/^\//, ''))), `missing icon file ${icon.src}`)
    }
    // Chrome's install criteria: a 192 and a 512. Android's adaptive mask: one marked maskable.
    assert.ok(icons.some(i => i.sizes === '192x192'), 'no 192 icon')
    assert.ok(icons.some(i => i.sizes === '512x512' && !i.purpose), 'no plain 512 icon')
    assert.ok(icons.some(i => i.purpose === 'maskable'), 'no maskable icon')
})

test('the install colours are the app background, in the manifest and in index.html alike', () => {
    // --bg-base is what the app paints behind everything; the splash and the title bar of an
    // installed window must match it or the app opens with a flash of the wrong colour.
    const designs = readFileSync(resolve(ROOT, 'src/assets/styles/setup/_designs.scss'), 'utf8')
    const bgBase  = designs.match(/--bg-base:\s*(#[0-9a-fA-F]{6})/)?.[1]
    assert.ok(bgBase, '--bg-base not found in _designs.scss')
    assert.equal(PWA.manifest.theme_color,      bgBase)
    assert.equal(PWA.manifest.background_color, bgBase)

    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8')
    assert.match(html, new RegExp(`<meta name="theme-color" content="${bgBase}"`))
})

test('the worker never serves the API, the socket or the event stream from a cache', () => {
    // A trading app that answers from a cache is worse than one that fails. The navigate fallback
    // (index.html for SPA routes) must skip every data path, and the one runtime rule must not
    // reach them.
    for (const path of ['/api/trade-ideas', '/api/chat/stream', '/ws', '/ws/chat', '/socket.io/?EIO=4']) {
        assert.ok(NAVIGATE_DENYLIST.some(re => re.test(path)), `${path} would fall back to index.html`)
    }
    // …while real SPA routes still do.
    for (const path of ['/', '/setups/abc', '/portfolio']) {
        assert.ok(!NAVIGATE_DENYLIST.some(re => re.test(path)), `${path} wrongly denied`)
    }
    for (const url of ['https://example.com/api/x', '/api/x', '/ws', '/socket.io/']) {
        assert.ok(!FONTS_PATTERN.test(url), `fonts cache matches ${url}`)
    }
    assert.ok(FONTS_PATTERN.test('https://fonts.gstatic.com/s/x.woff2'))
})

test('the worker is the one in src/, and it reads these rules rather than its own copy', () => {
    assert.equal(PWA.strategies, 'injectManifest')
    assert.equal(PWA.srcDir, 'src')
    const sw = readFileSync(resolve(ROOT, PWA.srcDir, PWA.filename), 'utf8')
    assert.match(sw, /from '\.\/pwa\/rules\.js'/)
    assert.match(sw, /denylist: NAVIGATE_DENYLIST/)
    assert.match(sw, /registerRoute\(FONTS_PATTERN/)
    // Presence is decided on the device: a focused window means no notification.
    assert.match(sw, /w\.focused/)
})

test('the worker is off under the dev server', () => {
    assert.equal(PWA.devOptions.enabled, false)
})
