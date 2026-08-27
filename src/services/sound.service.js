// Lightweight notification sound via the Web Audio API — no bundled asset.
// A short, soft two-note chime played on incoming social-chat messages.
//
// Best-effort by design: browsers suspend the AudioContext until a user
// gesture, and playback can fail for reasons we never want to surface. Every
// path is wrapped so a missing/blocked audio device can't break message
// handling.

let ctx = null

// ── Mute preference (persisted) ────────────────────────────────────────────
// Off by default; toggled from Preferences. Mutes the sound only — the preview
// toast still shows.
const MUTE_KEY = 'chatSoundMuted'

export function isChatSoundMuted() {
    try { return localStorage.getItem(MUTE_KEY) === 'true' }
    catch { return false }
}

export function setChatSoundMuted(muted) {
    try { localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false') }
    catch { /* ignore — persistence is best-effort */ }
}

function getCtx() {
    if (typeof window === 'undefined') return null
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    if (!ctx) ctx = new AC()
    return ctx
}

export function playNotify() {
    try {
        if (isChatSoundMuted()) return
        const ac = getCtx()
        if (!ac) return
        // By the time a message arrives the user has interacted with the app
        // (sign-in, clicks), so a suspended context resumes cleanly.
        if (ac.state === 'suspended') ac.resume()

        const now   = ac.currentTime
        const notes = [{ f: 660, t: 0 }, { f: 988, t: 0.12 }]
        for (const { f, t } of notes) {
            const osc  = ac.createOscillator()
            const gain = ac.createGain()
            osc.type            = 'sine'
            osc.frequency.value = f
            const start = now + t
            // Quick attack, gentle decay — a chime, not a buzz.
            gain.gain.setValueAtTime(0.0001, start)
            gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
            osc.connect(gain).connect(ac.destination)
            osc.start(start)
            osc.stop(start + 0.2)
        }
    } catch { /* audio is best-effort — never let it break message handling */ }
}
