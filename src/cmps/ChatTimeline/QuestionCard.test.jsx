import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { QuestionCard } from './QuestionCard.jsx'
import { openCard, openMidCard, initialAnswers, allAnswered, accountLabel, answeredLines } from './questionCard.utils.js'
import { isOffScreen } from './timelineRows.js'

// A builder's question card (modes-and-builders.md step 4): every question at once, options + Other, the account, submit.

const QUESTIONS = [
    { id: 'name', header: 'Name', question: 'Which stock?', multiSelect: false, other: true, options: [{ label: 'NVDA' }, { label: 'Find one for me' }] },
    { id: 'account', header: 'Account', kind: 'account', question: 'Which account does it go to?', multiSelect: false, other: false, options: [] },
    { id: 'size', header: 'Size', question: 'Your size?', multiSelect: false, other: true, options: [] },
    { id: 'scenarios', header: 'Scenarios', question: 'Which scenarios?', multiSelect: false, other: false, options: [{ label: 'Both (recommended)' }, { label: 'A only' }] },
]
const card = (state = 'open', extra = {}) => ({ seq: 7, kind: 'questions', agent: 'mentor', role: 'assistant', content: 'A few questions before I build it.', ref: { state, questions: QUESTIONS, ...extra } })
const ACCOUNTS = [{ id: 'p1', broker: 'paper', name: 'Paper main', balance: 100000 }, { id: 'p2', broker: 'paper' }]

afterEach(cleanup)

describe('question card helpers', () => {
    it("the open card is the builder's last card while it is open — an answered or set-aside one is not", () => {
        expect(openCard([card()], 'mentor').seq).toBe(7)
        expect(openCard([card()], 'portfolio')).toBe(null)
        expect(openCard([card('answered')], 'mentor')).toBe(null)
        expect(openCard([card(), { ...card('set_aside'), seq: 9 }], 'mentor')).toBe(null)
    })
    it('it starts on the recommended option and the account already marked; answered when every question is', () => {
        const a = initialAnswers(QUESTIONS, { marked: ['p2'], main: 'p2', accounts: ACCOUNTS })
        expect(a).toEqual({ account: { accountIds: ['p2'] }, scenarios: { choice: 'Both (recommended)' } })
        expect(allAnswered(QUESTIONS, a)).toBe(false)
        expect(allAnswered(QUESTIONS, { ...a, name: { choice: 'NVDA' }, size: { other: '1% risk' } })).toBe(true)
        expect(initialAnswers(QUESTIONS, { accounts: [ACCOUNTS[0]] }).account).toEqual({ accountIds: ['p1'] }, 'the only account is picked')
    })
    it("a hand-off's name (the card's default — Build trade off the Hotlist) starts picked", () => {
        const withDefault = [{ ...QUESTIONS[0], default: 'NVDA' }, ...QUESTIONS.slice(1)]
        expect(initialAnswers(withDefault, { accounts: ACCOUNTS }).name).toEqual({ choice: 'NVDA' })
        expect(initialAnswers([{ ...QUESTIONS[0], default: 'AMD' }]).name).toBeUndefined()
    })
    it("accounts are named as the venue picker names them; an open or set-aside card is not drawn in the thread, an answered one is", () => {
        expect(accountLabel(ACCOUNTS[0])).toBe('Paper main')
        expect(accountLabel(ACCOUNTS[1])).toBe('Paper')
        expect(accountLabel({ id: 'c', broker: 'ctrader', login: '12345' })).toBe('ctrader 12345')
        expect(isOffScreen(card())).toBe(true)
        expect(isOffScreen(card('set_aside'))).toBe(true)
        expect(isOffScreen(card('answered'))).toBe(false)
        // A build's replies are the pane's (step 5b) — until one needs the user.
        expect(isOffScreen({ role: 'assistant', agent: 'mentor', content: 'x', ref: { build: 'b1' } })).toBe(true)
        expect(isOffScreen({ role: 'assistant', agent: 'mentor', content: 'x', ref: { fromBuild: 'b1' } })).toBe(false)
        expect(answeredLines(card('answered', { answers: { name: { choice: 'NVDA' }, account: { accountLabel: 'Paper main' }, size: { other: '1% risk' }, scenarios: { choice: 'A only' } } })).map(l => `${l.header}: ${l.value}`))
            .toEqual(['Name: NVDA', 'Account: Paper main', 'Size: 1% risk', 'Scenarios: A only'])
    })
})

