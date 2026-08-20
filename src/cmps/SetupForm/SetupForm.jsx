import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { mentorService } from '../../services/mentor/mentor.service.remote.js'
import { SetupSummary } from '../MentorPanel/SetupSummary.jsx'
import { relativeAge } from './relativeAge.js'
import './SetupForm.scss'

// THE EXPRESS SETUP FORM — for the user who is not here for the conversation.
//
// The trade desk's default move is a build: the user brings a name, Mentor brings the analysis, and
// the plan takes shape a turn at a time. This is the other case. Someone who already has the whole
// setup written down — entry, stop, targets, the rule they trade it by — does not want it drawn out
// of them a question at a time. Talking them through a plan they have already made is the desk
// wasting their time politely.
//
// DELIBERATELY NOT A MENTOR COMPONENT. It lives outside MentorPanel and knows nothing about it:
// three callers need this surface and only one of them is a build conversation —
//
//   • the panel's own "I have the exact setup" button (no blueprint → a blank worksheet),
//   • any desk, via the `open_setup_form` tool (a nucleus pre-filled, the rest left to the user),
//   • a setup shared by another person, opened from its card (their plan, your size).
//
// What it renders is NOT a second worksheet. The body is `SetupSummary` in `authoring` mode, which
// is the same ScenarioBlock / ZoneEditor / ConditionList the build conversation draws — because a
// setup typed here and a setup argued into being have to be the same artifact, and two editors for
// one shape is how they stop being.
//
// ── PRICES IN, ZONES OUT ─────────────────────────────────────────────────────
// The form asks for PRICES, not bands — "entry 199, stop 196.5, target 210" is what someone with a
// plan already made actually has. Band width is ATR-and-structure judgment, and Mentor's prompt
// already specifies it (a breakout zone is a window opening at the trigger; a TP window is its
// mirror; breadth ~0.5-1 ATR). Asking the user to invent two edges asks them to do the desk's work.
//
// So the primary action HANDS THE PLAN TO MENTOR, which draws the bands and names the lens, and
// Generate happens afterwards against the worksheet — the user still sees what Mentor made of their
// numbers before anything is saved. Each price rides as a zero-width band, which is a legal zone in
// its own right, so a plan that never reaches Mentor is still monitorable.
//
// A SHARED setup skips all of this while it is LOCKED: it arrives with bands already drawn by the
// sender's Mentor, so those are read-only facts and the recipient only sizes it. Unlock it to edit
// and the user is the author again — so it reverts to prices and goes back to Mentor to be redrawn.
// THE USER NEVER CHOOSES A ZONE on any path; the only question is whose Mentor drew the one on
// screen. That is why `pricesOnly` is derived from the effective lock rather than tracked apart
// from it.
//
// ── The one thing this surface owns ──────────────────────────────────────────
// READINESS, LIVE. In a conversation `readiness` arrives with every reply, so it is never more than
// one turn stale. A form has no turns: a user who typed their whole plan in would face a dark
// Generate button whose last information predated the first number they entered. So edits are
// debounced back to `POST /api/setups/validate` — the SAME `setupReadiness` the agent, the button
// and the save path use. A client-side copy of that gate was the other option and is the one the
// gate's own header argues against.

/** How long the form waits after a keystroke before asking the server what is still missing. */
const VALIDATE_DEBOUNCE_MS = 400

/**
 * @param {?object} blueprint  the plan to open on; null/absent opens the blank worksheet
 * @param {?object} draft      an ALREADY-NORMALISED setup to open on instead — the user's own live
 *                             worksheet. Wins over `blueprint`, and takes the validate path rather
 *                             than the hydrate one, which is the whole reason it exists: hydrating
 *                             strips quantities (that is what makes a blueprint portable), and a
 *                             user who asks for the form mid-build must not watch the sizes already
 *                             on their screen disappear as it opens.
 * @param {string[]} locked    fields the user may look at but not change. `['plan']` is the shared
 *                             case: everything frozen except the sizes (see SetupSummary).
 * @param {?string} note       one line above the form — who sent it, or what the desk left to fill
 * @param {?number} drawnAt    when the plan was drawn, for the age line. Prices go stale.
 */
