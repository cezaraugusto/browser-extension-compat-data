import { BrowserSupportMap, SimpleSupportStatement } from './types'
import { getIndexes, getNodeByPathFromIndexes } from './data'
import { extractCompat } from './compat'

export function minSupportedVersionFromSupport(
  support: BrowserSupportMap | undefined,
  browserKey: string,
): string | null {
  if (!support) return null
  const s = support[browserKey]
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

export function parseNumericVersion(version: string): number {
  const m = version.match(/\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : NaN
}

export function isBelowMinVersion(
  support: BrowserSupportMap | undefined,
  browserKey: string,
  targetVersion?: string,
): boolean {
  if (!targetVersion) return false
  const min = minSupportedVersionFromSupport(support, browserKey)
  if (!min || min === 'true') return false
  const minN = parseNumericVersion(min)
  const targetN = parseNumericVersion(targetVersion)
  if (Number.isNaN(minN) || Number.isNaN(targetN)) return false
  return targetN < minN
}

export async function getMinSupportedVersionInternal(
  featurePath: string,
  browserKey: string,
): Promise<string | null> {
  const indexes = await getIndexes()
  const node = getNodeByPathFromIndexes(indexes, featurePath)
  const compat = extractCompat(node, featurePath)
  return minSupportedVersionFromSupport(compat?.support, browserKey)
}

export async function isSupportedInternal(
  featurePath: string,
  browserKey: string,
  version?: string,
): Promise<boolean> {
  const indexes = await getIndexes()
  const node = getNodeByPathFromIndexes(indexes, featurePath)
  const compat = extractCompat(node, featurePath)
  const stateSupport = compat?.support
  if (!stateSupport) return false
  const min = await getMinSupportedVersionInternal(featurePath, browserKey)
  if (!min || min === 'true') return true
  if (!version) return true
  const minN = parseNumericVersion(min)
  const targetN = parseNumericVersion(version)
  if (Number.isNaN(minN) || Number.isNaN(targetN)) return true
  return targetN >= minN
}




