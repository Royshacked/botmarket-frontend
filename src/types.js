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
 * @property {'building'|'waiting'|'looking'|'hit'|'long'|'short'|'closed'} status
 * @property {string} asset
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
 * @property {AdditionalEntry[]} [additional_entries]
 * @property {string|null} [notes]
 * @property {number} [savedAt]                epoch ms
 * @property {Array<string|Account>} [accounts]  attached account ids (or objects)
 * @property {string|null} [mainAccountId]    account the `quantity` is sized for
 * @property {ChatState} [chat_state]
 * @property {'awaiting_confirm'|'awaiting_market'|null} [orderState]
 * @property {number} [ordersPlacedAt]        epoch ms once orders are placed
 * @property {{ plan?: OrderPreview[] }} [pendingOrder]  server-built order plan
 * @property {string} [portfolioId]           set when the idea belongs to a portfolio
 * @property {string} [portfolioName]
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