export function SetupForm({
    blueprint = null, draft = null, locked = [], note = null, drawnAt = null, from = null,
    accounts = [], busy = false, onGenerate, onHandoff, onCancel, generateLabel = 'Generate setup',
    handoffLabel = 'Continue', leaving = false,
}) {
    const [setup,     setSetup]     = useState(null)
    const [readiness, setReadiness] = useState(null)
    const [problems,  setProblems]  = useState([])
    const [loadErr,   setLoadErr]   = useState(null)
    // The server's own vocabularies for the dropdowns, and the rung window it derives from the
    // timeframe. Held BESIDE the draft rather than inside it: both are the server's answers, and
    // merging them into `setup` would mean adopting a normalised copy on every validate — which is
    // exactly what must not happen while someone is typing into it.
    const [vocab,     setVocab]     = useState(null)
    const [ladder,    setLadder]    = useState(null)
    // Unlocking is a decision, not a default. A shared plan opens as it was sent.
    const [unlocked,  setUnlocked]  = useState(false)
    // EVERY timeframe the user reads this off. The document holds exactly ONE (it is what the
    // monitor's rung window is centred on), so the extras cannot live in the draft — they ride the
    // hand-off instead and Mentor decides which is primary. Kept here rather than in `setup` for
    // that reason: it is a fact about how they trade, not yet a field of the artifact.
    const [timeframes, setTimeframes] = useState([])

    const effectiveLocked = unlocked ? [] : locked
    const isLocked        = effectiveLocked.length > 0
    // THE USER NEVER CHOOSES ZONES. Anywhere they can change a level, they change a PRICE — a band
    // is ATR-and-structure judgment and it is Mentor's to make.
    //
    // Derived from the EFFECTIVE lock, not the `locked` prop, and that distinction is the whole
    // point: a shared plan opens locked, showing the sender's bands as the read-only facts they are,
    // but pressing "Edit it anyway" makes the user the author again — and an author edits prices.
    // Reading the raw prop here left exactly one door into band editing, through the unlock.
    const pricesOnly      = !isLocked
    // Which also means unlocking hands the plan BACK to Mentor. It has to: once the levels have
    // moved, the sender's bands were drawn around numbers that are no longer in the plan.
    const handOff         = pricesOnly && typeof onHandoff === 'function'

    // Out-of-order responses. Validation fires from keystrokes, so a slow early request can land
    // after a fast later one and re-report gaps the user has already filled. Only the newest reply
    // is allowed to speak.
    const seqRef = useRef(0)

    // Open. Hydration runs server-side so a blueprint is read by the SAME normaliser a Mentor emit
    // goes through — and so this component never grows a second opinion about what a price is.
    useEffect(() => {
        let alive = true
        setLoadErr(null)
        // Both answers carry { setup, readiness, vocabulary } — one shape, so opening on a live
        // draft and opening on someone else's blueprint differ in which endpoint answers and in
        // nothing else here.
        const opening = draft
            ? mentorService.validateDraft(draft, accounts)
            : mentorService.hydrateBlueprint(blueprint, accounts)

        opening
            .then(res => {
                if (!alive) return
                setSetup(draft ?? res.setup)   // a live draft opens as the user left it, unsorted
                setReadiness(res.readiness ?? null)
                setProblems(res.problems ?? [])
                setVocab(res.vocabulary ?? null)
                setLadder(res.setup?.ladder ?? null)
                setTimeframes((draft ?? res.setup)?.timeframe ? [(draft ?? res.setup).timeframe] : [])
            })
            .catch(err => {
                console.error('[setup-form] open', err)
                if (alive) setLoadErr(err?.message || 'Could not open the form')
            })
        return () => { alive = false }
    }, [blueprint, draft])   // eslint-disable-line react-hooks/exhaustive-deps

    // Re-ask the gate as the plan changes. `setup` is deliberately NOT replaced with the server's
    // normalised copy: it re-sorts inverted bands and collapses points, which is correct at rest and
    // hostile under a cursor — the user would watch the number they were halfway through typing
    // rearrange itself. Generate normalises for real.
    useEffect(() => {
        if (!setup) return
        const seq   = ++seqRef.current
        const timer = setTimeout(() => {
            mentorService.validateDraft(setup, accounts)
                .then(res => {
                    if (seq !== seqRef.current) return
                    setReadiness(res.readiness ?? null)
                    // Safe to adopt where the normalised setup is not: the ladder is DERIVED from
                    // the timeframe and is not a field anyone types into, so refreshing it cannot
                    // rearrange anything under the cursor.
                    setLadder(res.setup?.ladder ?? null)
                })
                .catch(err => console.error('[setup-form] validate', err))
        }, VALIDATE_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [setup, accounts.length])   // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * The document has one `timeframe` and the user may read the plan off several. The FIRST of the
     * picked set (coarse-to-fine, as presented) goes into the draft so the ladder and cadence have
     * something real to derive from while they are still typing; Mentor settles the final choice
     * when it draws the zones, having been told the whole list.
     */
    function pickTimeframes(next) {
        setTimeframes(next)
        setSetup(prev => ({ ...prev, timeframe: next[0] ?? null }))
    }

    // The leaving class rides EVERY branch: a form dismissed while it is still opening would
    // otherwise vanish mid-animation, which looks like a crash rather than a close.
    const cls = `setup-form${leaving ? ' is-leaving' : ''}`

    if (loadErr) return <div className={`${cls} setup-form--error`}>Could not open the form: {loadErr}</div>
    if (!setup)  return <div className={`${cls} setup-form--loading`}>Opening the form…</div>

    // A missing account is a gap like any other rather than a separate silent reason the button is
    // dark — the same rule the build panel follows, worded the same way.
    const effective = accounts.length === 0
        ? { ...readiness, ready: false, missing: [...(readiness?.missing ?? []), 'trading account'] }
        : readiness
    const ready    = !!effective?.ready
    const missing  = effective?.missing ?? []
    const broken   = effective?.problems ?? []

    return (
        <div className={cls}>
            <header className="setup-form__head">
                <h3 className="setup-form__title">{isLocked ? 'Their setup — your size' : 'Your setup'}</h3>
                {onCancel && (
                    <button type="button" className="setup-form__close" onClick={onCancel} aria-label="Close the form">×</button>
                )}
            </header>

            {note && <p className="setup-form__note">{note}</p>}
            {from?.name && <p className="setup-form__from">Sent by {from.name}.</p>}

            {/* Prices are a snapshot of a moment. A plan drawn on Monday and opened on Friday is a
                different trade, and the only person who can judge that is the one about to take it. */}
            {drawnAt && <p className="setup-form__age">Drawn {relativeAge(drawnAt)} — check the levels are still where the plan needs them.</p>}

            {/* What the sender wrote and we could not read. Loud, because the alternative is handing
                someone a different trade under the same name (see blueprintProblems). */}
            {problems.length > 0 && (
                <ul className="setup-form__problems">
                    {problems.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
            )}

            {isLocked && (
                <p className="setup-form__locked-note">
                    Their levels and conditions, left as they were sent — fill in the quantities.
                    <button type="button" className="setup-form__unlock" onClick={() => setUnlocked(true)}>
                        Edit it anyway
                    </button>
                </p>
            )}

            <SetupSummary
                setup={setup} onChange={setSetup} authoring locked={effectiveLocked}
                ladder={ladder} vocab={vocab} pricesOnly={pricesOnly}
                timeframes={timeframes} onTimeframes={pickTimeframes}
            />

            <footer className="setup-form__foot">
                {/* TWO DIFFERENT ACTIONS, and which one shows is decided by whether the plan needs
                    zones drawing. A hand-typed plan goes to Mentor first; a shared one already has
                    its bands and goes straight to Generate. Showing both would ask the user to know
                    the difference, which is exactly what this split exists to spare them. */}
                <button
                    type="button" className="setup-form__generate"
                    onClick={() => (handOff ? onHandoff?.(setup, { timeframes }) : onGenerate?.(setup))}
                    disabled={!ready || busy}
                >
                    {busy ? (handOff ? 'Handing over…' : 'Generating…') : (handOff ? `${handoffLabel} →` : generateLabel)}
                </button>
                {!ready && (missing.length > 0 || broken.length > 0) && (
                    <span className="setup-form__missing">
                        {missing.length > 0 && <>Still needs: {missing.join(', ')}</>}
                        {broken.map((p, i) => <span className="setup-form__problem" key={i}>Doesn’t add up: {p}</span>)}
                    </span>
                )}
                {ready && handOff && (
                    <span className="setup-form__missing">
                        Mentor takes it from here — it works out the levels and fills in the rest. You review it, then Generate. Nothing is saved yet.
                    </span>
                )}
                {ready && !handOff && <span className="setup-form__missing">Generates as <em>waiting</em> — arm it to start monitoring.</span>}
            </footer>
        </div>
    )
}

SetupForm.propTypes = {
    blueprint:     PropTypes.object,
    // An already-normalised draft to open on instead. See the param doc — it skips hydration, and
    // therefore skips the quantity stripping that makes a blueprint portable.
    draft:         PropTypes.object,
    locked:        PropTypes.arrayOf(PropTypes.string),
    note:          PropTypes.string,
    drawnAt:       PropTypes.number,
    from:          PropTypes.shape({ name: PropTypes.string }),
    accounts:      PropTypes.array,
    busy:          PropTypes.bool,
    onGenerate:    PropTypes.func,
    // Hand the typed plan to Mentor to draw its bands. Absent → the form generates directly, which
    // is right for a plan that already carries them.
    onHandoff:     PropTypes.func,
    // What the hand-off button says. "Draw the zones" was OUR word for it — a zone is a thing this
    // app has, not a thing the user asked for — so the caller names the destination instead.
    handoffLabel:  PropTypes.string,
    // Playing its exit. The panel keeps it mounted for the length of the animation — see
    // MentorPanel's closeSetupForm.
    leaving:       PropTypes.bool,
    onCancel:      PropTypes.func,
    generateLabel: PropTypes.string,
}
