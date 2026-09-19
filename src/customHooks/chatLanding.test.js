// Node's built-in harness:  node --test src/customHooks/chatLanding.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readChatLanding } from './chatLanding.js'

test('a notification landing names the conversation and the message, and leaves nothing behind', () => {
    assert.deepEqual(readChatLanding('?chat=c1&msg=m1'), { convId: 'c1', msgId: 'm1', search: '' })
})

test('the message is optional; other params survive the strip', () => {
    assert.deepEqual(readChatLanding('?x=1&chat=c1&y=2'), { convId: 'c1', msgId: null, search: '?x=1&y=2' })
})

test('no landing → null, so a plain open does nothing', () => {
    assert.equal(readChatLanding(''), null)
    assert.equal(readChatLanding('?msg=m1'), null)
    assert.equal(readChatLanding('?broker=connected'), null)
    assert.equal(readChatLanding(undefined), null)
})
