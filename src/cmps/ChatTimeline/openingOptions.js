// What an empty chat offers (unified-chat plan phase 7, J5) — a STATIC opening, never a model turn.
//
// Axl asks what the user wants to do; each tap is sent AS THE USER'S OWN MESSAGE to Axl, who routes on it
// (decision 10 — the desk buttons are gone, Axl asks). Written in the user's voice for that reason.
export const OPENING_OPTIONS = Object.freeze([
    'Trade it',
    'Build a portfolio',
    'Find ideas',
    'Research a company',
    'Ask about the app',
])

// The app questions a first-time user does not know to ask (lifted from the old hub): they sit under the
// input, the one place on this screen where a chip answers nothing.
export const LANDING_ASKS = Object.freeze([
    'What can this app do?',
    'How does it work?',
    'What can you do for me?',
])

export const OPENING_QUESTION = 'What would you like to do?'
