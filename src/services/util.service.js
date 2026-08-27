/**
 * Reflow GitHub-flavored Markdown tables that a model has flattened onto a single
 * line (e.g. "| Ticker | Base | |---|---| | XLU | +18% | | GLD | +20% |").
 *
 * remark-gfm only renders a pipe table when each row sits on its own line, so a
 * flattened table renders as inline text. We anchor on the separator row (the run
 * of dash-cells), use its length as the column count N, and re-split the header
 * and the trailing data cells into one row per line. Lines without a mid-line
 * separator (clean tables, prose) are returned untouched.
 *
 * @param {string} md  raw markdown
 * @returns {string}   markdown with any flattened tables reflowed
 */
export function reflowMarkdownTables(md) {
    if (typeof md !== 'string' || !md.includes('|') || !md.includes('-')) return md
    const reflowed = md.split('\n').map(reflowTableLine).join('\n')
    return ensureTableBlankLine(reflowed)
}

const isSepCell = c => /^:?-{2,}:?$/.test(c.replace(/\s/g, ''))

// Split a table line into its cells, dropping the empty tokens the leading/trailing
// wrapping pipes produce. Returns [] for a line with no pipe.
function tableCells(line) {
    if (!line.includes('|')) return []
    const cells = line.split('|').map(c => c.trim())
    if (cells[0] === '') cells.shift()
    if (cells.length && cells[cells.length - 1] === '') cells.pop()
    return cells
}

// A delimiter row is a pipe row whose cells are all separator cells (|---|:--:|…).
const isDelimiterRow = line => {
    const cells = tableCells(line)
    return cells.length > 0 && cells.every(isSepCell)
}

/**
 * remark-gfm only recognizes a pipe table when a blank line separates its header row
 * from the preceding paragraph — a table glued directly under a line of prose ("Here
 * are the scenarios:\n| Ticker | … |") is swallowed into that paragraph and renders as
 * inline pipe text. Insert the missing blank line before any header row (the line right
 * above a delimiter row) that a non-blank, non-table line runs straight into.
 */
function ensureTableBlankLine(md) {
    const lines = md.split('\n')
    const out = []
    for (const line of lines) {
        if (isDelimiterRow(line) && out.length >= 2) {
            const header = out[out.length - 1]
            const before = out[out.length - 2]
            if (header.includes('|') && before.trim() !== '' && !before.includes('|')) {
                out.splice(out.length - 1, 0, '')   // blank line before the header row
            }
        }
        out.push(line)
    }
    return out.join('\n')
}

function reflowTableLine(line) {
    // Cheap reject: a flattened table line must contain a pipe-delimited dash cell.
    if (!/\|\s*:?-{2,}/.test(line)) return line

    const tokens = line.split('|').map(c => c.trim())
    // Drop the empty tokens produced by the leading/trailing wrapping pipes.
    if (tokens[0] === '') tokens.shift()
    if (tokens.length && tokens[tokens.length - 1] === '') tokens.pop()

    // Column count N = length of the separator run (|---|---|…).
    const sepStart = tokens.findIndex(isSepCell)
    if (sepStart < 1) return line          // no header before the separator → not a flattened table
    let sepEnd = sepStart
    while (sepEnd + 1 < tokens.length && isSepCell(tokens[sepEnd + 1])) sepEnd++
    const N = sepEnd - sepStart + 1

    // A flattened table is rows of N cells, each followed by ONE empty boundary token
    // ("…+35% | | XLU…"). So the header is N cells then an empty token at index N.
    // Bail unless we see exactly that shape — keeps clean/multiline tables untouched.
    if (sepStart !== N + 1 || tokens[N] !== '') return line

    // Re-chunk into rows of N, skipping the single boundary token between rows. Reading
    // by a fixed count (not filtering empties) keeps blank cells in their own column.
    const rows = []
    for (let i = 0; i < tokens.length; ) {
        rows.push(tokens.slice(i, i + N))
        i += N
        if (tokens[i] === '') i++   // skip the boundary token
    }
    if (rows.length < 3) return line   // need header + separator + at least one data row

    return rows
        .map(cells => {
            while (cells.length < N) cells.push('')
            return `| ${cells.join(' | ')} |`
        })
        .join('\n')
}

