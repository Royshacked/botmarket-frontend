import { useState, useEffect, useRef } from 'react'
import { API_BASE } from '../services/config.js'

const NEWS_STREAM_URL = `${API_BASE}/news-feed/stream`
const NEWS_ASSET_BASE = `${API_BASE}/news-feed/asset`
const COMPANY_NEWS_INTERVAL_MS = 30 * 60 * 1000

/**
 * Owns the news feed: the always-on market stream plus per-asset news/sentiment.
 *
 * Asset news is driven by an (symbol, query) pair. Callers move it via:
 *   previewAsset(symbol)         — soft hint while streaming (no fetch until query set)
 *   focusAsset(symbol, company)  — commit symbol + query, triggers the fetch (deduped)
 *   clearAsset()                 — back to the market feed
 */
export function useNewsFeed() {
    const [newsArticles, setNewsArticles] = useState([])
    const [newsLoading, setNewsLoading]   = useState(false)
    const [activeNewsSymbol, setActiveNewsSymbol] = useState(null)
    const [activeNewsQuery, setActiveNewsQuery]   = useState(null)
    const [assetArticles, setAssetArticles] = useState([])
    const [assetNewsLoading, setAssetNewsLoading] = useState(false)
    const [assetSentimentLoading, setAssetSentimentLoading] = useState(false)
    const lastFetchedAssetRef = useRef(null)

    // ── Market news stream (SSE) ──────────────────────────────────────────────
    useEffect(() => {
        setNewsLoading(true)
        const es = new EventSource(NEWS_STREAM_URL)

        es.onmessage = (e) => {
            try {
                const articles = JSON.parse(e.data)
                setNewsArticles(articles)
            } catch {
                console.error('[newsFeed] parse error', e.data)
            } finally {
                setNewsLoading(false)
            }
        }

        es.onerror = () => setNewsLoading(false)

        return () => es.close()
    }, [])

    // ── Per-asset news + sentiment ────────────────────────────────────────────
    useEffect(() => {
        if (!activeNewsSymbol || !activeNewsQuery) {
            setAssetArticles([])
            setAssetNewsLoading(false)
            setAssetSentimentLoading(false)
            return
        }

        let active = true
        const sym  = encodeURIComponent(activeNewsSymbol)
        const q    = encodeURIComponent(activeNewsQuery)

        function doFetch() {
            if (!active) return
            setAssetNewsLoading(true)
            setAssetSentimentLoading(false)

            // Phase 1 — render articles ASAP (no LLM on the server)
            fetch(`${NEWS_ASSET_BASE}/${sym}?q=${q}`)
                .then(r => r.json())
                .then(d => {
                    if (!active) return
                    const articles = Array.isArray(d.articles) ? d.articles : []
                    setAssetArticles(articles)
                    setAssetNewsLoading(false)
                    if (articles.length === 0) return

                    // Phase 2 — LLM relevance filter + sentiment
                    setAssetSentimentLoading(true)
                    fetch(`${NEWS_ASSET_BASE}/${sym}/sentiment?q=${q}`)
                        .then(r => r.json())
                        .then(s => {
                            if (!active) return
                            const enriched = Array.isArray(s.articles) ? s.articles : []
                            const byUrl    = new Map(enriched.map(a => [a.url, a]))
                            setAssetArticles(prev => {
                                const reconciled = prev
                                    .filter(a => byUrl.has(a.url))
                                    .map(a => ({ ...a, sentiment: byUrl.get(a.url).sentiment, confidence: byUrl.get(a.url).confidence }))
                                return reconciled.length > 0 ? reconciled : enriched
                            })
                        })
                        .catch(() => {})
                        .finally(() => { if (active) setAssetSentimentLoading(false) })
                })
                .catch(() => { if (active) { setAssetArticles([]); setAssetNewsLoading(false) } })
        }

        doFetch()
        const interval = setInterval(doFetch, COMPANY_NEWS_INTERVAL_MS)

        return () => {
            active = false
            clearInterval(interval)
            setAssetArticles([])
        }
        // Both feed the fetch URL — re-run if either changes (symbol can move
        // while the query string stays the same, e.g. two tickers, one company).
    }, [activeNewsSymbol, activeNewsQuery])

    // Soft hint while streaming: symbol is known but the query (company) isn't yet.
    function previewAsset(symbol) {
        if (symbol && symbol !== lastFetchedAssetRef.current) {
            setActiveNewsSymbol(symbol)
            setAssetNewsLoading(true)
        }
    }

    // Commit to an asset + its news query. Deduped against the last fetched asset.
    function focusAsset(symbol, company) {
        if (symbol && symbol !== lastFetchedAssetRef.current) {
            lastFetchedAssetRef.current = symbol
            setActiveNewsSymbol(symbol)
            setActiveNewsQuery(company || symbol)
            setAssetNewsLoading(true)
        }
    }

    function clearAsset() {
        setActiveNewsSymbol(null)
        setActiveNewsQuery(null)
        lastFetchedAssetRef.current = null
    }

    return {
        newsArticles,
        newsLoading,
        activeNewsSymbol,
        assetArticles,
        assetNewsLoading,
        assetSentimentLoading,
        previewAsset,
        focusAsset,
        clearAsset,
    }
}
