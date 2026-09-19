// Left nav — one tab open at a time, addressed by URL hash (`/profile#brokers`) so a flow can
// land on a section (the broker OAuth return does) and the back button restores the last one.
// Two groups: what the user tunes about the app, and the venues their work lands on.
export const NAV = [
    { label: 'Preferences', tabs: [
        { id: 'account',    label: 'Account'    },
        { id: 'appearance', label: 'Appearance' },
        { id: 'ai',         label: 'AI'         },
        { id: 'usage',      label: 'Usage'      },
        { id: 'alerts',     label: 'Alerts'     },
    ]},
    { label: 'Trading venues', tabs: [
        { id: 'brokers', label: 'Brokers' },
        { id: 'paper',   label: 'Paper'   },
        { id: 'manual',  label: 'Manual'  },
    ]},
]
const TAB_IDS     = new Set(NAV.flatMap(g => g.tabs.map(t => t.id)))
const DEFAULT_TAB = 'account'

// Which venue tab the active workspace lives in — the nav dot and the section's Active badge.
export const VENUE_OF_WORKSPACE = { live: 'brokers', paper: 'paper', manual: 'manual' }

/** `#brokers` → 'brokers'; anything unknown (or no hash) opens the default tab. */
export function tabFromHash(hash) {
    const id = String(hash ?? '').replace(/^#/, '')
    return TAB_IDS.has(id) ? id : DEFAULT_TAB
}
