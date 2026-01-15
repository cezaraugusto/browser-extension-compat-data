import * as fs from 'fs'
import { FileOptions, UnsupportedItem, BrowserSupportMap } from './types'
import { getIndexes } from './data'
import { extractCompat, getSupportStateForBrowser } from './compat'
import { isBelowMinVersion } from './version'

const API_MEMBER_REGEX =
  /\b(?:chrome|browser)\.([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?)?/g

async function collectCandidatesFast(
  filePath: string,
  apiNamespaces: Set<string>,
): Promise<Set<string>> {
  return await new Promise<Set<string>>((resolve, reject) => {
    const seenCandidates = new Set<string>()
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
    let trailingBuffer = ''
    stream.on('data', (chunk: string) => {
      const merged = trailingBuffer + chunk
      let match: RegExpExecArray | null
      API_MEMBER_REGEX.lastIndex = 0
      while ((match = API_MEMBER_REGEX.exec(merged))) {
        const namespace = match[1]
        if (!apiNamespaces.has(namespace)) continue
        const sub = match[2]
        const deep = match[3]
        const fullKey = deep
          ? `${namespace}.${sub}.${deep}`
          : sub
            ? `${namespace}.${sub}`
            : namespace
        if (!seenCandidates.has(fullKey)) seenCandidates.add(fullKey)
      }
      trailingBuffer = merged.slice(-64)
    })
    stream.on('end', () => resolve(seenCandidates))
    stream.on('error', (e) => reject(e))
  })
}

async function collectCandidatesAccurate(filePath: string): Promise<Set<string>> {
  const content = await fs.promises.readFile(filePath, 'utf8')
  const seenCandidates = new Set<string>()
  try {
    const acorn = await import('acorn')
    const ast: any = (acorn as any).parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowHashBang: true,
    })
    const stack: any[] = [ast]
    while (stack.length) {
      const node = stack.pop()
      if (!node || typeof node !== 'object') continue
      if ((node as any).type === 'MemberExpression') {
        const names: string[] = []
        let current: any = node
        while (current && current.type === 'MemberExpression') {
          if (current.property?.type === 'Identifier')
            names.unshift(current.property.name)
          current = current.object
        }
        if (
          current &&
          current.type === 'Identifier' &&
          (current.name === 'chrome' || current.name === 'browser')
        ) {
          if (names.length >= 1) {
            const namespace = names[0]
            const id = names.length >= 2 ? `${namespace}.${names[1]}` : namespace
            const deepId = names.length >= 3 ? `${namespace}.${names[1]}.${names[2]}` : null
            const fullKey = deepId ?? id
            if (!seenCandidates.has(fullKey)) seenCandidates.add(fullKey)
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
    let match: RegExpExecArray | null
    API_MEMBER_REGEX.lastIndex = 0
    while ((match = API_MEMBER_REGEX.exec(content))) {
      const ns = match[1]
      const sub = match[2]
      const deep = match[3]
      const fullKey = deep ? `${ns}.${sub}.${deep}` : sub ? `${ns}.${sub}` : ns
      if (!seenCandidates.has(fullKey)) seenCandidates.add(fullKey)
    }
  }
  return seenCandidates
}

export async function getUnsupportedAPIsFromFile(
  filePath: string,
  options: FileOptions | string,
  _legacyMaybe?: any,
): Promise<UnsupportedItem[]> {
  const browserKey = typeof options === 'string' ? options : options.browser
  const targetVersion =
    typeof options === 'string' ? undefined : options.version
  const scanMode: 'fast' | 'accurate' =
    typeof options === 'string' ? 'fast' : options.scanMode ?? 'fast'

  const { apiIndex } = await getIndexes()
  const apiNamespaces = new Set<string>(Array.from(apiIndex.keys()))

  const candidates =
    scanMode === 'accurate'
      ? await collectCandidatesAccurate(filePath)
      : await collectCandidatesFast(filePath, apiNamespaces)

  const findings: UnsupportedItem[] = []
  for (const candidate of candidates) {
    const parts = candidate.split('.')
    const namespace = parts[0]
    const apiEntry = apiIndex.get(namespace)
    if (!apiEntry) {
      findings.push({
        kind: 'api',
        key: candidate,
        path: `webextensions.api.${candidate}`,
        reason: 'no-compat-data',
      })
      continue
    }
    let compat:
      | { path: string; support?: BrowserSupportMap; mdnUrl?: string }
      | null = null
    if (parts.length >= 3 && apiEntry.deep && apiEntry.deep.has(`${parts[1]}.${parts[2]}`)) {
      const deepEntry = apiEntry.deep.get(`${parts[1]}.${parts[2]}`)!
      compat = extractCompat(deepEntry.node, deepEntry.compatPath)
    } else if (parts.length >= 2 && apiEntry.sub.has(parts[1])) {
      const subEntry = apiEntry.sub.get(parts[1])!
      compat = extractCompat(subEntry.node, subEntry.compatPath)
    } else {
      compat = extractCompat(apiEntry.node, apiEntry.compatPath)
    }
    const supportState = getSupportStateForBrowser(compat?.support, browserKey, false)
    const isVersionBlocked = isBelowMinVersion(compat?.support, browserKey, targetVersion)
    if (
      supportState.state === 'unsupported' ||
      supportState.state === 'removed' ||
      (supportState.state === 'partial' && false) ||
      isVersionBlocked
    ) {
      findings.push({
        kind: 'api',
        key: candidate,
        path: compat?.path ?? `webextensions.api.${candidate}`,
        reason: supportState.reason ?? 'not-supported',
        support: compat?.support,
        mdnUrl: compat?.mdnUrl,
      })
    }
  }
  return findings
}




