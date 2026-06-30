import PropTypes from 'prop-types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { reflowMarkdownTables } from '../services/util.service.js'
import './ChatMarkdown.scss'

/**
 * Shared renderer for assistant chat messages. Centralizes GitHub-flavored Markdown
 * support (tables, etc. via remark-gfm) and repairs tables a model has flattened
 * onto one line (reflowMarkdownTables). Both chat panels render through this so the
 * plugin set and table styling stay in one place.
 */
// Wrap every table in a horizontal-scroll container so a wide table scrolls
// instead of squishing its columns (the ticker column in particular).
const MD_COMPONENTS = {
    table: ({ node, ...props }) => (
        <div className="chat-markdown__table-wrap">
            <table {...props} />
        </div>
    ),
}

export function ChatMarkdown({ children }) {
    const text = typeof children === 'string' ? children : ''
    return (
        <div className="chat-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{reflowMarkdownTables(text)}</ReactMarkdown>
        </div>
    )
}

ChatMarkdown.propTypes = {
    children: PropTypes.string,
}
