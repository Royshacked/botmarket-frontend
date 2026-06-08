import { useState, useEffect, useCallback, useRef } from 'react'

import { AppFooter }        from '../cmps/AppFooter.jsx'
import { ChatPanel }         from '../cmps/ChatPanel/ChatPanel.jsx'
import { NewsFeed }          from '../cmps/NewsFeed/NewsFeed.jsx'
import { TradingViewChart }  from '../cmps/TradingViewChart/TradingViewChart.jsx'
import { TradeIdeasList }    from '../cmps/TradeIdeas/TradeIdeasList.jsx'
import { MonitorDashboard }  from '../cmps/MonitorDashboard/MonitorDashboard.jsx'
import { userPromptService } from '../services/userPrompt/userPrompt.service.remote.js'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote.js'

const NEWS_STREAM_URL = import.meta.env.PROD
    ? '/news-feed/stream'
    : 'http://localhost:3030/news-feed/stream'

const NEWS_ASSET_BASE = import.meta.env.PROD
    ? '/news-feed/asset'
    : 'http://localhost:3030/news-feed/asset'

const COMPANY_NEWS_INTERVAL_MS = 30 * 60 * 1000

// Derive a live "building" idea from chat state — shown in the list but not yet saved
function deriveBuildingIdea(analysisState) {
    if (!analysisState) return null
    const s  = analysisState.structured_state || {}
    const pt = s.pending_trade || {}
    if (!s.active_asset) return null   // nothing to show yet
    return {
        id:               '__building__',
        status:           'building',
        asset:            s.active_asset,
        direction:        pt.direction       || null,
        type:             pt.type            || null,
        quantity:         pt.quantity        ?? null,
        entry_timeframe:  pt.entry_timeframe || null,
        stop_timeframe:   pt.stop_timeframe  || null,
        tp_timeframe:     pt.tp_timeframe    || null,
        entry_conditions: pt.entry_conditions || [],
        stop_conditions:  pt.stop_conditions  || [],
        tp_conditions:    pt.tp_conditions    || [],
        notes:            pt.notes           || null,
    }
}

