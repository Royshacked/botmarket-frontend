import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import './TradingViewChart.scss'

const SCRIPT_SRC = 'https://s3.tradingview.com/tv.js'

const TV_INTERVAL = {
    '1min':  '1',
    '5min':  '5',
    '15min': '15',
    '30min': '30',
    '1hr':   '60',
    '2hr':   '120',
    '4hr':   '240',
    'day':   'D',
    'week':  'W',
    'month': 'M',
}
let _scriptPromise = null

function _loadScript() {
    if (_scriptPromise) return _scriptPromise
    _scriptPromise = new Promise((resolve) => {
        if (window.TradingView) { resolve(); return }
        const script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.onload = resolve
        document.head.appendChild(script)
    })
    return _scriptPromise
}

let _uid = 0

export function TradingViewChart({ symbol = 'SPY', interval = 'D' }) {
    const containerRef = useRef(null)
    const idRef = useRef(`tv-chart-${++_uid}`)

    useEffect(() => {
        const id = idRef.current
        const container = containerRef.current
        if (!container) return

        _loadScript().then(() => {
            if (!container || !window.TradingView) return
            container.innerHTML = ''
            const inner = document.createElement('div')
            inner.id = id
            inner.style.height = '100%'
            container.appendChild(inner)

            new window.TradingView.widget({
                container_id: id,
                autosize: true,
                symbol,
                interval: TV_INTERVAL[interval] ?? interval,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                theme: 'dark',
                style: '1',
                locale: 'en',
                backgroundColor: 'rgba(2, 8, 16, 1)',
                gridColor: 'rgba(20, 60, 120, 0.12)',
                toolbar_bg: '#071222',
                enable_publishing: false,
                allow_symbol_change: true,
                hide_side_toolbar: false,
                save_to_server: false,
                overrides: {
                    // Canvas background
                    'paneProperties.background':                    '#020810',
                    'paneProperties.backgroundType':                'solid',
                    'paneProperties.backgroundGradientStartColor':  '#020810',
                    'paneProperties.backgroundGradientEndColor':    '#020810',
                    // Grid lines
                    'paneProperties.vertGridProperties.color':      'rgba(20, 60, 120, 0.12)',
                    'paneProperties.horzGridProperties.color':      'rgba(20, 60, 120, 0.12)',
                    // Crosshair
                    'paneProperties.crossHairProperties.color':     'rgba(138, 184, 232, 0.5)',
                    // Scales / axes
                    'scalesProperties.backgroundColor':             '#071222',
                    'scalesProperties.lineColor':                   'rgba(20, 60, 120, 0.35)',
                    'scalesProperties.textColor':                   '#7a9bc0',
                },
            })
        })

        return () => {
            if (container) container.innerHTML = ''
        }
    }, [symbol, interval])

    return (
        <div className="tv-chart" ref={containerRef} />
    )
}

TradingViewChart.propTypes = {
    symbol:   PropTypes.string,
    interval: PropTypes.string,
}
