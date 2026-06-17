export interface InlineScript {
  content: string
  /** 1-based line in the HTML where the inline script body starts. */
  line: number
}

export interface HtmlScripts {
  /** `src` values of external `<script src=...>` tags (as written in the HTML). */
  external: string[]
  /** Inline `<script>...</script>` bodies that aren't JSON/importmap. */
  inline: InlineScript[]
}

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const SRC_RE = /\bsrc\s*=\s*["']?([^"'\s>]+)/i
const TYPE_RE = /\btype\s*=\s*["']?([^"'\s>]+)/i

const NON_JS_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'importmap',
  'text/html',
  'text/template'
])

/** Extract external and inline scripts from an HTML document (regex-based, zero-dep). */
export function extractScripts (html: string): HtmlScripts {
  const external: string[] = []
  const inline: InlineScript[] = []
  let match: RegExpExecArray | null

  SCRIPT_RE.lastIndex = 0
  while ((match = SCRIPT_RE.exec(html))) {
    const attrs = match[1] ?? ''
    const body = match[2] ?? ''
    const type = attrs.match(TYPE_RE)?.[1]?.toLowerCase()

    if (type && NON_JS_TYPES.has(type)) continue

    const src = attrs.match(SRC_RE)?.[1]

    if (src) {
      external.push(src)
      continue
    }

    if (body.trim()) {
      const before = html.slice(0, match.index + match[0].indexOf(body))
      const line = before.split('\n').length

      inline.push({content: body, line})
    }
  }

  return {external, inline}
}
