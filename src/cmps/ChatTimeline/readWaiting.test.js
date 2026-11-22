import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readWaitingLines, behindLines, STALE_MS } from './readWaiting.js'
import { sessionReducer, emptySession } from '../../services/session/sessionReducer.js'

const NOW = Date.parse('2026-11-14T10:00:00Z')

describe('the reads the chat is waiting on (Roy, 2026-11-14)', () => {
    it('background work that says itself — the event analyst mapping (modes-and-builders.md step 2) — in its own words, stale ones dropped', () => {
        // Said UNDER the prompt box since 2026-11-22 (Roy: "the echo pulsing building was in chat box") — never in the thread.
        const waiting = {
            'echo|ev_1': { kind: 'echo_map', text: 'The event analyst is mapping "Anthropic IPO" through the supply chain.', label: '"Anthropic IPO"', since: NOW - 30_000 },
            'echo|ev_0': { kind: 'echo_map', text: 'old', since: NOW - STALE_MS - 1 },
            'NVDA|coverage': { symbol: 'NVDA', kind: 'coverage', since: NOW },
        }
        assert.deepEqual(behindLines(waiting, NOW), [{ key: 'echo|ev_1', text: 'Event analyst · mapping "Anthropic IPO"', title: 'The event analyst is mapping "Anthropic IPO" through the supply chain.' }])
        assert.deepEqual(readWaitingLines(waiting, NOW).map(l => l.key), ['NVDA|coverage'], 'the thread keeps only the reads')
        assert.equal(behindLines({ x: { text: 'Working on it.', since: NOW } }, NOW)[0].text, 'Working on it.', 'no label: its own words')
    })

    it('says each read by role — the name, the horizon, where it stands in line, when it was asked — oldest first', () => {
        const lines = readWaitingLines({
            'AMD|catalyst': { symbol: 'AMD', horizon: 'short term swing', kind: 'catalyst', ahead: 0, running: true, since: NOW - 60_000 },
            'NVDA|coverage': { symbol: 'NVDA', horizon: 'swing', kind: 'coverage', ahead: 3, running: true, since: NOW - 120_000 },
            'TSLA|coverage': { symbol: 'TSLA', horizon: null, kind: 'coverage', ahead: 1, since: NOW - 30_000 },
        }, NOW)
        assert.deepEqual(lines.map(l => l.key), ['NVDA|coverage', 'AMD|catalyst', 'TSLA|coverage'])
        assert.match(lines[0].text, /^The analyst is reading NVDA for the swing trade \(the business\) — 3 names ahead in line · asked .+\. The build carries on when it lands\.$/)
        assert.match(lines[1].text, /AMD for the short term swing trade \(its catalyst\) — reading it now/)
        assert.match(lines[2].text, /^The analyst is reading TSLA \(the business\) — 1 name ahead in line/)
        assert.ok(lines.every(l => !/Prometheus|Mentor|Proteus/.test(l.text)))
    })

    it('a line older than the stale limit, or with no name, is not drawn; nothing waiting draws nothing', () => {
        assert.deepEqual(readWaitingLines({ a: { symbol: 'X', since: NOW - STALE_MS - 1 }, b: { since: NOW } }, NOW), [])
        assert.deepEqual(readWaitingLines(undefined, NOW), [])
        assert.match(readWaitingLines({ c: { symbol: 'X', ahead: 0 } }, NOW)[0].text, /— next in line\. The build/)
        assert.match(readWaitingLines({ c: { symbol: 'X', ahead: null } }, NOW)[0].text, /— in line\. The build/, 'an unknown place is not "next"')
    })

    it('the reducer keeps the map from a load, a replay and a state patch — and a patch replaces it whole', () => {
        let s = sessionReducer(emptySession, { type: 'load', session: { sessionId: 's1', waiting: { k: { symbol: 'NVDA' } } } })
        assert.deepEqual(s.waiting, { k: { symbol: 'NVDA' } })
        s = sessionReducer(s, { type: 'session_state', data: { sessionId: 's1', waiting: {} } })
        assert.deepEqual(s.waiting, {})
        s = sessionReducer(s, { type: 'session_replay', data: { sessionId: 's1', messages: [], waiting: { j: { symbol: 'AMD' } } } })
        assert.deepEqual(s.waiting, { j: { symbol: 'AMD' } })
        s = sessionReducer(s, { type: 'session_state', data: { sessionId: 's1', floor: 'mentor' } })
        assert.deepEqual(s.waiting, { j: { symbol: 'AMD' } }, 'a patch without it leaves it')
    })
})
