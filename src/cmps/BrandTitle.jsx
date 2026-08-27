import './BrandTitle.scss'

// Renders a title in the brand wordmark style: the first letter of each word in the
// aurora accent (like the "a" in axl), the rest near-white (like "xl"). The host
// title element provides the font/size; its colour should be the near-white base.
export function BrandTitle({ text }) {
    const words = text.split(' ')
    return (
        <>
            {words.map((w, i) => (
                <span key={i} className="brand-title__word">
                    <span className="brand-title__lead">{w.charAt(0)}</span>{w.slice(1)}
                    {i < words.length - 1 ? ' ' : ''}
                </span>
            ))}
        </>
    )
}
