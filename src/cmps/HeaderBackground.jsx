import { useEffect, useRef } from 'react'

// ── Canvas header background ──────────────────────────────────────────────────
// A static, tiled backdrop of *chart patterns* + occasional fading chat
// (user prompt / AI reply). Instead of plain candles floating up, we render small
// candle clusters that form recognizable setups — Bull Flag, Cup & Handle,
// Head & Shoulders, Order Block, False Break — each with a faint label and the
// relevant overlay (neckline, order-block box, resistance line). The patterns are
// laid out once per resize and don't move; only the chat overlay animates.
//
// Colors are read from the active theme's CSS variables, so it adapts to
// ocean / forest / crimson (and any future theme) automatically.
//
// Runtime-safe: single rAF loop with cleanup, paused when the tab is hidden,
// honours prefers-reduced-motion, and scales for high-DPI screens.

const AI_NAME = 'Tradvisor'
const FONT = '14px "IBM Plex Mono", monospace'
const LABEL_FONT = '11px "IBM Plex Mono", monospace'
const LINE_GAP = 18

// Candle geometry for the pattern clusters (denser than standalone candles so
// the shapes read like a real mini-chart).
const PAT_CW = 6
const PAT_GAP = 3

const CHAT_PAIRS = [
    { user: 'Should I buy TSLA now?',      ai: 'RSI is oversold — possible bounce setup.' },
    { user: "What's my portfolio risk?",   ai: 'Exposure is 62% tech. Consider rebalancing.' },
    { user: 'Set a stop loss for AAPL',     ai: 'Stop loss placed at $187.40 (-3%).' },
    { user: 'Explain this MACD crossover',  ai: 'Bullish signal — momentum shifting upward.' },
    { user: 'Any news on NVDA today?',      ai: 'Earnings beat estimates, +4% after hours.' },
]

// ── Pattern generators ────────────────────────────────────────────────────────
// Each returns { name, candles, decorations }.
//  - candles: [{ o, h, l, c }] in arbitrary price units (higher = up).
//  - decorations: optional overlays drawn behind the candles:
//      { type: 'hline', price, fromIdx, toIdx }   — neckline / resistance level
//      { type: 'rect', fromIdx, toIdx, priceLow, priceHigh } — order block zone
function noise(a) { return (Math.random() * 2 - 1) * a }

// Turn a series of close prices into candlesticks (open = previous close).
function seriesToCandles(closes) {
    const out = []
    for (let i = 0; i < closes.length; i++) {
        const c = closes[i]
        const o = i === 0 ? c - 0.6 : closes[i - 1]
        const h = Math.max(o, c) + 0.25 + Math.random() * 0.6
        const l = Math.min(o, c) - 0.25 - Math.random() * 0.6
        out.push({ o, h, l, c })
    }
    return out
}

function genBullFlag() {
    // Pole up → tight down-drifting consolidation → breakout.
    const closes = [0, 2.4, 4.9, 7.4, 9.9, 9.3, 9.6, 8.8, 9.1, 8.4, 9.4, 11.4, 13.3]
        .map(v => v + noise(0.22))
    return { name: 'Bull Flag', candles: seriesToCandles(closes), decorations: [] }
}

function genCupHandle() {
    const closes = []
    const cupN = 9, high = 10, low = 3
    for (let i = 0; i < cupN; i++) {
        const t = i / (cupN - 1)
        closes.push(high - (high - low) * Math.sin(Math.PI * t)) // smooth U
    }
    closes.push(9.0, 8.2, 8.7, 9.3) // handle (shallow dip)
    closes.push(10.6, 12.0)         // breakout
    return { name: 'Cup & Handle', candles: seriesToCandles(closes.map(v => v + noise(0.18))), decorations: [] }
}

function genHeadShoulders() {
    // Left shoulder → head → right shoulder → break of neckline.
    const closes = [2, 4.2, 6, 4.3, 6.8, 9, 6.6, 4.3, 6.1, 4.2, 2.3].map(v => v + noise(0.2))
    return {
        name: 'Head & Shoulders',
        candles: seriesToCandles(closes),
        decorations: [{ type: 'hline', price: 4.3, fromIdx: 3, toIdx: 9 }], // neckline
    }
}

function genOrderBlock() {
    // Tight consolidation (the block) → impulsive expansion away from it.
    const closes = [5, 4.7, 5.2, 4.8, 5.1, 4.6, 6.4, 8.4, 10.4, 11.0].map(v => v + noise(0.12))
    return {
        name: 'Order Block',
        candles: seriesToCandles(closes),
        decorations: [{ type: 'rect', fromIdx: 0, toIdx: 5, priceLow: 4.3, priceHigh: 5.5 }],
    }
}

function genFalseBreak() {
    // Range below resistance → single poke above (false break) → snap back down.
    const closes = [6, 7, 6.5, 7.2, 6.7, 8.7, 6.6, 6, 5.4, 5].map(v => v + noise(0.15))
    return {
        name: 'False Break',
        candles: seriesToCandles(closes),
        decorations: [{ type: 'hline', price: 8, fromIdx: 0, toIdx: 9 }], // resistance
    }
}

