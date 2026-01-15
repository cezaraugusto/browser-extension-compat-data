import { BrowserSupportMap, SimpleSupportStatement } from './types'

export function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

export function extractCompat(
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

export type SupportState = {
  state: 'supported' | 'unsupported' | 'removed' | 'partial' | 'unknown'
  reason?: 'not-supported' | 'removed' | 'partial' | 'no-compat-data'
}

export function getSupportStateForBrowser(
  support: BrowserSupportMap | undefined,
  browserKey: string,
  includePartialAsUnsupported?: boolean,
): SupportState {
  if (!support) return { state: 'unknown' }

  const raw = support[browserKey]
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

  if (list.some((s) => s.version_removed === true || typeof s.version_removed === 'string')) {
    return { state: 'removed', reason: 'removed' }
  }

  if (list.every((s) => s.version_added === false || s.version_added === null)) {
    return { state: 'unsupported', reason: 'not-supported' }
  }

  return { state: 'unknown' }
}




