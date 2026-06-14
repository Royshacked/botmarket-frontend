import { useEffect, useRef } from 'react'

// ── Canvas header background ──────────────────────────────────────────────────
// Ambient drifting candlesticks + occasional fading chat (user prompt / AI reply).
// Colors are read from the active theme's CSS variables, so it adapts to
// ocean / forest / crimson (and any future theme) automatically.
//
// Runtime-safe: single rAF loop with cleanup, paused when the tab is hidden,
// honours prefers-reduced-motion, and scales for high-DPI screens.

const AI_NAME = 'Tradvisor'
const FONT = '14px "IBM Plex Mono", monospace'
const LINE_GAP = 18
const CANDLE_W = 8
const CANDLE_GAP = 7

const CHAT_PAIRS = [
    { user: 'Should I buy TSLA now?',      ai: 'RSI is oversold — possible bounce setup.' },
    { user: "What's my portfolio risk?",   ai: 'Exposure is 62% tech. Consider rebalancing.' },
    { user: 'Set a stop loss for AAPL',     ai: 'Stop loss placed at $187.40 (-3%).' },
    { user: 'Explain this MACD crossover',  ai: 'Bullish signal — momentum shifting upward.' },
    { user: 'Any news on NVDA today?',      ai: 'Earnings beat estimates, +4% after hours.' },
]

export function HeaderBackground({ userName = 'Trader' }) {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

        let width = 0
        let height = 0
        let candles = []
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
                candleUp:   'rgb(0, 100, 0)',   // dark green
                candleDown: 'rgb(139, 0, 0)',   // dark red
                chatUser:   resolveColor('--text-primary'),
                chatAi:     resolveColor('--accent-light'),
            }
        }

        // ── Geometry ──
        function buildCandles() {
            const n = Math.ceil(width / (CANDLE_W + CANDLE_GAP)) + 2
            candles = Array.from({ length: n }, (_, i) => ({
                x: i * (CANDLE_W + CANDLE_GAP),
                y: Math.random() * height,
                bodyH: 6 + Math.random() * 16,
                wickH: 4 + Math.random() * 11,
                up: Math.random() > 0.5,
                speed: 6 + Math.random() * 8, // px / sec, drifting upward
                opacity: 0.14 + Math.random() * 0.14,
            }))
        }

        function resize() {
            const dpr = window.devicePixelRatio || 1
            width = canvas.offsetWidth
            height = canvas.offsetHeight
            canvas.width = Math.round(width * dpr)
            canvas.height = Math.round(height * dpr)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // draw in CSS pixels, crisp on retina
            buildCandles()
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

            // Candlesticks (background layer)
            ctx.lineWidth = 1
            for (const c of candles) {
                const cx = c.x + CANDLE_W / 2
                const candleColor = c.up ? colors.candleUp : colors.candleDown
                ctx.strokeStyle = rgba(candleColor, c.opacity * 1.4)
                ctx.beginPath()
                ctx.moveTo(cx, c.y - c.wickH / 2)
                ctx.lineTo(cx, c.y + c.bodyH + c.wickH / 2)
                ctx.stroke()
                ctx.fillStyle = rgba(candleColor, c.opacity)
                ctx.fillRect(c.x, c.y, CANDLE_W, c.bodyH)

                if (!animate) continue
                c.y -= c.speed * (dt / 1000)
                if (c.y + c.bodyH + c.wickH < -10) {
                    c.y = height + Math.random() * 30
                    c.bodyH = 6 + Math.random() * 16
                    c.wickH = 4 + Math.random() * 11
                    c.up = Math.random() > 0.5
                    c.opacity = 0.14 + Math.random() * 0.14
                }
            }

            if (!animate) return

            // Chat pairs (fading, middle layer)
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
