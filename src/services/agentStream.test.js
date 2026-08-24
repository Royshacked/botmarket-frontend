import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientTimeContext } from './agentStream.js'

// clientTimeContext is the half of agentStream that can be tested without a DOM: streamAgent
// itself is a four-line delegation to postSSE (fetch), which the panel tests already exercise
// end-to-end through the mocked services.
//
// This one matters on its own because an agent authors absolute UTC instants from what the user
// said in their own clock ("enter at 16:40", "good through Friday"). Get the zone wrong and a
// scheduled trade fires on the wrong side of the world.

test('carries the browser instant and its IANA zone', () => {
    const ctx = clientTimeContext()
    assert.ok(Number.isFinite(ctx.clientNow), 'clientNow must be a real timestamp')
    assert.ok(Math.abs(Date.now() - ctx.clientNow) < 5000, 'clientNow must be NOW, not a cached value')
    // In any real browser (and in Node) Intl resolves a zone; the field must be present.
    assert.ok('clientTz' in ctx)
})

test('the zone is an IANA name, not an offset', () => {
    // The server resolves wall-clock times against this zone, so "+03:00" would lose DST rules.
    const { clientTz } = clientTimeContext()
    if (clientTz != null) assert.match(clientTz, /^[A-Za-z]+\/[A-Za-z_+-]/, `got "${clientTz}"`)
})

test('a missing zone degrades to the instant alone, so the server asks rather than guesses', () => {
    const real = globalThis.Intl
    try {
        globalThis.Intl = { DateTimeFormat: () => { throw new Error('unavailable') } }
        const ctx = clientTimeContext()
        assert.ok(Number.isFinite(ctx.clientNow))
        assert.equal(ctx.clientTz, undefined, 'no zone at all beats a wrong zone')
    } finally {
        globalThis.Intl = real
    }
})

test('an empty resolved zone becomes null rather than an empty string', () => {
    const real = globalThis.Intl
    try {
        globalThis.Intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: '' }) }) }
        assert.equal(clientTimeContext().clientTz, null)
    } finally {
        globalThis.Intl = real
    }
})
