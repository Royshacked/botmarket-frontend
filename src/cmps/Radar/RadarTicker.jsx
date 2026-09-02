import PropTypes from 'prop-types'
import './RadarTicker.scss'

// Shared clickable ticker used across every Axl Radar list (earnings, IPO, scans).
// Renders the company logo (or a letter-tile fallback) + symbol + name, and a
// hover hint, then hands off to the idea chat via `onSelect`. Keeping this in one
// place means the logo/name/hover treatment can't drift between the lists.
export function RadarTicker({ symbol, name, logo, onSelect, disabled = false, hint = 'Build idea →', title }) {
    const usable = !disabled && !!symbol
    return (
        <button
            className="radar-ticker"
            onClick={() => usable && onSelect?.()}
            disabled={!usable}
            title={title}
        >
            {logo
                ? <img
                    className="radar-ticker__logo"
                    src={logo}
                    alt=""
                    loading="lazy"
                    // Some logo URLs 404 / block hotlinking — hide the broken image
                    // rather than showing a torn icon.
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                : <span className="radar-ticker__logo radar-ticker__logo--fallback">{(symbol || '?')[0]}</span>
            }
            <span className="radar-ticker__text">
                <span className="radar-ticker__sym">{symbol || '—'}</span>
                {name && <span className="radar-ticker__name">{name}</span>}
            </span>
            {hint && usable && <span className="radar-ticker__hint">{hint}</span>}
        </button>
    )
}

RadarTicker.propTypes = {
    symbol:   PropTypes.string,
    name:     PropTypes.string,
    logo:     PropTypes.string,
    onSelect: PropTypes.func,
    disabled: PropTypes.bool,
    hint:     PropTypes.string,
    title:    PropTypes.string,
}