describe('QuestionCard', () => {
    it('answers every question, then Build it sends the answers and the picked account', async () => {
        const onSubmit = vi.fn(async () => ({ ok: true }))
        render(<QuestionCard card={card()} role="Trader" accounts={ACCOUNTS} marked={[]} onSubmit={onSubmit} />)
        const build = screen.getByText('Build it')
        expect(build.disabled).toBe(true)
        fireEvent.click(screen.getByText('NVDA'))
        fireEvent.click(screen.getByText('Paper main'))
        fireEvent.change(screen.getByLabelText('Size: other'), { target: { value: '$10,000 · 1% risk · R:R 1.5' } })
        expect(build.disabled).toBe(false)
        await act(async () => { fireEvent.click(build) })
        expect(onSubmit).toHaveBeenCalledWith({
            name: { choice: 'NVDA' },
            account: { accountIds: ['p1'], accountLabel: 'Paper main' },
            size: { choice: null, other: '$10,000 · 1% risk · R:R 1.5' },
            scenarios: { choice: 'Both (recommended)' },
        }, [ACCOUNTS[0]])
    })

    it('a refused submit says why and stays open', async () => {
        const onSubmit = vi.fn(async () => ({ ok: false, message: 'Answer every question first' }))
        render(<QuestionCard card={card()} role="Trader" accounts={[ACCOUNTS[0]]} onSubmit={onSubmit} />)
        fireEvent.change(screen.getByLabelText('Name: other'), { target: { value: 'AMD' } })
        fireEvent.change(screen.getByLabelText('Size: other'), { target: { value: '1%' } })
        await act(async () => { fireEvent.click(screen.getByText('Build it')) })
        expect(screen.getByText('Answer every question first')).toBeTruthy()
        expect(screen.getByText('Build it')).toBeTruthy()
    })

    it('a single-choice question keeps one answer: typing Other clears the option, an option clears Other', async () => {
        const onSubmit = vi.fn(async () => ({ ok: true }))
        render(<QuestionCard card={card()} role="Trader" accounts={[ACCOUNTS[0]]} onSubmit={onSubmit} />)
        fireEvent.click(screen.getByText('NVDA'))
        fireEvent.change(screen.getByLabelText('Name: other'), { target: { value: 'AMD' } })
        expect(screen.getByText('NVDA').closest('button').getAttribute('aria-checked')).toBe('false')
        fireEvent.change(screen.getByLabelText('Size: other'), { target: { value: '1%' } })
        await act(async () => { fireEvent.click(screen.getByText('Build it')) })
        expect(onSubmit.mock.calls[0][0].name).toEqual({ choice: null, other: 'AMD' })
        fireEvent.click(screen.getByText('NVDA'))
        expect(screen.getByLabelText('Name: other').value).toBe('')
    })

    it("a build's question card (step 8): shown whatever the mode, its options and Other, sent with Send", async () => {
        const mid = { seq: 12, kind: 'questions', agent: 'mentor', role: 'assistant', content: 'AMD trade — a question before it goes on.',
            ref: { state: 'open', mid: true, buildId: 'b1', questions: [{ id: 'answer', header: 'Answer', question: 'Which stop?', multiSelect: false, other: true, options: [{ label: '$393' }, { label: '$402' }] }] } }
        expect(openMidCard([mid])).toBe(mid)
        expect(openCard([mid], 'axl')).toBe(null)
        expect(openMidCard([{ ...mid, ref: { ...mid.ref, state: 'answered' } }])).toBe(null)
        const onSubmit = vi.fn(async () => ({ ok: true }))
        render(<QuestionCard card={mid} role="Trader" accounts={[]} onSubmit={onSubmit} />)
        fireEvent.click(screen.getByText('$402'))
        await act(async () => { fireEvent.click(screen.getByText('Send')) })
        expect(onSubmit).toHaveBeenCalledWith({ answer: { choice: '$402' } }, [])
    })

    // Roy, 2026-11-24, on mobile: no way out of the analyst's questions back to Axl.
    it('Not now and the × close the card unanswered; a failure says so; no handler, no buttons', async () => {
        const onSubmit = vi.fn()
        const onDismiss = vi.fn(async () => ({ ok: true }))
        render(<QuestionCard card={card()} role="Trader" accounts={ACCOUNTS} onSubmit={onSubmit} onDismiss={onDismiss} />)
        await act(async () => { fireEvent.click(screen.getByText('Not now')) })
        expect(onDismiss).toHaveBeenCalledTimes(1)
        expect(onSubmit).not.toHaveBeenCalled()
        cleanup()
        const failing = vi.fn(async () => ({ ok: false, message: 'That card is no longer the open one' }))
        render(<QuestionCard card={card()} role="Trader" accounts={ACCOUNTS} onSubmit={onSubmit} onDismiss={failing} />)
        await act(async () => { fireEvent.click(screen.getByLabelText('Not now — close the questions')) })
        expect(screen.getByText('That card is no longer the open one')).toBeTruthy()
        cleanup()
        render(<QuestionCard card={card()} role="Trader" accounts={ACCOUNTS} onSubmit={onSubmit} />)
        expect(screen.queryByText('Not now')).toBe(null)
    })

    it('a workspace with no accounts says so', () => {
        render(<QuestionCard card={card()} role="Trader" accounts={[]} onSubmit={vi.fn()} />)
        expect(screen.getByText(/No accounts in this workspace/)).toBeTruthy()
    })
})

