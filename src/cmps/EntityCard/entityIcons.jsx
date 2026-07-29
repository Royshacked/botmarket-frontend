// The card icon set — one home for the monoline SVGs every entity card draws.
//
// These lived in TradeIdeaCards.jsx and were imported from there by CallCard and PopoutFooter,
// which made the ideas card file a de-facto icon library. They are chrome, not idea-specific, so
// they live with the shared shell.

export function EditIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M11.5 1.5L14.5 4.5L5.5 13.5H2.5V10.5L11.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M9.5 3.5L12.5 6.5" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
    )
}

export function BinIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2.5 4H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M6.5 4V2.8C6.5 2.36 6.86 2 7.3 2H8.7C9.14 2 9.5 2.36 9.5 2.8V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M3.7 4L4.3 13C4.34 13.56 4.8 14 5.36 14H10.64C11.2 14 11.66 13.56 11.7 13L12.3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6.5 6.5V11.5M9.5 6.5V11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
    )
}

/** Hammer — the entity is still taking shape in chat (not yet saved). */
export function BuildingIcon({ className = 'idea-card__building-bot' }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/>
            <path d="m18 15 4-4"/>
            <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586z"/>
        </svg>
    )
}

export function TargetIcon() {
    return (
        <svg className="idea-card__target" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="8" cy="8" r="6"/>
            <circle cx="8" cy="8" r="2.4"/>
        </svg>
    )
}

export function PositionIcon() {
    // Live-position mark — a price pulse line.
    return (
        <svg className="idea-card__icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M3 13h3l2.5-6 3.5 12 2.5-9 2 3h4.5"/>
        </svg>
    )
}

export function OrdersIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="3.5" cy="4"  r="1" fill="currentColor"/>
            <circle cx="3.5" cy="8"  r="1" fill="currentColor"/>
            <circle cx="3.5" cy="12" r="1" fill="currentColor"/>
            <path d="M6.5 4H13.5M6.5 8H13.5M6.5 12H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
    )
}

export function CloseIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
    )
}
