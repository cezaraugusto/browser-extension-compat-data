/**
 * Shared, scope-unaware resolver for WebExtension API usage in a JS AST.
 * Handles `chrome.*`/`browser.*` member chains plus destructuring,
 * `webextension-polyfill` imports, and simple aliasing. Works on any
 * ESTree-compatible tree (acorn output or ESLint's AST).
 */
export interface ScanNode {
  type?: string
  name?: string
  value?: unknown
  computed?: boolean
  property?: ScanNode
  object?: ScanNode
  source?: ScanNode
  init?: ScanNode
  id?: ScanNode
  key?: ScanNode
  callee?: ScanNode
  arguments?: ScanNode[]
  specifiers?: ScanNode[]
  local?: ScanNode
  properties?: ScanNode[]
  loc?: {start: {line: number; column: number}}
  [key: string]: unknown
}

export interface ScannedRef {
  path: string
  node: ScanNode
}

type Resolved = {root: true} | {path: string} | null

const POLYFILL = 'webextension-polyfill'

// Keys that are not child AST nodes (ESLint adds `parent`, which would cycle).
const SKIP_KEYS = new Set(['parent', 'loc', 'range', 'start', 'end'])

function isRequirePolyfill (node: ScanNode | undefined): boolean {
  return !!(
    node &&
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments?.[0]?.type === 'Literal' &&
    node.arguments[0].value === POLYFILL
  )
}

function walk (node: ScanNode | undefined, visit: (n: ScanNode) => void): void {
  if (!node || typeof node !== 'object') return

  visit(node)
  for (const k in node) {
    if (SKIP_KEYS.has(k)) continue

    const v = node[k]

    if (Array.isArray(v)) {
      for (const c of v) walk(c as ScanNode, visit)
    } else if (v && typeof v === 'object') {
      walk(v as ScanNode, visit)
    }
  }
}

function walkWithParent (
  node: ScanNode | undefined,
  parent: ScanNode | null,
  visit: (n: ScanNode, p: ScanNode | null) => void
): void {
  if (!node || typeof node !== 'object') return

  visit(node, parent)
  for (const k in node) {
    if (SKIP_KEYS.has(k)) continue

    const v = node[k]

    if (Array.isArray(v)) {
      for (const c of v) walkWithParent(c as ScanNode, node, visit)
    } else if (v && typeof v === 'object') {
      walkWithParent(v as ScanNode, node, visit)
    }
  }
}

function trim4 (path: string): string {
  return path.split('.').slice(0, 4).join('.')
}

export function scanApiUsage (root: ScanNode): ScannedRef[] {
  const rootAliases = new Set<string>(['chrome', 'browser'])
  const nsAliases = new Map<string, string>()

  const resolve = (node: ScanNode | undefined): Resolved => {
    if (!node) return null

    if (node.type === 'Identifier' && node.name) {
      if (rootAliases.has(node.name)) return {root: true}

      if (nsAliases.has(node.name)) return {path: nsAliases.get(node.name)!}
      return null
    }

    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property?.type === 'Identifier' &&
      node.property.name
    ) {
      const base = resolve(node.object)

      if (!base) return null

      const prop = node.property.name

      return {path: 'root' in base ? prop : `${base.path}.${prop}`}
    }
    return null
  }

  const addDestructure = (pattern: ScanNode, base: Resolved): void => {
    if (!base || pattern.type !== 'ObjectPattern' || !pattern.properties) return

    const prefix = 'root' in base ? '' : base.path

    for (const prop of pattern.properties) {
      const {key} = prop
      const val = prop.value as ScanNode | undefined

      if (
        prop.type !== 'Property' ||
        prop.computed ||
        key?.type !== 'Identifier' ||
        val?.type !== 'Identifier'
      ) {
        continue
      }

      nsAliases.set(val.name!, prefix ? `${prefix}.${key.name!}` : key.name!)
    }
  }

  // Pass 1: collect declarations + polyfill import roots.
  const declarations: ScanNode[] = []

  walk(root, (n) => {
    if (n.type === 'ImportDeclaration' && n.source?.value === POLYFILL) {
      for (const spec of n.specifiers ?? []) {
        if (
          (spec.type === 'ImportDefaultSpecifier' ||
            spec.type === 'ImportNamespaceSpecifier') &&
          spec.local?.name
        ) {
          rootAliases.add(spec.local.name)
        }
      }
    }

    if (n.type === 'VariableDeclarator') declarations.push(n)
  })
  // Two passes so chained aliases (a = chrome; b = a.tabs) resolve.
  for (let pass = 0; pass < 2; pass++) {
    for (const d of declarations) {
      const {init} = d

      if (!init) continue

      if (isRequirePolyfill(init)) {
        if (d.id?.type === 'Identifier' && d.id.name) rootAliases.add(d.id.name)
        else if (d.id?.type === 'ObjectPattern') { addDestructure(d.id, {root: true}) }

        continue
      }

      const base = resolve(init)

      if (!base) continue

      if (d.id?.type === 'Identifier' && d.id.name) {
        if ('root' in base) rootAliases.add(d.id.name)
        else nsAliases.set(d.id.name, base.path)
      } else if (d.id?.type === 'ObjectPattern') {
        addDestructure(d.id, base)
      }
    }
  }

  // Pass 2: collect usages at the top of each member chain + destructured refs.
  const seen = new Map<string, ScannedRef>()
  const record = (path: string, node: ScanNode) => {
    const trimmed = trim4(path)
    const loc = node.loc?.start
    const dedupe = `${trimmed}@${loc ? `${loc.line}:${loc.column}` : ''}`

    if (!seen.has(dedupe)) seen.set(dedupe, {path: trimmed, node})
  }

  walkWithParent(root, null, (node, parent) => {
    if (node.type === 'MemberExpression') {
      const isChainTop = !(
        parent?.type === 'MemberExpression' && parent.object === node
      )

      if (!isChainTop) return

      const r = resolve(node)

      if (r && 'path' in r) record(r.path, node)
      return
    }

    if (node.type === 'Identifier' && node.name && nsAliases.has(node.name)) {
      if (parent?.type === 'Property') return

      if (parent?.type === 'VariableDeclarator' && parent.id === node) return

      if (
        parent?.type === 'ImportSpecifier' ||
        parent?.type === 'ImportDefaultSpecifier'
      ) { return }

      // Part of a member chain (alias.foo / foo.alias); the chain top records the full path.
      if (parent?.type === 'MemberExpression') return

      record(nsAliases.get(node.name)!, node)
    }
  })

  return Array.from(seen.values())
}
