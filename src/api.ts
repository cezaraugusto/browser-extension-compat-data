import * as fs from 'fs'

import {apiNamespaces, getFeature} from './store'
import {normalizeFeature, verdictForBrowser} from './compat'
import {assertBrowser} from './browsers'
import {scanApiUsage} from './scan-ast'

import type {ScanNode} from './scan-ast'
import type {
  Browser,
  CompactFeature,
  FileOptions,
  SourceLocation,
  UnsupportedItem
} from './types'

export interface Candidate {
  path: string
  loc?: SourceLocation
}

const API_MEMBER_REGEX =
  /\b(?:chrome|browser)\.([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?)?)?/g

function regexCandidates (
  content: string,
  namespaces: Set<string>
): Candidate[] {
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  API_MEMBER_REGEX.lastIndex = 0
  while ((match = API_MEMBER_REGEX.exec(content))) {
    const segs = [match[1], match[2], match[3], match[4]].filter(
      Boolean
    ) as string[]

    if (namespaces.has(segs[0])) seen.add(segs.join('.'))
  }

  return Array.from(seen, (path) => ({path}))
}

type ParseFn = (s: string, o: object) => ScanNode

async function accurateCandidates (content: string): Promise<Candidate[]> {
  const {parse} = (await import('acorn')) as unknown as {parse: ParseFn}
  const ast = parse(content, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowHashBang: true,
    locations: true
  })

  return scanApiUsage(ast).map(({path, node}) => ({
    path,
    loc: node.loc?.start
      ? {line: node.loc.start.line, column: node.loc.start.column}
      : undefined
  }))
}

/** Collect API candidates from raw source content. */
export async function collectFromContent (
  content: string,
  scanMode: 'fast' | 'accurate',
  namespaces: Set<string>
): Promise<Candidate[]> {
  if (scanMode !== 'accurate') return regexCandidates(content, namespaces)

  try {
    return await accurateCandidates(content)
  } catch {
    return regexCandidates(content, namespaces)
  }
}

/** Collect API candidates from a source file on disk. */
export async function collectApiCandidates (
  filePath: string,
  scanMode: 'fast' | 'accurate',
  namespaces: Set<string>
): Promise<Candidate[]> {
  const content = await fs.promises.readFile(filePath, 'utf8')

  return collectFromContent(content, scanMode, namespaces)
}

/** Resolve a candidate to the most specific known feature, walking up to the namespace. */
function resolveFeature (
  candidate: string
): {key: string; feature: CompactFeature} | null {
  const parts = candidate.split('.')

  while (parts.length) {
    const key = parts.join('.')
    const feature = getFeature('api', key)

    if (feature) return {key, feature}

    parts.pop()
  }

  return null
}

/** Evaluate already-collected candidates against one browser/version. */
export function evaluateApiCandidates (
  candidates: Candidate[],
  browser: Browser,
  version: string | undefined,
  namespaces: Set<string>,
  file?: string
): UnsupportedItem[] {
  const findings: UnsupportedItem[] = []
  const seenKeys = new Set<string>()

  for (const {path, loc} of candidates) {
    const namespace = path.split('.')[0]

    if (!namespaces.has(namespace)) {
      findings.push({
        kind: 'api',
        key: path,
        path: `webextensions.api.${path}`,
        reason: 'no-compat-data',
        ...(file ? {file} : {}),
        ...(loc ? {loc} : {})
      })
      continue
    }

    const resolved = resolveFeature(path)

    if (!resolved) continue

    const verdict = verdictForBrowser(resolved.feature, browser, version)

    if (!verdict.ok) {
      const dedupe = `${resolved.key}@${loc?.line ?? ''}:${loc?.column ?? ''}`

      if (seenKeys.has(dedupe)) continue

      seenKeys.add(dedupe)
      findings.push({
        kind: 'api',
        key: resolved.key,
        path: `webextensions.api.${resolved.key}`,
        reason: verdict.reason ?? 'not-supported',
        browser,
        support: normalizeFeature(resolved.feature),
        mdnUrl: resolved.feature.u,
        ...(file ? {file} : {}),
        ...(loc ? {loc} : {})
      })
    }
  }

  return findings
}

export async function getUnsupportedAPIsFromFile (
  filePath: string,
  options: FileOptions | string
): Promise<UnsupportedItem[]> {
  const browser = assertBrowser(
    typeof options === 'string' ? options : options.browser
  )

  const version = typeof options === 'string' ? undefined : options.version
  const scanMode: 'fast' | 'accurate' =
    typeof options === 'string' ? 'fast' : (options.scanMode ?? 'fast')

  const namespaces = apiNamespaces()
  const candidates = await collectApiCandidates(filePath, scanMode, namespaces)

  return evaluateApiCandidates(
    candidates,
    browser,
    version,
    namespaces,
    filePath
  )
}
