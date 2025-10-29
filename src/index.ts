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

export type BrowserSupportMap = Record<string, SimpleSupportStatement | SimpleSupportStatement[]>

export interface UnsupportedItem {
  kind: 'manifest' | 'permission' | 'api'
  key: string
  path: string
  reason: 'not-supported' | 'removed' | 'partial' | 'no-compat-data'
  support?: BrowserSupportMap
}

type ManifestIndex = Map<string, { compatPath: string; node: any }>
type PermissionIndex = Map<string, { compatPath: string; node: any }>
type APIIndex = Map<string, { compatPath: string; node: any; sub: Map<string, { compatPath: string; node: any }> }>

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

type SupportState = { state: 'supported' | 'unsupported' | 'removed' | 'partial' | 'unknown'; reason?: UnsupportedItem['reason'] }

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
      if (includePartialAsUnsupported && partial) return { state: 'partial', reason: 'partial' }
      return { state: 'supported' }
    }
  }

  if (list.some((s) => s.version_removed === true || typeof s.version_removed === 'string')) {
    return { state: 'removed', reason: 'removed' }
  }

  if (list.every((s) => s.version_added === false || s.version_added === null)) {
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
        if (node && typeof node === 'object') {
          for (const subKey of Object.keys(node)) {
            if (subKey === '__compat') continue
            const subNode = node[subKey]
            if (subNode && typeof subNode === 'object' && '__compat' in subNode) {
              sub.set(subKey, {
                compatPath: `webextensions.api.${ns}.${subKey}`,
                node: subNode,
              })
            }
          }
        }
        apiIndex.set(ns, {
          compatPath: `webextensions.api.${ns}`,
          node,
          sub,
        })
      }
    }
  }

  return { manifestIndex, permissionIndex, apiIndex }
}

function extractCompat(node: any, compatPath: string): { path: string; support?: BrowserSupportMap } | null {
  if (!node || typeof node !== 'object') return null
  const compat = node.__compat
  if (!compat || typeof compat !== 'object') return { path: compatPath, support: undefined }
  return { path: compatPath, support: compat.support as BrowserSupportMap }
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
        out.push({ kind: 'manifest', key: bcdKey, path: `webextensions.manifest.${bcdKey}`, reason: 'no-compat-data' })
        continue
      }
      if (sub) {
        const subNode = (entry.node as any)?.[sub]
        const compat = extractCompat(subNode, `webextensions.manifest.${bcdKey}`)
        if (!compat) {
          out.push({ kind: 'manifest', key: bcdKey, path: `webextensions.manifest.${bcdKey}`, reason: 'no-compat-data' })
          continue
        }
        const s = getSupportStateForBrowser(compat.support, browser, options?.includePartialAsUnsupported)
        if (s.state === 'unsupported' || s.state === 'removed' || s.state === 'partial') {
          out.push({ kind: 'manifest', key: bcdKey, path: compat.path, reason: s.reason ?? 'not-supported', support: compat.support })
        }
      } else {
        const compat = extractCompat(entry.node, entry.compatPath)
        if (!compat) {
          out.push({ kind: 'manifest', key: base, path: entry.compatPath, reason: 'no-compat-data' })
          continue
        }
        const s = getSupportStateForBrowser(compat.support, browser, options?.includePartialAsUnsupported)
        if (s.state === 'unsupported' || s.state === 'removed' || s.state === 'partial') {
          out.push({ kind: 'manifest', key: base, path: compat.path, reason: s.reason ?? 'not-supported', support: compat.support })
        }
      }
    }
  }

  const perms = Array.isArray((obj as any).permissions) ? ((obj as any).permissions as unknown[]) : []
  for (const permRaw of perms) {
    const perm = String(permRaw)
    const entry = permissionIndex.get(perm)
    if (!entry) {
      out.push({ kind: 'permission', key: perm, path: `webextensions.permissions.${perm}`, reason: 'no-compat-data' })
      continue
    }
    const compat = extractCompat(entry.node, entry.compatPath)
    const s = getSupportStateForBrowser(compat?.support, browser, options?.includePartialAsUnsupported)
    if (s.state === 'unsupported' || s.state === 'removed' || s.state === 'partial') {
      out.push({ kind: 'permission', key: perm, path: compat!.path, reason: s.reason ?? 'not-supported', support: compat?.support })
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
  const re = /\b(?:chrome|browser)\.([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?/g
  const seen = new Set<string>()
  const out: UnsupportedItem[] = []

  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const ns = m[1]
    const sub = m[2]
    const id = sub ? `${ns}.${sub}` : ns
    if (seen.has(id)) continue
    seen.add(id)

    const api = apiIndex.get(ns)
    if (!api) {
      out.push({ kind: 'api', key: id, path: `webextensions.api.${id}`, reason: 'no-compat-data' })
      continue
    }

    if (sub && api.sub.has(sub)) {
      const subEntry = api.sub.get(sub)!
      const compat = extractCompat(subEntry.node, subEntry.compatPath)
      const s = getSupportStateForBrowser(compat?.support, browser, options?.includePartialAsUnsupported)
      if (s.state === 'unsupported' || s.state === 'removed' || s.state === 'partial') {
        out.push({ kind: 'api', key: id, path: compat!.path, reason: s.reason ?? 'not-supported', support: compat?.support })
      }
      continue
    }

    const compat = extractCompat(api.node, api.compatPath)
    const s = getSupportStateForBrowser(compat?.support, browser, options?.includePartialAsUnsupported)
    if (s.state === 'unsupported' || s.state === 'removed' || s.state === 'partial') {
      out.push({ kind: 'api', key: ns, path: compat!.path, reason: s.reason ?? 'not-supported', support: compat?.support })
    }
  }

  return out
}
