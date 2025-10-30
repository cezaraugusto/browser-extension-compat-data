import * as fs from 'fs'
import * as path from 'path'

export interface AnalyzeOptions {
  strict?: boolean
  includePartialAsUnsupported?: boolean // default false
}

export type SimpleSupportStatement = {
  version_added: string | boolean | null
  version_removed?: string | boolean | null
  flags?: unknown
  notes?: string | string[]
  prefix?: string
  alternative_name?: string
  partial_implementation?: boolean
}

export type BrowserSupportMap = Record<
  string,
  SimpleSupportStatement | SimpleSupportStatement[]
>

export interface UnsupportedItem {
  kind: 'manifest' | 'permission' | 'api'
  key: string
  path: string
  reason: 'not-supported' | 'removed' | 'partial' | 'no-compat-data'
  support?: BrowserSupportMap
  mdnUrl?: string
}

type ManifestIndex = Map<string, { compatPath: string; node: any }>
type PermissionIndex = Map<string, { compatPath: string; node: any }>
type APIIndex = Map<
  string,
  {
    compatPath: string
    node: any
    sub: Map<string, { compatPath: string; node: any }>
    deep?: Map<string, { compatPath: string; node: any }>
  }
>

function dataRoot(): string {
  // Fixed location per requirements
  return path.resolve(process.cwd(), 'data', 'webextensions')
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

function readJSON(file: string): any {
  const raw = fs.readFileSync(file, 'utf8')
  return JSON.parse(raw)
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

type SupportState = {
  state: 'supported' | 'unsupported' | 'removed' | 'partial' | 'unknown'
  reason?: UnsupportedItem['reason']
}

function getSupportStateForBrowser(
  support: BrowserSupportMap | undefined,
  browser: string,
  includePartialAsUnsupported?: boolean,
): SupportState {
  if (!support) return { state: 'unknown' }

  const raw = support[browser]
  const list = toArray<SimpleSupportStatement>(raw)

  if (list.length === 0) return { state: 'unknown' }

  for (const s of list) {
    const added = s.version_added
    const removed = s.version_removed
    const partial = !!s.partial_implementation
    const isAdded = added === true || typeof added === 'string'
    const isRemoved = removed === true || typeof removed === 'string'

    if (isAdded && !isRemoved) {
      if (includePartialAsUnsupported && partial)
        return { state: 'partial', reason: 'partial' }
      return { state: 'supported' }
    }
  }

  if (
    list.some(
      (s) =>
        s.version_removed === true || typeof s.version_removed === 'string',
    )
  ) {
    return { state: 'removed', reason: 'removed' }
  }

  if (
    list.every((s) => s.version_added === false || s.version_added === null)
  ) {
    return { state: 'unsupported', reason: 'not-supported' }
  }

  return { state: 'unknown' }
}

async function buildIndexes(dataDir: string): Promise<{
  manifestIndex: ManifestIndex
  permissionIndex: PermissionIndex
  apiIndex: APIIndex
}> {
  const manifestIndex: ManifestIndex = new Map()
  const permissionIndex: PermissionIndex = new Map()
  const apiIndex: APIIndex = new Map()

  const manifestDir = path.join(dataDir, 'manifest')
  const permissionsDir = path.join(dataDir, 'permissions')
  const apiDir = path.join(dataDir, 'api')

  if (await pathExists(manifestDir)) {
    const files = await fs.promises.readdir(manifestDir)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const json = readJSON(path.join(manifestDir, file))
      const root = json?.webextensions?.manifest
      if (!root || typeof root !== 'object') continue
      for (const key of Object.keys(root)) {
        const node = root[key]
        manifestIndex.set(key, {
          compatPath: `webextensions.manifest.${key}`,
          node,
        })
      }
    }
  }

  if (await pathExists(permissionsDir)) {
    const files = await fs.promises.readdir(permissionsDir)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const json = readJSON(path.join(permissionsDir, file))
      const root = json?.webextensions?.permissions
      if (!root || typeof root !== 'object') continue
      for (const key of Object.keys(root)) {
        const node = root[key]
        permissionIndex.set(key, {
          compatPath: `webextensions.permissions.${key}`,
          node,
        })
      }
    }
  }

  if (await pathExists(apiDir)) {
    const files = await fs.promises.readdir(apiDir)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const json = readJSON(path.join(apiDir, file))
      const apiRoot = json?.webextensions?.api
      if (!apiRoot || typeof apiRoot !== 'object') continue
      for (const ns of Object.keys(apiRoot)) {
        const node = apiRoot[ns]
        const sub: Map<string, { compatPath: string; node: any }> = new Map()
        const deep: Map<string, { compatPath: string; node: any }> = new Map()
        if (node && typeof node === 'object') {
          for (const subKey of Object.keys(node)) {
            if (subKey === '__compat') continue
            const subNode = node[subKey]
            if (
              subNode &&
              typeof subNode === 'object' &&
              '__compat' in subNode
            ) {
              sub.set(subKey, {
                compatPath: `webextensions.api.${ns}.${subKey}`,
                node: subNode,
              })
            }
            if (subNode && typeof subNode === 'object') {
              for (const deepKey of Object.keys(subNode)) {
                if (deepKey === '__compat') continue
                const deepNode = (subNode as any)[deepKey]
                if (
                  deepNode &&
                  typeof deepNode === 'object' &&
                  '__compat' in deepNode
                ) {
                  deep.set(`${subKey}.${deepKey}`, {
                    compatPath: `webextensions.api.${ns}.${subKey}.${deepKey}`,
                    node: deepNode,
                  })
                }
              }
            }
          }
        }
        apiIndex.set(ns, {
          compatPath: `webextensions.api.${ns}`,
          node,
          sub,
          deep,
        })
      }
    }
  }

  return { manifestIndex, permissionIndex, apiIndex }
}

