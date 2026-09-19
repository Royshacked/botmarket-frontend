// The pure edges of the device-side push service. The browser calls themselves (permission,
// subscribe) are the platform's; what is ours is the key encoding and the capability read.
// Node's built-in harness:  node --test src/services/push.service.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { urlBase64ToUint8Array, pushSupport, sameKey } from './push.service.js'

test('a VAPID public key round-trips from url-safe base64 to the bytes PushManager wants', () => {
    // 'BAECAwQF' is bytes 04 01 02 03 04 05 in standard base64; url-safe variants use - and _ and drop padding.
    assert.deepEqual([...urlBase64ToUint8Array('BAECAwQF')], [4, 1, 2, 3, 4, 5])
    assert.deepEqual([...urlBase64ToUint8Array('-_8')], [251, 255])          // unpadded, url-safe alphabet
    assert.deepEqual([...urlBase64ToUint8Array('+/8=')], [251, 255])         // standard alphabet still accepted
})

test('support needs all three: a worker, a push manager, and notifications', () => {
    const full = { navigator: { serviceWorker: {} }, PushManager: function () {}, Notification: function () {} }
    assert.equal(pushSupport(full), true)
    assert.equal(pushSupport({ ...full, navigator: {} }), false)
    assert.equal(pushSupport({ ...full, PushManager: undefined }), false)
    assert.equal(pushSupport({ ...full, Notification: undefined }), false)
    assert.equal(pushSupport({}), false)
})

test('a subscription minted for another server key is not ours', () => {
    const ours = urlBase64ToUint8Array('BAECAwQF')
    assert.equal(sameKey(Uint8Array.from([4, 1, 2, 3, 4, 5]).buffer, ours), true)
    assert.equal(sameKey(Uint8Array.from([4, 1, 2, 3, 4, 6]).buffer, ours), false)
    assert.equal(sameKey(Uint8Array.from([4, 1, 2]).buffer, ours), false)
    assert.equal(sameKey(null, ours), false)   // an old subscription with no recorded key → replace it
})
