import * as fs from 'fs'
import * as path from 'path'
import {fileURLToPath} from 'url'

import type {CompactFeature, CompactIndex, Domain} from './types'

/**
 * The compact MDN index ships as a single JSON asset next to the built module
 * (rather than inlined into every bundle format), so there is no runtime fetch
 * and the data is stored only once on disk. It is read lazily on first use.
 * Tests and advanced consumers can swap the active index via
 * {@link setIndex}/{@link setIndexFromFile}.
 */
const EMPTY: CompactIndex = {
  v: 'empty',
  manifest: {},
  api: {},
  permissions: {}
}

function moduleDir (): string {
  // Prefer ESM `import.meta.url`; fall back to CJS `__dirname`.
  let metaUrl: string | undefined

  try {
    metaUrl = (import.meta as {url?: string}).url
  } catch {
    metaUrl = undefined
  }

  if (metaUrl) return path.dirname(fileURLToPath(metaUrl))

  if (typeof __dirname !== 'undefined') return __dirname
  return process.cwd()
}

function loadDefaultIndex (): CompactIndex {
  const dir = moduleDir()
  const candidates = [
    path.join(dir, 'index.json'), // Built layout: dist/index.json
    path.join(dir, 'generated', 'index.json') // Source layout: src/generated/index.json
  ]

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as CompactIndex
      }
    } catch {
      // Try the next candidate
    }
  }

  return EMPTY
}

let current: CompactIndex | null = null
let namespaceCache: Set<string> | null = null

function active (): CompactIndex {
  if (!current) current = loadDefaultIndex()
  return current
}

export function getIndex (): CompactIndex {
  return active()
}

/** Replace the active index (used by tests and consumers with custom data). */
export function setIndex (index: CompactIndex): void {
  current = index
  namespaceCache = null
}

/** Load and activate an index from a JSON file on disk. */
export function setIndexFromFile (filePath: string): void {
  setIndex(JSON.parse(fs.readFileSync(filePath, 'utf8')) as CompactIndex)
}

/** Restore the index that ships with the package. */
export function resetIndex (): void {
  current = null
  namespaceCache = null
}

/** Look up a single flattened feature by domain and dotted key. */
export function getFeature (domain: Domain, key: string): CompactFeature | null {
  const map = active()[domain]

  if (!map) return null
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null
}

/** All keys indexed for a domain. */
export function listKeys (domain: Domain): string[] {
  return Object.keys(active()[domain] ?? {})
}

/** Top-level API namespaces present in the index (e.g. `runtime`, `tabs`). */
export function apiNamespaces (): Set<string> {
  if (namespaceCache) return namespaceCache

  const set = new Set<string>()

  for (const key of Object.keys(active().api ?? {})) {
    set.add(key.split('.')[0])
  }

  namespaceCache = set

  return set
}