function extractCompat(
  node: any,
  compatPath: string,
): { path: string; support?: BrowserSupportMap; mdnUrl?: string } | null {
  if (!node || typeof node !== 'object') return null
  const compat = node.__compat
  if (!compat || typeof compat !== 'object')
    return { path: compatPath, support: undefined }
  return {
    path: compatPath,
    support: compat.support as BrowserSupportMap,
    mdnUrl: (compat as any).mdn_url as string | undefined,
  }
}

const MANIFEST_KEY_MAP: Record<string, string[]> = {
  action: ['action'],
  browser_action: ['browser_action'],
  page_action: ['page_action'],
  background: ['background'],
  devtools_page: ['devtools_page'],
  options_ui: ['options_ui'],
  options_page: ['options_page'],
  side_panel: ['side_panel'],
  sidebar_action: ['sidebar_action'],
  chrome_url_overrides: [
    'chrome_url_overrides',
    'chrome_url_overrides.newtab',
    'chrome_url_overrides.bookmarks',
    'chrome_url_overrides.history',
  ],
  sandbox: ['sandbox'],
  web_accessible_resources: ['web_accessible_resources'],
  omnibox: ['omnibox'],
  commands: ['commands'],
  chrome_settings_overrides: [
    'chrome_settings_overrides',
    'chrome_settings_overrides.homepage',
    'chrome_settings_overrides.search_provider',
    'chrome_settings_overrides.startup_pages',
  ],
  declarative_net_request: ['declarative_net_request'],
  tts_engine: ['tts_engine'],
}

