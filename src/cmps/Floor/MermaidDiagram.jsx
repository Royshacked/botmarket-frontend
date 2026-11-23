import { useEffect, useId, useState } from 'react'
import PropTypes from 'prop-types'

// A Mermaid diagram from its text (the situation network's trees; Roy, 2026-11-23: "Mermaid"). Mermaid is LOADED ON
// FIRST USE — it is large, and only the allow-listed board draws with it, so it stays out of everyone else's bundle.
// Its own sanitiser runs (securityLevel 'strict'): the labels are the model's words. Dark or light from the page.

let _mermaid = null
async function load() {
    if (_mermaid) return _mermaid
    const m = (await import('mermaid')).default
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim()
    const dark = /^#?(0|1|2)/i.test(bg.replace('#', '')) || /rgb\(\s*(\d{1,2}),/.test(bg)
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', flowchart: { htmlLabels: true, curve: 'basis' } })
    _mermaid = m
    return m
}

export function MermaidDiagram({ code, label }) {
    const raw = useId()
    const id = `mmd-${raw.replace(/[^a-zA-Z0-9]/g, '')}`
    const [svg, setSvg] = useState(null)
    const [error, setError] = useState(null)
    useEffect(() => {
        let live = true
        setSvg(null); setError(null)
        load().then(m => m.render(id, code)).then(
            r => { if (live) setSvg(r.svg) },
            e => { if (live) setError(e?.message ?? 'could not draw') },
        )
        return () => { live = false }
    }, [code, id])
    if (error) return <p className="situation__note">The diagram could not be drawn ({error}).</p>
    if (!svg) return <p className="situation__note">Drawing…</p>
    // Mermaid's own output, sanitised by it (securityLevel 'strict').
    return <div className="situation__diagram" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
}

MermaidDiagram.propTypes = { code: PropTypes.string.isRequired, label: PropTypes.string }