// THE ANALYST'S CARD (Roy, 2026-11-21): a name; "update it?" only for a name the house covers; nothing left behind.
describe("the analyst's card", () => {
    const ANALYST = [
        { id: 'name', header: 'Company', question: 'Which company?', multiSelect: false, other: true, options: [] },
        { id: 'update', header: 'Update', question: 'We cover it already — update the coverage?', multiSelect: false, other: false,
            when: { id: 'name', in: ['TSLA'] }, options: [{ label: 'Update it' }, { label: 'Leave it as is' }] },
    ]
    const acard = { seq: 9, kind: 'questions', agent: 'analyst', role: 'assistant', content: 'A few questions before I build it.', ref: { state: 'open', questions: ANALYST } }

    it('"update it?" shows only once a covered name is typed — and only what is shown is sent', async () => {
        const onSubmit = vi.fn(async () => ({ ok: true }))
        render(<QuestionCard card={acard} role="Analyst" accounts={[]} onSubmit={onSubmit} />)
        expect(screen.queryByText(/update the coverage/)).toBe(null)
        const box = screen.getByLabelText('Company: other')
        expect(box.getAttribute('placeholder')).toBe('Type a ticker')
        fireEvent.change(box, { target: { value: 'tsla' } })
        expect(screen.getByText(/update the coverage/)).toBeTruthy()
        expect(screen.getByText('Build it').disabled).toBe(true, 'the update question is unanswered')
        fireEvent.click(screen.getByText('Update it'))
        expect(screen.getByText('Build it').disabled).toBe(false)
        fireEvent.change(box, { target: { value: 'AMD' } })
        expect(screen.queryByText(/update the coverage/)).toBe(null, 'a name not covered: no update question')
        await act(async () => { fireEvent.click(screen.getByText('Build it')) })
        expect(onSubmit.mock.calls[0][0]).toEqual({ name: { choice: null, other: 'AMD' } })
    })

    it('an answered card the server hid leaves nothing in the chat', () => {
        expect(isOffScreen({ ...acard, ref: { ...acard.ref, state: 'answered', hidden: true } })).toBe(true)
        expect(isOffScreen({ ...card('answered') })).toBe(false, "the trader's answered card still shows")
    })
})