export async function getUnsupportedManifest(
  manifestPath: string,
  browser: string,
  options?: AnalyzeOptions,
): Promise<UnsupportedItem[]> {
  const dir = dataRoot()
  if (!(await pathExists(dir))) {
    const msg = `Compat data dir not found: ${dir}.`
    if (options?.strict) throw new Error(msg)
    console.warn(msg)
  }

  const { manifestIndex, permissionIndex } = await buildIndexes(dir)

  const content = await fs.promises.readFile(manifestPath, 'utf8')
  const obj = JSON.parse(content) as Record<string, unknown>

  const out: UnsupportedItem[] = []

  for (const key of Object.keys(MANIFEST_KEY_MAP)) {
    if (!(key in obj)) continue
    for (const bcdKey of MANIFEST_KEY_MAP[key]) {
      const [base, sub] = bcdKey.split('.')
      const entry = manifestIndex.get(base)
      if (!entry) {
        out.push({
          kind: 'manifest',
          key: bcdKey,
          path: `webextensions.manifest.${bcdKey}`,
          reason: 'no-compat-data',
        })
        continue
      }
      if (sub) {
        const subNode = (entry.node as any)?.[sub]
        const compat = extractCompat(
          subNode,
          `webextensions.manifest.${bcdKey}`,
        )
        if (!compat) {
          out.push({
            kind: 'manifest',
            key: bcdKey,
            path: `webextensions.manifest.${bcdKey}`,
            reason: 'no-compat-data',
          })
          continue
        }
        const s = getSupportStateForBrowser(
          compat.support,
          browser,
          options?.includePartialAsUnsupported,
        )
        if (
          s.state === 'unsupported' ||
          s.state === 'removed' ||
          s.state === 'partial'
        ) {
          out.push({
            kind: 'manifest',
            key: bcdKey,
            path: compat.path,
            reason: s.reason ?? 'not-supported',
            support: compat.support,
            mdnUrl: compat.mdnUrl,
          })
        }
      } else {
        const compat = extractCompat(entry.node, entry.compatPath)
        if (!compat) {
          out.push({
            kind: 'manifest',
            key: base,
            path: entry.compatPath,
            reason: 'no-compat-data',
          })
          continue
        }
        const s = getSupportStateForBrowser(
          compat.support,
          browser,
          options?.includePartialAsUnsupported,
        )
        if (
          s.state === 'unsupported' ||
          s.state === 'removed' ||
          s.state === 'partial'
        ) {
          out.push({
            kind: 'manifest',
            key: base,
            path: compat.path,
            reason: s.reason ?? 'not-supported',
            support: compat.support,
            mdnUrl: compat.mdnUrl,
          })
        }
      }
    }
  }

  const perms = Array.isArray((obj as any).permissions)
    ? ((obj as any).permissions as unknown[])
    : []
  for (const permRaw of perms) {
    const perm = String(permRaw)
    const entry = permissionIndex.get(perm)
    if (!entry) {
      out.push({
        kind: 'permission',
        key: perm,
        path: `webextensions.permissions.${perm}`,
        reason: 'no-compat-data',
      })
      continue
    }
    const compat = extractCompat(entry.node, entry.compatPath)
    const s = getSupportStateForBrowser(
      compat?.support,
      browser,
      options?.includePartialAsUnsupported,
    )
    if (
      s.state === 'unsupported' ||
      s.state === 'removed' ||
      s.state === 'partial'
    ) {
      out.push({
        kind: 'permission',
        key: perm,
        path: compat!.path,
        reason: s.reason ?? 'not-supported',
        support: compat?.support,
        mdnUrl: compat?.mdnUrl,
      })
    }
  }

  return out
}

