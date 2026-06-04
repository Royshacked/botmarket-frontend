import PropTypes from 'prop-types'
import './NewsFeed.scss'

export function NewsFeed({ articles = [], isLoading, symbol = null }) {
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
                <span className="news-feed__title">{symbol ? `${symbol} News` : 'News Feed'}</span>
                <span className={`news-feed__status-dot${isLoading ? ' loading' : ''}`} />
            </div>

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
                                <div className="news-feed__item-right">
                                    {article.sentiment && (
                                        <span className={`news-feed__sentiment news-feed__sentiment--${article.sentiment}`}>
                                            {article.sentiment} {article.confidence ? `${Math.round(article.confidence * 100)}%` : ''}
                                        </span>
                                    )}
                                    {article.image && (
                                        <img
                                            className="news-feed__item-img"
                                            src={article.image}
                                            alt=""
                                            loading="lazy"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    )
}

function _formatTime(unixSec) {
    if (!unixSec) return ''
    return new Date(unixSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

NewsFeed.propTypes = {
    articles:  PropTypes.array,
    isLoading: PropTypes.bool,
    symbol:    PropTypes.string,
}
