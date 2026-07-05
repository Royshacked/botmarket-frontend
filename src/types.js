/**
 * Shared type definitions (JSDoc) for the core domain shapes.
 *
 * These are the single source of truth for what an `Idea`, `AnalysisState`,
 * `Account`, etc. look like on the frontend — they mirror the backend contract.
 * Reference them from other files with an import-typedef, e.g.:
 *
 *   @param {import('../../types.js').Idea} idea
 *
 * Keep these in sync with the backend whenever a status, field, or API shape
 * changes (see the "frontend sync" rule).
 *
 * This module has no runtime exports; it exists purely for editor/type tooling.
 */

// ── Broker accounts ─────────────────────────────────────────────────────────

/**
 * A broker trading account, as surfaced by brokerService.getTradingAccounts
 * (with `broker` attached by the caller).
 *
 * @typedef {Object} Account
 * @property {string}  id          Account id (used as the selection key)
 * @property {string}  login       Human-facing account number / login
 * @property {string}  broker      'ctrader' | 'ibkr'
 * @property {boolean} [isLive]    true = live account, false = demo
 * @property {number}  [balance]   Cash balance (drives quantity scaling)
 * @property {number}  [equity]    Balance + open P/L
 * @property {string}  [currency]  ISO currency code
 * @property {number}  [marginLevel]
 */

// ── Conditions & pending trade ──────────────────────────────────────────────

/**
 * A single entry/stop/tp condition. Stored either as a bare string (legacy) or
 * an object carrying an optional timeframe.
 *
 * @typedef {string | { condition: string, timeframe?: string }} Condition
 */

/**
 * An extra scale-in leg for a trade.
 *
 * @typedef {Object} AdditionalEntry
 * @property {Condition[]} conditions
 * @property {'AND'|'OR'}  logic
 * @property {number|null} quantity
 */

/**
 * The trade currently being assembled in chat (not yet a saved Idea).
 *
 * @typedef {Object} PendingTrade
 * @property {'long'|'short'|null} direction
 * @property {'market'|'limit'|null} type
 * @property {number|null} quantity
 * @property {boolean} [immediate]      fires now — no entry conditions required
 * @property {string|null} [entry_timeframe]
 * @property {string|null} [stop_timeframe]
 * @property {string|null} [tp_timeframe]
 * @property {'AND'|'OR'} [entry_logic]
 * @property {'AND'|'OR'} [stop_logic]
 * @property {'AND'|'OR'} [tp_logic]
 * @property {Condition[]} [entry_conditions]
 * @property {Condition[]} [stop_conditions]
 * @property {Condition[]} [tp_conditions]
 * @property {AdditionalEntry[]} [additional_entries]
 * @property {string|null} [notes]
 * @property {string|null} [entry_order_type]  'stop' → rests as a broker stop-market order
 *                                             (the backend enriches this to Idea.entryOrderType)
 * @property {Conviction} [conviction]
 * @property {number|null} [rr]  reward-to-risk ratio (e.g. 1.5); null until entry+stop+target levels exist
 * @property {Invalidation} [invalidation]
 */

/**
 * Agent's confidence in a trade, shown as a chip in the build summary.
 *
 * @typedef {Object} Conviction
 * @property {'low'|'medium'|'high'} level
 * @property {string} [rationale]
 */

/**
 * Structured price-range watcher ("Invalidation"): fires a notify + edit link when
 * price leaves the actionable entry envelope. Agent-derived; cites structure.
 *
 * @typedef {Object} Invalidation
 * @property {number} [low]
 * @property {number} [high]
 * @property {string} [basis]   what structure the range is anchored to
 */

/**
 * @typedef {Object} StructuredState
 * @property {string} [active_asset]
 * @property {string} [active_company_name]
 * @property {PendingTrade} [pending_trade]
 */

/**
 * The orchestrator's running analysis of the conversation.
 *
 * @typedef {Object} AnalysisState
 * @property {ChatMessage[]} [recent_messages]
 * @property {string} [recent_chat_summary]
 * @property {StructuredState} [structured_state]
 */

// ── Chat ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {boolean} [streaming]        true while tokens are still arriving
 * @property {AnalysisState|null} [analysisState]
 * @property {string[]} [tickers]         recommended symbols (portfolio chat)
 */

/**
 * Persisted chat for an idea/portfolio so a build session can be re-opened.
 *
 * @typedef {Object} ChatState
 * @property {ChatMessage[]} messages
 * @property {AnalysisState|null} analysisState
 */

// ── Trade ideas & orders ────────────────────────────────────────────────────

