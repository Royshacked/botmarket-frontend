// The Floor's right column: INFO (Roy, 2026-10-23) — "in the future I will put there info about what is going on in the
// app / chat / lists". A placeholder until that is decided: the column's heading, and a line saying what it is for.

export function FloorInfo() {
    return (
        <aside className="floor-info" aria-label="Info">
            {/* Same .floor-sec heading the Menu uses, so the two side columns open on one line. */}
            <header className="floor-sec">
                <h2 className="floor-sec__title">Info</h2>
            </header>
            <p className="floor-empty floor-info__note">What is going on in the app, the chat and your lists will show here.</p>
        </aside>
    )
}