const PATTERNS = [genBullFlag, genCupHandle, genHeadShoulders, genOrderBlock, genFalseBreak]

export function HeaderBackground({ userName = 'Trader' }) {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

        let width = 0
        let height = 0
        let clusters = []
        let rafId = null
        let lastTs = 0
        let elapsed = 0

        // Two chat slots in fixed vertical bands so they never overlap each other.
        const chatSlots = [
            { item: null, nextAt: 800 },
            { item: null, nextAt: 2600 },
        ]

        // ── Resolve a CSS custom property to a normalized "rgb(r, g, b)" string ──
        function resolveColor(varName) {
            const probe = document.createElement('span')
            probe.style.color = `var(${varName})`
            probe.style.display = 'none'
            document.body.appendChild(probe)
            const c = getComputedStyle(probe).color || 'rgb(150, 180, 220)'
            probe.remove()
            return c
        }
        function rgba(rgb, a) {
            const m = rgb.match(/\d+/g)
            if (!m) return rgb
            return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a})`
        }

        let colors = readColors()
        function readColors() {
            return {
                candleUp:   'rgb(0, 120, 0)',   // green
                candleDown: 'rgb(160, 0, 0)',   // red
                overlay:    resolveColor('--accent-light'),
                chatUser:   resolveColor('--text-primary'),
                chatAi:     resolveColor('--accent-light'),
            }
        }

        // ── Static layout ──
        // Patterns are placed once in a tile grid across the header and never move.
        // Recomputed on resize only. A shuffled queue keeps variety without
        // repeating the same pattern in adjacent cells.
        let patQueue = []
        function nextPattern() {
            if (patQueue.length === 0) {
                patQueue = PATTERNS.map((_, i) => i)
                for (let i = patQueue.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1))
                    ;[patQueue[i], patQueue[j]] = [patQueue[j], patQueue[i]]
                }
            }
            return PATTERNS[patQueue.pop()]()
        }

        function layoutClusters() {
            clusters = []
            const cols = Math.max(2, Math.floor(width / 175))
            const rows = Math.max(1, Math.floor(height / 115))
            const cellW = width / cols
            const cellH = height / rows
            const labelSpace = 20

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const pat = nextPattern()
                    let mn = Infinity, mx = -Infinity
                    for (const k of pat.candles) { mn = Math.min(mn, k.l); mx = Math.max(mx, k.h) }
                    for (const d of pat.decorations) {
                        if (d.type === 'hline') { mn = Math.min(mn, d.price); mx = Math.max(mx, d.price) }
                        if (d.type === 'rect')  { mn = Math.min(mn, d.priceLow); mx = Math.max(mx, d.priceHigh) }
                    }

                    const pxW = pat.candles.length * (PAT_CW + PAT_GAP)
                    const pxH = Math.min(60, Math.max(34, cellH - labelSpace - 24))
                    const slackX = Math.max(0, cellW - pxW)
                    const slackY = Math.max(0, cellH - pxH - labelSpace)
                    const baseX = c * cellW + slackX * (0.25 + Math.random() * 0.5)
                    const baseY = r * cellH + 8 + slackY * (0.2 + Math.random() * 0.6)

                    clusters.push({
                        pat, mn, mx, baseX, baseY, pxW, pxH,
                        baseOpacity: 0.32 + Math.random() * 0.14,
                    })
                }
            }
        }

        function priceToY(cl, p) {
            const r = (cl.mx - cl.mn) || 1
            return cl.baseY + ((cl.mx - p) / r) * cl.pxH
        }
        function idxToX(cl, i) { return cl.baseX + i * (PAT_CW + PAT_GAP) }

        function drawCluster(cl, alpha) {
            const op = cl.baseOpacity * alpha
            if (op <= 0) return

            // Overlays (behind candles).
            ctx.setLineDash([4, 3])
            for (const d of cl.pat.decorations) {
                if (d.type === 'hline') {
                    const y = priceToY(cl, d.price)
                    ctx.strokeStyle = rgba(colors.overlay, op * 0.6)
                    ctx.lineWidth = 1
                    ctx.beginPath()
                    ctx.moveTo(idxToX(cl, d.fromIdx), y)
                    ctx.lineTo(idxToX(cl, d.toIdx) + PAT_CW, y)
                    ctx.stroke()
                } else if (d.type === 'rect') {
                    const x0 = idxToX(cl, d.fromIdx)
                    const x1 = idxToX(cl, d.toIdx) + PAT_CW
                    const yT = priceToY(cl, d.priceHigh)
                    const yB = priceToY(cl, d.priceLow)
                    ctx.fillStyle = rgba(colors.overlay, op * 0.16)
                    ctx.fillRect(x0, yT, x1 - x0, yB - yT)
                    ctx.strokeStyle = rgba(colors.overlay, op * 0.55)
                    ctx.lineWidth = 1
                    ctx.strokeRect(x0, yT, x1 - x0, yB - yT)
                }
            }
            ctx.setLineDash([])

            // Candles.
            ctx.lineWidth = 1
            for (let i = 0; i < cl.pat.candles.length; i++) {
                const k = cl.pat.candles[i]
                const cx = idxToX(cl, i) + PAT_CW / 2
                const up = k.c >= k.o
                const col = up ? colors.candleUp : colors.candleDown
                ctx.strokeStyle = rgba(col, op * 1.2)
                ctx.beginPath()
                ctx.moveTo(cx, priceToY(cl, k.h))
                ctx.lineTo(cx, priceToY(cl, k.l))
                ctx.stroke()
                const yo = priceToY(cl, k.o)
                const yc = priceToY(cl, k.c)
                const top = Math.min(yo, yc)
                const h = Math.max(2, Math.abs(yc - yo))
                ctx.fillStyle = rgba(col, op)
                ctx.fillRect(idxToX(cl, i), top, PAT_CW, h)
            }

            // Label.
            ctx.font = LABEL_FONT
            ctx.fillStyle = rgba(colors.chatUser, op * 0.7)
            ctx.fillText(cl.pat.name, cl.baseX, cl.baseY + cl.pxH + 14)
        }

        function resize() {
            const dpr = window.devicePixelRatio || 1
            width = canvas.offsetWidth
            height = canvas.offsetHeight
            canvas.width = Math.round(width * dpr)
            canvas.height = Math.round(height * dpr)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // draw in CSS pixels, crisp on retina
            layoutClusters()
        }

        function makeChat(slotIndex) {
            const pair = CHAT_PAIRS[Math.floor(Math.random() * CHAT_PAIRS.length)]
            const line1 = `${userName}: ${pair.user}`
            const line2 = `${AI_NAME}: ${pair.ai}`
            ctx.font = FONT
            const textW = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width)
            const margin = 16
            const maxX = Math.max(margin, width - textW - margin)
            const x = margin + Math.random() * (maxX - margin)
            const baseY = slotIndex === 0 ? height * 0.30 : height * 0.62
            return {
                line1, line2, x,
                y: Math.max(12, baseY),
                age: 0, inDur: 600, holdDur: 3000, outDur: 600,
            }
        }

        // ── Drawing ──
        function drawFrame(dt, animate) {
            ctx.clearRect(0, 0, width, height)

            // Pattern clusters (static background layer).
            for (const cl of clusters) drawCluster(cl, 1)

            if (!animate) return

            // Chat pairs (fading, foreground layer).
            ctx.font = FONT
            elapsed += dt
            for (let i = 0; i < chatSlots.length; i++) {
                const slot = chatSlots[i]
                if (!slot.item) {
                    if (elapsed >= slot.nextAt) slot.item = makeChat(i)
                    else continue
                }
                const it = slot.item
                it.age += dt
                const total = it.inDur + it.holdDur + it.outDur
                let a
                if (it.age < it.inDur) a = it.age / it.inDur
                else if (it.age < it.inDur + it.holdDur) a = 1
                else a = 1 - (it.age - it.inDur - it.holdDur) / it.outDur
                a = Math.max(0, Math.min(1, a))

                ctx.fillStyle = rgba(colors.chatUser, 0.82 * a)
                ctx.fillText(it.line1, it.x, it.y)
                ctx.fillStyle = rgba(colors.chatAi, 0.82 * a)
                ctx.fillText(it.line2, it.x, it.y + LINE_GAP)

                if (it.age >= total) {
                    slot.item = null
                    slot.nextAt = elapsed + 1500 + Math.random() * 3000
                }
            }
        }

        // ── Loop control ──
        function loop(ts) {
            if (!lastTs) lastTs = ts
            let dt = ts - lastTs
            lastTs = ts
            if (dt > 100) dt = 100 // clamp jumps after the tab was inactive
            drawFrame(dt, true)
            rafId = requestAnimationFrame(loop)
        }
        function start() {
            if (rafId != null) return
            lastTs = 0
            rafId = requestAnimationFrame(loop)
        }
        function stop() {
            if (rafId != null) cancelAnimationFrame(rafId)
            rafId = null
        }

        // ── Handlers ──
        function onResize() {
            resize()
            if (reduceMotion.matches) drawFrame(0, false)
        }
        function onVisibility() {
            if (document.hidden) stop()
            else if (!reduceMotion.matches) start()
        }
        function onMotionChange() {
            stop()
            resize()
            if (reduceMotion.matches) drawFrame(0, false)
            else start()
        }
        const themeObserver = new MutationObserver(() => { colors = readColors() })

        // ── Init ──
        resize()
        if (reduceMotion.matches) drawFrame(0, false)
        else start()

        window.addEventListener('resize', onResize)
        document.addEventListener('visibilitychange', onVisibility)
        reduceMotion.addEventListener('change', onMotionChange)
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'style'], // 'style' covers the generated spectrum vars
        })

        return () => {
            stop()
            window.removeEventListener('resize', onResize)
            document.removeEventListener('visibilitychange', onVisibility)
            reduceMotion.removeEventListener('change', onMotionChange)
            themeObserver.disconnect()
        }
    }, [userName])

    return <canvas ref={canvasRef} className="app-header__bg" aria-hidden="true" />
}
