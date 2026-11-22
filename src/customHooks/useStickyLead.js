// THE HOTLIST'S STICKY PARTS (Roy, 2026-11-22: "the bar where we choose the list should be sticked to top" and, on a
// phone, "sweep the screen sideways and stick the symbol column to the left"). CSS does the sticking; two lengths it
// cannot know are measured here and set as custom properties:
//   --hot-bar-h   on the scroll box (the panel's body): the list bar's height, so a table's sticky header sits UNDER the
//                 bar instead of behind it (the bar wraps to two lines on a narrow column).
//   --hot-lead-w  on each list table whose first column is the details / pick cell: that column's width, so the symbol
//                 column pins right after it (the cell's width follows its content — "›" alone, or "› ★3").
// Re-measured on any change under `root` and on a resize of the scroll box; one measure per frame.

import { useEffect } from 'react'

const BAR = '.hot-horizons'
const TABLES = 'table.hot-table--list'
const LEAD = 'tr > .hot-table__star:first-child'

/** Measure once: the bar's height onto `scroller`, each table's lead column onto the table. Exported for tests. */
export function measureStickyLead(root, scroller) {
    const bar = root.querySelector(BAR)
    scroller?.style.setProperty('--hot-bar-h', `${bar ? bar.getBoundingClientRect().height : 0}px`)
    for (const t of root.querySelectorAll(TABLES)) {
        const lead = t.querySelector(LEAD)
        if (lead) t.style.setProperty('--hot-lead-w', `${lead.getBoundingClientRect().width}px`)
        else t.style.removeProperty('--hot-lead-w')
    }
}

/**
 * `root` — an element inside the panel's body (it may be `display: contents`), from a CALLBACK ref held in state: the
 * panel's content mounts after the panel does (it opens later), and an object ref read once at mount was still null.
 */
export function useStickyLead(root) {
    useEffect(() => {
        if (!root || typeof window === 'undefined') return undefined
        let frame = 0
        let scroller = null
        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null
        // The scroll box is looked up at each measure: the panel's content can be re-hosted (DetailPanel's one tree).
        const measure = () => {
            frame = 0
            const box = root.closest('.detail-panel__body') ?? root.parentElement
            if (box !== scroller) { if (scroller) ro?.unobserve(scroller); scroller = box; if (box) ro?.observe(box) }
            measureStickyLead(root, scroller)
        }
        const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
        // Attribute changes are not watched: the properties this sets are attributes, and would loop.
        const mo = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null
        mo?.observe(root, { childList: true, subtree: true, characterData: true })
        window.addEventListener('resize', schedule)
        schedule()
        return () => {
            mo?.disconnect(); ro?.disconnect()
            window.removeEventListener('resize', schedule)
            if (frame) window.cancelAnimationFrame(frame)
        }
    }, [root])
}