export function MainPage() {
    const [messages, setMessages] = useState([])
    const [analysisState, setAnalysisState] = useState(null)
    const [chartSymbol, setChartSymbol] = useState('AAPL')
    const [isLoading, setIsLoading] = useState(false)
    const [newsArticles, setNewsArticles] = useState([])
    const [newsLoading, setNewsLoading] = useState(false)
    const [activeNewsSymbol, setActiveNewsSymbol] = useState(null)
    const [activeNewsQuery, setActiveNewsQuery]   = useState(null)
    const [assetArticles, setAssetArticles] = useState([])
    const [assetNewsLoading, setAssetNewsLoading] = useState(false)
    const [assetSentimentLoading, setAssetSentimentLoading] = useState(false)
    const [ideas, setIdeas] = useState([])
    const [editingIdeaId, setEditingIdeaId] = useState(null)
    const latestMessagesRef    = useRef([])
    const lastFetchedAssetRef  = useRef(null)

    // ── Typewriter queue ──────────────────────────────────────────────────────
    // Tokens from the API go into the queue (ref — zero React overhead).
    // A 16ms drain timer flushes a small chunk per frame, producing smooth output.
    const tokenQueueRef = useRef('')
    const drainTimerRef = useRef(null)

    function _startDrain() {
        if (drainTimerRef.current) return
        drainTimerRef.current = setInterval(() => {
            const q = tokenQueueRef.current
            if (!q.length) return
            const chunk = q.slice(0, 1)
            tokenQueueRef.current = q.slice(1)
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (!last?.streaming) return prev
                msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
                return msgs
            })
        }, 60)
    }

    function _stopDrain() {
        clearInterval(drainTimerRef.current)
        drainTimerRef.current = null
        tokenQueueRef.current = ''
    }

    const buildingIdea = deriveBuildingIdea(analysisState)

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
    }, [activeNewsQuery])

    const loadIdeas = useCallback(async () => {
        try {
            const fetched = await tradeIdeasService.getIdeas()
            setIdeas(fetched)
        } catch (err) {
            console.error('[tradeIdeas] load failed', err)
        }
    }, [])

    useEffect(() => {
        loadIdeas()
        const interval = setInterval(loadIdeas, 30_000)
        return () => clearInterval(interval)
    }, [loadIdeas])

    async function handleSend(userPrompt, currentAnalysisState) {
        setMessages(prev => [
            ...prev,
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: '', streaming: true },
        ])
        setIsLoading(true)
        _startDrain()

        try {
            await userPromptService.sendPromptStream(
                userPrompt,
                currentAnalysisState,
                {
                    // Buffer only — drain timer handles the actual state updates
                    onToken: (text)   => { tokenQueueRef.current += text },
                    onAsset: (symbol) => {
                        if (symbol) {
                            setChartSymbol(symbol)
                            if (symbol !== lastFetchedAssetRef.current) {
                                setActiveNewsSymbol(symbol)
                                setAssetNewsLoading(true)
                            }
                        }
                    },

                    onDone: (data) => {
                        _stopDrain()
                        console.log('[stream done]', data)
                        setMessages(prev => {
                            const msgs = [...prev]
                            const last = msgs[msgs.length - 1]
                            if (last?.streaming) {
                                msgs[msgs.length - 1] = { role: 'assistant', content: data.reply, analysisState: data.analysisState ?? null }
                            }
                            latestMessagesRef.current = msgs
                            return msgs
                        })
                        setAnalysisState(data.analysisState ?? null)
                        const newAsset   = data.analysisState?.structured_state?.active_asset
                        const newCompany = data.analysisState?.structured_state?.active_company_name
                        if (newAsset) setChartSymbol(newAsset)
                        if (newAsset && newAsset !== lastFetchedAssetRef.current) {
                            lastFetchedAssetRef.current = newAsset
                            setActiveNewsSymbol(newAsset)
                            setActiveNewsQuery(newCompany || newAsset)
                            setAssetNewsLoading(true)
                        }
                        if (data.ideaSaved) loadIdeas()

                        // Save chat state progressively when editing
                        if (editingIdeaId && data.analysisState) {
                            tradeIdeasService.updateIdea(editingIdeaId, {
                                chat_state: { messages: latestMessagesRef.current, analysisState: data.analysisState }
                            }).catch(err => console.error('[chat_state] save failed', err))
                        }
                    },

                    onError: (message) => {
                        _stopDrain()
                        setMessages(prev => {
                            const msgs = [...prev]
                            const last = msgs[msgs.length - 1]
                            if (last?.streaming) {
                                msgs[msgs.length - 1] = {
                                    role: 'assistant',
                                    content: message || 'Error communicating with the server.',
                                }
                            }
                            return msgs
                        })
                    },
                }
            )
        } catch (err) {
            console.error(err)
            _stopDrain()
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (last?.streaming) {
                    msgs[msgs.length - 1] = {
                        role: 'assistant',
                        content: 'Error communicating with the server. Please try again.',
                    }
                }
                return msgs
            })
        } finally {
            setIsLoading(false)
        }
    }

    function handleCancelBuild() {
        setAnalysisState(null)
        setMessages([])
        setEditingIdeaId(null)
        setActiveNewsSymbol(null)
        setActiveNewsQuery(null)
        latestMessagesRef.current   = []
        lastFetchedAssetRef.current = null
    }

    function handleEditIdea(idea) {
        const cs = idea.chat_state
        // Restore prior chat if available, otherwise seed state from the idea's conditions
        const restoredState = cs?.analysisState ?? {
            recent_messages: [],
            recent_chat_summary: '',
            structured_state: {
                active_asset: idea.asset || '',
                pending_trade: {
                    direction:        idea.direction        ?? null,
                    type:             idea.type             ?? null,
                    quantity:         idea.quantity         ?? null,
                    entry_timeframe:  idea.entry_timeframe  ?? null,
                    stop_timeframe:   idea.stop_timeframe   ?? null,
                    tp_timeframe:     idea.tp_timeframe     ?? null,
                    entry_logic:      idea.entry_logic      ?? 'AND',
                    entry_conditions: idea.entry_conditions ?? [],
                    stop_logic:       idea.stop_logic       ?? 'OR',
                    stop_conditions:  idea.stop_conditions  ?? [],
                    tp_logic:           idea.tp_logic           ?? 'OR',
                    tp_conditions:      idea.tp_conditions      ?? [],
                    additional_entries: (idea.additional_entries ?? []).map(ae => ({
                        conditions: ae.conditions ?? [],
                        logic:      ae.logic      ?? 'AND',
                        quantity:   ae.quantity   ?? null,
                    })),
                    notes:            idea.notes            ?? null,
                },
            },
        }
        const restoredMessages = cs?.messages ?? []
        setMessages(restoredMessages)
        latestMessagesRef.current = restoredMessages
        setAnalysisState(restoredState)
        setChartSymbol(restoredState.structured_state?.active_asset || idea.asset || 'AAPL')
        setEditingIdeaId(idea.id)
    }

    async function handleGenerate() {
        if (!buildingIdea) return
        const { id: _id, status: _status, ...ideaFields } = buildingIdea
        const chatState = { messages: latestMessagesRef.current, analysisState }

        if (editingIdeaId) {
            try {
                const res = await tradeIdeasService.updateIdea(editingIdeaId, {
                    ...ideaFields,
                    status:     'waiting',
                    chat_state: chatState,
                })
                setIdeas(prev => prev.map(i => i.id === editingIdeaId ? res.idea : i))
                setEditingIdeaId(null)
                setAnalysisState(null)
                setMessages([])
                setActiveNewsSymbol(null)
                setActiveNewsQuery(null)
                latestMessagesRef.current   = []
                lastFetchedAssetRef.current = null
            } catch (err) {
                console.error('[tradeIdeas] edit update failed', err)
            }
        } else {
            try {
                const saved = await tradeIdeasService.createIdea({ ...ideaFields, chat_state: chatState })
                setIdeas(prev => [saved, ...prev])
                setAnalysisState(null)
                setMessages([])
                setActiveNewsSymbol(null)
                setActiveNewsQuery(null)
                latestMessagesRef.current   = []
                lastFetchedAssetRef.current = null
            } catch (err) {
                console.error('[tradeIdeas] create failed', err)
            }
        }
    }

    async function handleDeleteIdea(id) {
        try {
            await tradeIdeasService.deleteIdea(id)
            setIdeas(prev => prev.filter(idea => idea.id !== id))
            if (id === editingIdeaId) handleCancelBuild()
        } catch (err) {
            console.error('[tradeIdeas] delete failed', err)
        }
    }

    async function handleStatusChange(id, status) {
        // Optimistic update — React controlled selects snap back without this
        setIdeas(prev => prev.map(idea => idea.id === id ? { ...idea, status } : idea))
        try {
            const res = await tradeIdeasService.updateIdea(id, { status })
            // Confirm with the server's returned document
            setIdeas(prev => prev.map(idea => idea.id === id ? res.idea : idea))
        } catch (err) {
            console.error('[tradeIdeas] status update failed', err)
            // Revert by reloading from server
            loadIdeas()
        }
    }

    async function handleUpdateIdea(id, patch) {
        try {
            const res = await tradeIdeasService.updateIdea(id, patch)
            setIdeas(prev => prev.map(idea => idea.id === id ? res.idea : idea))
        } catch (err) {
            console.error('[tradeIdeas] update failed', err)
        }
    }

    return (
        <>
            <main>
                {/* ── Desktop / tablet workspace ── */}
                <div className="workspace">
                    <div className="workspace__left">
                        <div className="workspace__chart">
                            <TradingViewChart symbol={chartSymbol} />
                        </div>
                        <TradeIdeasList
                            ideas={ideas
                                .filter(i => i.status !== 'closed')
                                .filter(i => i.id !== editingIdeaId)}
                            buildingIdea={buildingIdea}
                            onDelete={handleDeleteIdea}
                            onCancelBuild={handleCancelBuild}
                            onStatusChange={handleStatusChange}
                            onUpdate={handleUpdateIdea}
                            onSymbolClick={setChartSymbol}
                            onEdit={handleEditIdea}
                        />
                    </div>
                    <div className="workspace__chat">
                        <ChatPanel
                            messages={messages}
                            analysisState={analysisState}
                            onSend={handleSend}
                            onGenerate={handleGenerate}
                            onClear={handleCancelBuild}
                            isLoading={isLoading}
                            isEditing={!!editingIdeaId}
                        />
                    </div>
                    <div className="workspace__news">
                        <NewsFeed
                            articles={activeNewsSymbol ? assetArticles : newsArticles}
                            isLoading={activeNewsSymbol ? assetNewsLoading : newsLoading}
                            sentimentLoading={!!activeNewsSymbol && assetSentimentLoading}
                            symbol={activeNewsSymbol}
                        />
                    </div>
                </div>

                {/* ── Mobile monitor dashboard ── */}
                <MonitorDashboard
                    ideas={ideas.filter(i => i.status !== 'closed')}
                    newsArticles={newsArticles}
                    newsLoading={newsLoading}
                    onUpdate={handleUpdateIdea}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDeleteIdea}
                    onEdit={handleEditIdea}
                />
            </main>


            <AppFooter />
        </>
    )
}