/**
 * A saved trade idea. Most condition fields mirror PendingTrade; the rest is
 * persistence/order/portfolio metadata added by the backend.
 *
 * @typedef {Object} Idea
 * @property {string} id
 * @property {'building'|'waiting'|'looking'|'resting'|'hit'|'long'|'short'|'closed'} status
 * @property {string} asset
 * @property {'stock'|'etf'|'futures'|'forex'|'crypto'|null} [asset_class]  drives the market-hours session
 * @property {'long'|'short'|null} [direction]
 * @property {'market'|'limit'|null} [type]
 * @property {number|null} [quantity]
 * @property {boolean} [immediate]
 * @property {Condition[]} [entry_conditions]
 * @property {Condition[]} [stop_conditions]
 * @property {Condition[]} [tp_conditions]
 * @property {'AND'|'OR'} [entry_logic]
 * @property {'AND'|'OR'} [stop_logic]
 * @property {'AND'|'OR'} [tp_logic]
 * @property {object} [entry_condition_tree]  newer nested-tree condition format
 * @property {object} [stop_condition_tree]
 * @property {object} [tp_condition_tree]
 * @property {'stop'|null} [entryOrderType]    server-enriched from entry_order_type;
 *                                             'stop' = idea rests as a broker stop-market order
 * @property {AdditionalEntry[]} [additional_entries]
 * @property {string|null} [notes]
 * @property {string} [timeframe]              legacy top-level chart timeframe (pre per-phase)
 * @property {Conviction} [conviction]
 * @property {Invalidation} [invalidation]     structured entry-envelope watcher
 * @property {string|null} [invalidation_status]  set when price left the envelope
 * @property {string|null} [invalidation_reason]
 * @property {number|null} [invalidation_edge]
 * @property {boolean} [invalidation_armed]
 * @property {object} [conditionStates]        per-phase { leafStateKey → metAt } from the monitor
 * @property {number} [entryTriggeredAt]       epoch ms when entry fired
 * @property {number} [savedAt]                epoch ms
 * @property {Array<string|Account>} [accounts]  attached account ids (or objects)
 * @property {string|null} [mainAccountId]    account the `quantity` is sized for
 * @property {string|null} [broker]           broker this idea trades on (set at fork time)
 * @property {string|null} [brokerSymbol]     broker's tradable name for `asset` (e.g.
 *                                            NQ → US100), resolved + persisted at fork
 *                                            time; null = trade under the canonical asset
 * @property {string|null} [groupId]          links the single-broker children a multi-broker
 *                                            idea was forked into (display grouping; one card)
 * @property {ChatState} [chat_state]
 * @property {'awaiting_confirm'|'awaiting_market'|'placed'|null} [orderState]
 * @property {number} [ordersPlacedAt]        epoch ms once orders are placed
 * @property {{ plan?: OrderPreview[] }} [pendingOrder]  server-built order plan
 * @property {BrokerOrderLink[]} [brokerOrders]  per-account broker linkage; the execution
 *                                               reconciler matches native SL/TP closes to it
 * @property {'stop'|'tp'|'manual'|'broker'} [closedReason]  why the position closed
 * @property {number} [closedAt]              epoch ms when closed
 * @property {number} [realizedPnl]           realised pnl reported by the broker on close
 * @property {boolean} [monitorStop]          false once the stop rides on a native broker SL
 *                                            (the software monitor no longer watches it)
 * @property {boolean} [monitorTp]            false once the TP rides on a native broker TP
 * @property {{ stop: number|null, tp: number|null }} [nativeProtection]  price levels
 *                                            offloaded to the broker's native SL/TP, if any
 * @property {string} [portfolioId]           set when the idea belongs to a portfolio
 * @property {string} [portfolioName]
 */

/**
 * Links an idea to the broker order/position it placed, so execution events
 * (fills, native stop/TP closes) reconcile back to the idea.
 *
 * @typedef {Object} BrokerOrderLink
 * @property {string} broker
 * @property {string} accountId            broker-canonical account id
 * @property {string|null} orderId
 * @property {string|null} positionId      backfilled from the fill event
 */

/**
 * What a broker can do, from GET /api/broker/:type/capabilities. The UI branches on
 * these flags (show SL/TP inputs only when nativeProtection, a Close button only when
 * closePosition, …) instead of checking the broker name.
 *
 * @typedef {Object} BrokerCapabilities
 * @property {boolean} trading           can place orders at all
 * @property {boolean} nativeProtection  can attach SL/TP to an order natively
 * @property {boolean} modifyProtection  can amend SL/TP on an open position
 * @property {boolean} closePosition     can close a position programmatically
 * @property {boolean} ohlcv             can serve candles
 */

/**
 * One row in the order-confirmation dialog — a per-account order to place.
 *
 * @typedef {Object} OrderPreview
 * @property {string} broker
 * @property {string} accountId
 * @property {string} accountNo
 * @property {number} quantity
 * @property {string} orderType   e.g. 'Buy Market', 'Sell Short Market'
 * @property {boolean} isMain
 */

/**
 * A proposed portfolio of ideas, produced by the portfolio chat.
 *
 * @typedef {Object} PortfolioPlan
 * @property {string} name
 * @property {Array<{ asset: string, quantity?: number|null }>} ideas
 */

export {}
