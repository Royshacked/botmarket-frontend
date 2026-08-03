import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiError } from './http.service.js'

// `ajax` rethrows the RAW axios error, so the server's body is at err.response.data. Four ticket
// handlers reached for err.data.error instead — a path that never matches — so every one of them
// silently fell through to axios's own text. The user's whole report of the bug was that fallback:
// "get status code 400", when the server had answered "Nothing to update".
//
// One reader, living next to the thrower, so a caller can't spell the path wrong again.

const axiosErr = (status, data) => ({
    message: `Request failed with status code ${status}`,
    response: { status, data },
})

test('reads the server message from where axios actually puts it', () => {
    assert.equal(apiError(axiosErr(400, { error: 'Nothing to update' })), 'Nothing to update')
})

test('prefers the specific per-leg rejection over the summary line', () => {
    // A multi-account order answers with a result per leg. "paper: no live price for ZTS" tells
    // the user what to do; "All broker orders failed" does not.
    assert.equal(apiError(axiosErr(502, {
        error:   'All broker orders failed',
        results: [{ accountId: 'a1', ok: false, error: 'paper: no live price for ZTS' }],
    })), 'paper: no live price for ZTS')
})

test('skips legs that succeeded and legs with no message', () => {
    assert.equal(apiError(axiosErr(502, {
        error:   'All broker orders failed',
        results: [
            { accountId: 'a1', ok: true,  orderId: 'o1' },
            { accountId: 'a2', ok: false },
            { accountId: 'a3', ok: false, error: 'symbol not found on account' },
        ],
    })), 'symbol not found on account')
})

test('falls back to the summary when every leg is mute', () => {
    assert.equal(apiError(axiosErr(502, { error: 'All broker orders failed', results: [{ ok: false }] })), 'All broker orders failed')
})

test('falls back to the caller’s own wording when there is no response at all', () => {
    // A network failure never reached the server, so only the caller knows what was being tried.
    assert.equal(apiError({}, 'Could not place the order'), 'Could not place the order')
    assert.equal(apiError(undefined, 'Could not place the order'), 'Could not place the order')
})

test('uses axios’s text only when the server said nothing usable', () => {
    assert.equal(apiError(axiosErr(500, {}), 'fallback'), 'Request failed with status code 500')
    assert.equal(apiError(axiosErr(500, undefined), 'fallback'), 'Request failed with status code 500')
})

test('is not fooled by a non-array results field', () => {
    assert.equal(apiError(axiosErr(502, { error: 'nope', results: 'oops' })), 'nope')
})
