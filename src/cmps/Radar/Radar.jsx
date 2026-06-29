import PropTypes from 'prop-types'
import { BrandTitle } from '../BrandTitle.jsx'
import { ScanList } from './ScanList.jsx'
import './Radar.scss'

// Market-intelligence panel: incoming News (headlines + sentiment) and Scans
// (scanner candidate lists), surfaced under one "Axl Radar" brand. Styling is
// kept under the original `news-feed` CSS namespace.
export function Radar({
    articles = [],
    isLoading,
    sentimentLoading = false,
    tab = 'news',
    onTabChange,
    activeSymbol = null,
    scans = [],
    scansLoading = false,
    onCandidateSelect,
    onDeleteScan,
    onEditScan,
    earnings = [],
    earningsDate = null,
    earningsLoading = false,
    fda = [],
    fdaDate = null,
    fdaLoading = false,
}) {
    const loading =
        tab === 'scans'    ? scansLoading    :
        tab === 'earnings' ? earningsLoading :
        tab === 'fda'      ? fdaLoading      :
        isLoading

    return (
        <div className="news-feed">
            <div className="news-feed__header">
                <svg className="news-feed__title-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    {/* Signal arcs */}
                    <path d="M4 10 Q4 4 10 4 Q16 4 16 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                    <path d="M6.5 10 Q6.5 6.5 10 6.5 Q13.5 6.5 13.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                    {/* Dot */}
                    <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
                    {/* Stand */}
                    <line x1="10" y1="11.5" x2="10" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="7"  y1="16"   x2="13" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="news-feed__title"><BrandTitle text="Axl Radar" /></span>
                <span className="news-feed__live-badge">
                    <span className={`news-feed__status-dot${loading ? ' loading' : ''}`} />
                    <span className="news-feed__live">live</span>
                </span>
            </div>

            <div className="news-feed__tabs">
                <button
                    className={`news-feed__tab${tab === 'news' ? ' news-feed__tab--active' : ''}`}
                    onClick={() => onTabChange?.('news')}
                >{activeSymbol ? `${activeSymbol} News` : 'News'}</button>
                <button
                    className={`news-feed__tab${tab === 'earnings' ? ' news-feed__tab--active' : ''}`}
                    onClick={() => onTabChange?.('earnings')}
                >
                    Earnings{earnings.length > 0 && <span className="news-feed__tab-count">{earnings.length}</span>}
                </button>
                <button
                    className={`news-feed__tab${tab === 'fda' ? ' news-feed__tab--active' : ''}`}
                    onClick={() => onTabChange?.('fda')}
                >
                    FDA{fda.length > 0 && <span className="news-feed__tab-count">{fda.length}</span>}
                </button>
                <button
                    className={`news-feed__tab news-feed__tab--scans${tab === 'scans' ? ' news-feed__tab--active' : ''}`}
                    onClick={() => onTabChange?.('scans')}
                >
                    Scans{scans.length > 0 && <span className="news-feed__tab-count">{scans.length}</span>}
                </button>
            </div>

            {tab === 'scans' ? (
                <div className="news-feed__list">
                    <ScanList
                        scans={scans}
                        loading={scansLoading}
                        onCandidateSelect={onCandidateSelect}
                        onDelete={onDeleteScan}
                        onEditScan={onEditScan}
                    />
                </div>
            ) : tab === 'earnings' ? (
                <div className="news-feed__list">
                    <EarningsList items={earnings} date={earningsDate} loading={earningsLoading} />
                </div>
            ) : tab === 'fda' ? (
                <div className="news-feed__list">
                    <FdaList items={fda} date={fdaDate} loading={fdaLoading} />
                </div>
            ) : (
                <div className="news-feed__list">
                    {isLoading && (
                        <div className="news-feed__loader">
                            <span /><span /><span />
                        </div>
                    )}

                    {!isLoading && articles.length === 0 && (
                        <p className="news-feed__empty">No news today yet.</p>
                    )}

                    {!isLoading && [...articles].sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0)).map((article, i) => (
                        <a
                            key={article.url || i}
                            className="news-feed__item"
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <div className="news-feed__item-body">
                                <div className="news-feed__item-meta">
                                    <span className="news-feed__source">{article.source}</span>
                                    <span className="news-feed__time">{_formatTime(article.datetime)}</span>
                                </div>
                                <div className="news-feed__item-content">
                                    <div className="news-feed__item-text">
                                        <p className="news-feed__headline">{article.headline}</p>
                                        {article.summary && (
                                            <p className="news-feed__summary">{article.summary}</p>
                                        )}
                                    </div>
                                    {article.image && (
                                        <img
                                            className="news-feed__item-img"
                                            src={article.image}
                                            alt=""
                                            loading="lazy"
                                        />
                                    )}
                                </div>
                                {article.sentiment ? (
                                    <span className={`news-feed__sentiment news-feed__sentiment--${article.sentiment}`}>
                                        {article.sentiment} {article.confidence ? `${Math.round(article.confidence * 100)}%` : ''}
                                    </span>
                                ) : sentimentLoading && (
                                    <span className="news-feed__sentiment news-feed__sentiment--pending">
                                        <span /><span /><span />
                                    </span>
                                )}
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    )
}

function EarningsList({ items, date, loading }) {
    if (loading) return <div className="news-feed__loader"><span /><span /><span /></div>
    if (!items.length) return <p className="news-feed__empty">No earnings scheduled{date ? ` for ${_fmtDate(date)}` : ''}.</p>
    return (
        <div className="cal-list">
            {date && <div className="cal-list__date-header">{_fmtDate(date)}</div>}
            <div className="cal-list__grid">
                {items.map((e, i) => (
                    <div key={e.symbol || i} className="cal-item cal-item--card">
                        <div className="cal-item__ticker">{e.symbol}</div>
                        <div className="cal-item__info">
                            {e.time && <div className="cal-item__time">{e.time.toUpperCase()}</div>}
                            {e.epsEstimated != null && (
                                <div className="cal-item__stat">EPS <strong>{_fmt(e.epsEstimated)}</strong></div>
                            )}
                            {e.revenueEstimated != null && (
                                <div className="cal-item__stat">Rev <strong>{_money(e.revenueEstimated)}</strong></div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function FdaList({ items, date, loading }) {
    if (loading) return <div className="news-feed__loader"><span /><span /><span /></div>
    if (!items.length) return <p className="news-feed__empty">No FDA events{date ? ` for ${_fmtDate(date)}` : ''}.</p>
    return (
        <div className="cal-list">
            {date && <div className="cal-list__date-header">{_fmtDate(date)}</div>}
            {items.map((e, i) => (
                <div key={i} className="cal-item cal-item--fda">
                    <div className="cal-item__left">
                        {e.ticker
                            ? <span className="cal-item__ticker">{e.ticker}</span>
                            : <span className="cal-item__company">{e.company}</span>
                        }
                        {e.action && <span className="cal-item__action">{e.action}</span>}
                    </div>
                    <div className="cal-item__right">
                        <span className="cal-item__drug">{e.drug}</span>
                        {e.status && <span className={`cal-item__status cal-item__status--${e.status.toLowerCase().replace(/\s+/g, '-')}`}>{e.status}</span>}
                    </div>
                </div>
            ))}
        </div>
    )
}

function _formatTime(unixSec) {
    if (!unixSec) return ''
    return new Date(unixSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function _fmtDate(iso) {
    if (!iso) return ''
    const [, m, d] = iso.split('-')
    return `${_months[+m - 1]} ${+d}`
}
const _months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function _fmt(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    return n.toFixed(2)
}

function _money(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    return `$${n.toFixed(0)}`
}

Radar.propTypes = {
    articles:          PropTypes.array,
    isLoading:         PropTypes.bool,
    sentimentLoading:  PropTypes.bool,
    tab:               PropTypes.string,
    onTabChange:       PropTypes.func,
    activeSymbol:      PropTypes.string,
    scans:             PropTypes.array,
    scansLoading:      PropTypes.bool,
    onCandidateSelect: PropTypes.func,
    onDeleteScan:      PropTypes.func,
    onEditScan:        PropTypes.func,
    earnings:          PropTypes.array,
    earningsDate:      PropTypes.string,
    earningsLoading:   PropTypes.bool,
    fda:               PropTypes.array,
    fdaDate:           PropTypes.string,
    fdaLoading:        PropTypes.bool,
}
