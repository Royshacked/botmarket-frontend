// The text scale is a CONTRAST ladder (see the header comment in _themes.scss): the tiers that
// carry supporting copy — the counts in ( ), field descriptions, placeholders, timestamps — are
// pinned to a ratio against their OWN theme's --bg-surface, not picked by eye.
//
// They were picked by eye once, and drifted to 3.3:1 (muted) and 1.9:1 (dim) on the active theme,
// which is under WCAG AA and, at 9-11px, unreadable. This test is the floor that keeps a future
// palette tweak from putting them back there: it parses the real stylesheet, so it fails on the
// edit itself rather than on someone noticing months later.
//
// Node's built-in harness:  node --test src/assets/styles/setup/
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('./_themes.scss', import.meta.url)), 'utf8')

// AA (4.5:1) is the target for the two lowest tiers; --text-dim sits just under it by design —
// it is the quietest tier in the app and never the only carrier of information — so its floor is
// set at the ratio it now holds rather than at AA.
const FLOORS = { '--text-secondary': 7.0, '--text-muted': 5.2, '--text-dim': 4.0 }
// axl-light is measured by exactly the same rules — a light theme is where an eyeballed text
// ladder collapses fastest (pale grey on white passes nothing), so it is the theme that most
// needs the floor.
const THEMES = ['ocean', 'forest', 'crimson', 'axl', 'axl-light']

function tokensFor(theme) {
    // Each theme is one selector block; `ocean` shares its block with the leading `:root`.
    const head = theme === 'ocean' ? ':root,\\s*\\[data-theme="ocean"\\]' : `\\[data-theme="${theme}"\\]`
    const block = css.match(new RegExp(`${head}\\s*\\{([\\s\\S]*?)\\n\\}`))
    assert.ok(block, `no block found for theme "${theme}"`)
    return Object.fromEntries(
        [...block[1].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(m => [m[1], m[2]]),
    )
}

function luminance(hex) {
    const channels = [1, 3, 5]
        .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(fg, bg) {
    const a = luminance(fg), b = luminance(bg)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

for (const theme of THEMES) {
    test(`${theme} keeps every text tier above its contrast floor`, () => {
        const tokens = tokensFor(theme)
        const bg = tokens['--bg-surface']
        assert.ok(bg, `${theme} defines no --bg-surface`)

        for (const [token, floor] of Object.entries(FLOORS)) {
            const fg = tokens[token]
            assert.ok(fg, `${theme} defines no ${token}`)
            const ratio = contrast(fg, bg)
            assert.ok(ratio >= floor,
                `${theme} ${token} (${fg} on ${bg}) is ${ratio.toFixed(2)}:1, floor is ${floor}:1`)
        }
    })

    // The ladder only reads as a hierarchy if the tiers stay ordered — a muted that outshines
    // secondary would make every description louder than the label above it.
    test(`${theme} keeps the tiers ordered primary > secondary > muted > dim`, () => {
        const tokens = tokensFor(theme)
        const bg = tokens['--bg-surface']
        const names = ['--text-primary', '--text-secondary', '--text-muted', '--text-dim']
        const ladder = names.map(t => contrast(tokens[t], bg))
        for (let i = 1; i < ladder.length; i++) {
            assert.ok(ladder[i] < ladder[i - 1],
                `${theme}: ${names[i]} (${ladder[i].toFixed(2)}:1) is not quieter than ${names[i - 1]} (${ladder[i - 1].toFixed(2)}:1)`)
        }
    })
}