export async function getUnsupportedAPIsFromFile(
  filePath: string,
  browser: string,
  options?: AnalyzeOptions,
): Promise<UnsupportedItem[]> {
  const dir = dataRoot()
  if (!(await pathExists(dir))) {
    const msg = `Compat data dir not found: ${dir}.`
    if (options?.strict) throw new Error(msg)
    console.warn(msg)
  }

  const { apiIndex } = await buildIndexes(dir)
  const content = await fs.promises.readFile(filePath, 'utf8')
  const out: UnsupportedItem[] = []
  const seen = new Set<string>()

  try {
    const acorn = await import('acorn')
    const ast: any = (acorn as any).parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
    const stack: any[] = [ast]
    while (stack.length) {
      const node = stack.pop()
      if (!node || typeof node !== 'object') continue
      if ((node as any).type === 'MemberExpression') {
        const names: string[] = []
        let cur: any = node
        while (cur && cur.type === 'MemberExpression') {
          if (cur.property?.type === 'Identifier')
            names.unshift(cur.property.name)
          cur = cur.object
        }
        if (
          cur &&
          cur.type === 'Identifier' &&
          (cur.name === 'chrome' || cur.name === 'browser')
        ) {
          if (names.length >= 1) {
            const ns = names[0]
            const id = names.length >= 2 ? `${ns}.${names[1]}` : ns
            const deepId =
              names.length >= 3 ? `${ns}.${names[1]}.${names[2]}` : null
            const toCheck = deepId ?? id
            if (!seen.has(toCheck)) {
              seen.add(toCheck)
              const api = apiIndex.get(ns)
              if (!api) {
                out.push({
                  kind: 'api',
                  key: toCheck,
                  path: `webextensions.api.${toCheck}`,
                  reason: 'no-compat-data',
                })
              } else if (
                deepId &&
                api.deep &&
                api.deep.has(`${names[1]}.${names[2]}`)
              ) {
                const de = api.deep.get(`${names[1]}.${names[2]}`)!
                const compat = extractCompat(de.node, de.compatPath)
                const s = getSupportStateForBrowser(
                  compat?.support,
                  browser,
                  options?.includePartialAsUnsupported,
                )
                if (
                  s.state === 'unsupported' ||
                  s.state === 'removed' ||
                  s.state === 'partial'
                ) {
                  out.push({
                    kind: 'api',
                    key: toCheck,
                    path: compat!.path,
                    reason: s.reason ?? 'not-supported',
                    support: compat?.support,
                    mdnUrl: compat?.mdnUrl,
                  })
                }
              } else if (id.includes('.') && api.sub.has(id.split('.')[1])) {
                const se = api.sub.get(id.split('.')[1])!
                const compat = extractCompat(se.node, se.compatPath)
                const s = getSupportStateForBrowser(
                  compat?.support,
                  browser,
                  options?.includePartialAsUnsupported,
                )
                if (
                  s.state === 'unsupported' ||
                  s.state === 'removed' ||
                  s.state === 'partial'
                ) {
                  out.push({
                    kind: 'api',
                    key: id,
                    path: compat!.path,
                    reason: s.reason ?? 'not-supported',
                    support: compat?.support,
                    mdnUrl: compat?.mdnUrl,
                  })
                }
              } else {
                const compat = extractCompat(api.node, api.compatPath)
                const s = getSupportStateForBrowser(
                  compat?.support,
                  browser,
                  options?.includePartialAsUnsupported,
                )
                if (
                  s.state === 'unsupported' ||
                  s.state === 'removed' ||
                  s.state === 'partial'
                ) {
                  out.push({
                    kind: 'api',
                    key: ns,
                    path: compat!.path,
                    reason: s.reason ?? 'not-supported',
                    support: compat?.support,
                    mdnUrl: compat?.mdnUrl,
                  })
                }
              }
            }
          }
        }
      }
      for (const k in node) {
        const v = (node as any)[k]
        if (v && typeof v === 'object') {
          if (Array.isArray(v)) stack.push(...v)
          else stack.push(v)
        }
      }
    }
  } catch {
    const re =
      /\b(?:chrome|browser)\.([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?)?/g
    let m: RegExpExecArray | null
    while ((m = re.exec(content))) {
      const ns = m[1]
      const sub = m[2]
      const deep = m[3]
      const toCheck = deep ? `${ns}.${sub}.${deep}` : sub ? `${ns}.${sub}` : ns
      if (seen.has(toCheck)) continue
      seen.add(toCheck)
      const api = apiIndex.get(ns)
      if (!api) {
        out.push({
          kind: 'api',
          key: toCheck,
          path: `webextensions.api.${toCheck}`,
          reason: 'no-compat-data',
        })
        continue
      }
      if (deep && api.deep && api.deep.has(`${sub}.${deep}`)) {
        const de = api.deep.get(`${sub}.${deep}`)!
        const compat = extractCompat(de.node, de.compatPath)
        const s = getSupportStateForBrowser(
          compat?.support,
          browser,
          options?.includePartialAsUnsupported,
        )
        if (
          s.state === 'unsupported' ||
          s.state === 'removed' ||
          s.state === 'partial'
        ) {
          out.push({
            kind: 'api',
            key: toCheck,
            path: compat!.path,
            reason: s.reason ?? 'not-supported',
            support: compat?.support,
            mdnUrl: compat?.mdnUrl,
          })
        }
        continue
      }
      if (sub && api.sub.has(sub)) {
        const se = api.sub.get(sub)!
        const compat = extractCompat(se.node, se.compatPath)
        const s = getSupportStateForBrowser(
          compat?.support,
          browser,
          options?.includePartialAsUnsupported,
        )
        if (
          s.state === 'unsupported' ||
          s.state === 'removed' ||
          s.state === 'partial'
        ) {
          out.push({
            kind: 'api',
            key: `${ns}.${sub}`,
            path: compat!.path,
            reason: s.reason ?? 'not-supported',
            support: compat?.support,
            mdnUrl: compat?.mdnUrl,
          })
        }
        continue
      }
      const compat = extractCompat(api.node, api.compatPath)
      const s = getSupportStateForBrowser(
        compat?.support,
        browser,
        options?.includePartialAsUnsupported,
      )
      if (
        s.state === 'unsupported' ||
        s.state === 'removed' ||
        s.state === 'partial'
      ) {
        out.push({
          kind: 'api',
          key: ns,
          path: compat!.path,
          reason: s.reason ?? 'not-supported',
          support: compat?.support,
          mdnUrl: compat?.mdnUrl,
        })
      }
    }
  }

  return out
}

// Utilities: browser keys
export async function listBrowsers(): Promise<string[]> {
  const dir = dataRoot()
  const { manifestIndex, permissionIndex, apiIndex } = await buildIndexes(dir)
  const keys = new Set<string>()
  for (const [, { node }] of manifestIndex) {
    const c = extractCompat(node, '')
    if (c?.support) Object.keys(c.support).forEach((k) => keys.add(k))
  }
  for (const [, { node }] of permissionIndex) {
    const c = extractCompat(node, '')
    if (c?.support) Object.keys(c.support).forEach((k) => keys.add(k))
  }
  for (const [, v] of apiIndex) {
    const c = extractCompat(v.node, '')
    if (c?.support) Object.keys(c.support).forEach((k) => keys.add(k))
  }
  return Array.from(keys.values()).sort()
}

export async function hasBrowserKey(key: string): Promise<boolean> {
  const list = await listBrowsers()
  return list.includes(key)
}

// Feature path helpers
function getNodeByPathFromIndexes(
  idx: {
    manifestIndex: ManifestIndex
    permissionIndex: PermissionIndex
    apiIndex: APIIndex
  },
  featurePath: string,
): any | null {
  const parts = featurePath.split('.')
  if (parts.length < 3 || parts[0] !== 'webextensions') return null
  if (parts[1] === 'manifest') {
    const key = parts[2]
    const entry = idx.manifestIndex.get(key)
    if (!entry) return null
    if (parts.length === 3) return entry.node
    return (entry.node as any)[parts.slice(3).join('.')]
  }
  if (parts[1] === 'permissions') {
    const key = parts[2]
    const entry = idx.permissionIndex.get(key)
    return entry?.node ?? null
  }
  if (parts[1] === 'api') {
    const ns = parts[2]
    const entry = idx.apiIndex.get(ns)
    if (!entry) return null
    if (parts.length === 3) return entry.node
    const rest = parts.slice(3)
    if (rest.length === 1) return (entry.node as any)[rest[0]]
    if (rest.length === 2)
      return ((entry.node as any)[rest[0]] as any)?.[rest[1]]
  }
  return null
}

export async function getMinSupportedVersion(
  featurePath: string,
  browser: string,
): Promise<string | null> {
  const dir = dataRoot()
  const idx = await buildIndexes(dir)
  const node = getNodeByPathFromIndexes(idx, featurePath)
  const compat = extractCompat(node, featurePath)
  const s = compat?.support?.[browser]
  const list = Array.isArray(s)
    ? (s as SimpleSupportStatement[])
    : s
      ? [s as SimpleSupportStatement]
      : []
  for (const st of list) {
    if (st.version_added === true) return 'true'
    if (typeof st.version_added === 'string') return st.version_added
  }
  return null
}

function parseNumericVersion(v: string): number {
  const m = v.match(/\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : NaN
}

export async function isSupported(
  featurePath: string,
  browser: string,
  version?: string,
): Promise<boolean> {
  const dir = dataRoot()
  const idx = await buildIndexes(dir)
  const node = getNodeByPathFromIndexes(idx, featurePath)
  const compat = extractCompat(node, featurePath)
  const state = getSupportStateForBrowser(compat?.support, browser, false)
  if (state.state !== 'supported') return false
  if (!version) return true
  const min = await getMinSupportedVersion(featurePath, browser)
  if (!min || min === 'true') return true
  const minN = parseNumericVersion(min)
  const targetN = parseNumericVersion(version)
  if (Number.isNaN(minN) || Number.isNaN(targetN)) return true
  return targetN >= minN
}

// Batch analyzers
export async function analyzeFiles(
  files: string[],
  browser: string,
  options?: AnalyzeOptions,
): Promise<UnsupportedItem[]> {
  const results: UnsupportedItem[] = []
  for (const f of files) {
    const r = await getUnsupportedAPIsFromFile(f, browser, options)
    results.push(...r)
  }
  return results
}

export async function analyzeProject(args: {
  files: string[]
  manifestPath?: string
  browser: string
  options?: AnalyzeOptions
}): Promise<{
  unsupported: UnsupportedItem[]
  missingPermissions: string[]
  unusedPermissions: string[]
}> {
  const { files, manifestPath, browser, options } = args
  const unsupported = await analyzeFiles(files, browser, options)
  const usedNamespaces = new Set<string>(
    unsupported.filter((u) => u.kind === 'api').map((u) => u.key.split('.')[0]),
  )
  const requirePerm: Record<string, string> = {
    tabs: 'tabs',
    storage: 'storage',
    history: 'history',
    bookmarks: 'bookmarks',
    downloads: 'downloads',
    notifications: 'notifications',
    cookies: 'cookies',
    scripting: 'scripting',
    webRequest: 'webRequest',
    declarativeNetRequest: 'declarativeNetRequest',
  }
  const required = new Set<string>()
  for (const ns of usedNamespaces) {
    const p = requirePerm[ns]
    if (p) required.add(p)
  }
  let declared = new Set<string>()
  if (manifestPath && (await pathExists(manifestPath))) {
    const obj = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'))
    const arr = Array.isArray((obj as any).permissions)
      ? ((obj as any).permissions as unknown[] as string[])
      : []
    declared = new Set(arr)
  }
  const missingPermissions = Array.from(required).filter(
    (p) => !declared.has(p),
  )
  const unusedPermissions = Array.from(declared).filter((p) => !required.has(p))
  return { unsupported, missingPermissions, unusedPermissions }
}

// Targets and baseline matrix
export type TargetMatrix = Record<string, string>
export interface BaselineMatrixEntry {
  unsupported: UnsupportedItem[]
  counts: {
    unsupported: number
    removed: number
    partial: number
    noCompat: number
  }
}

export async function generateBaselineMatrix(args: {
  files: string[]
  manifestPath?: string
  targets: TargetMatrix
  options?: AnalyzeOptions
}): Promise<Record<string, BaselineMatrixEntry>> {
  const { files, manifestPath, targets, options } = args
  const result: Record<string, BaselineMatrixEntry> = {}
  for (const browser of Object.keys(targets)) {
    const unsupported = [
      ...(manifestPath
        ? await getUnsupportedManifest(manifestPath, browser, options)
        : []),
      ...(await analyzeFiles(files, browser, options)),
    ]
    const counts = {
      unsupported: unsupported.filter((i) => i.reason === 'not-supported')
        .length,
      removed: unsupported.filter((i) => i.reason === 'removed').length,
      partial: unsupported.filter((i) => i.reason === 'partial').length,
      noCompat: unsupported.filter((i) => i.reason === 'no-compat-data').length,
    }
    result[browser] = { unsupported, counts }
  }
  return result
}

// Severity mapping
export type Severity = 'error' | 'warn' | 'info'
export interface SeverityPolicy {
  removed?: Severity
  'not-supported'?: Severity
  partial?: Severity
  'no-compat-data'?: Severity
}
export function mapSeverity(
  reason: UnsupportedItem['reason'],
  policy?: SeverityPolicy,
): Severity {
  const defaults: SeverityPolicy = {
    removed: 'error',
    'not-supported': 'warn',
    partial: 'info',
    'no-compat-data': 'warn',
  }
  return (policy && (policy as any)[reason]) || (defaults as any)[reason]
}

// Reporters
export function toNDJSON(items: UnsupportedItem[]): string {
  return items.map((i) => JSON.stringify(i)).join('\n')
}

export function toJUnitXML(
  items: UnsupportedItem[],
  suiteName = 'compat-data',
): string {
  const cases = items
    .map((i) => {
      const name = `${i.kind}:${i.key}`
      const msg = `${i.reason} at ${i.path}`
      return `<testcase name="${escapeXML(name)}"><failure message="${escapeXML(msg)}"/></testcase>`
    })
    .join('')
  return `<testsuite name="${escapeXML(suiteName)}" tests="${items.length}">${cases}</testsuite>`
}

export function toSARIF(
  items: UnsupportedItem[],
  options?: { toolName?: string; policy?: SeverityPolicy },
): any {
  const toolName = options?.toolName ?? 'browser-extension-compat-data'
  const runs = [
    {
      tool: { driver: { name: toolName, rules: [] as any[] } },
      results: items.map((i) => ({
        ruleId: `${i.kind}:${i.key}`,
        level: mapSeverity(i.reason, options?.policy),
        message: { text: `${i.reason} - ${i.path}` },
        properties: { mdnUrl: i.mdnUrl },
      })),
    },
  ]
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs,
  }
}

function escapeXML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Precomputed index
export async function buildPrecomputedIndex(outFile?: string): Promise<string> {
  const dir = dataRoot()
  const idx = await buildIndexes(dir)
  const data = {
    manifest: Array.from(idx.manifestIndex.entries()).map(([k, v]) => [
      k,
      v.compatPath,
    ]),
    permissions: Array.from(idx.permissionIndex.entries()).map(([k, v]) => [
      k,
      v.compatPath,
    ]),
    api: Array.from(idx.apiIndex.entries()).map(([k, v]) => [k, v.compatPath]),
  }
  const file = outFile ?? path.join(dir, '..', 'webextensions.index.json')
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, JSON.stringify(data))
  return file
}
