/** Strip BCD decorations like a leading `≤` (e.g. `"≤37"`) and whitespace. */
function clean(version: string): string {
  return version.replace(/^[≤<>=~^\s]+/, '').trim()
}

/**
 * Compare two dotted version strings segment-by-segment (so `15.10` sorts
 * above `15.4`, unlike a naive parseFloat). Missing segments are treated as 0.
 * Returns <0 if a<b, 0 if equal, >0 if a>b, or NaN if either is unparseable.
 */
export function compareVersions(a: string, b: string): number {
  const pa = clean(a).split('.')
  const pb = clean(b).split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i] ?? '0', 10)
    const nb = parseInt(pb[i] ?? '0', 10)
    if (Number.isNaN(na) || Number.isNaN(nb)) return NaN
    if (na !== nb) return na - nb
  }
  return 0
}

/**
 * True when `target` is older than the minimum supported `min` version.
 * Unparseable inputs are treated as "not below" (no false positive).
 */
export function isBelowMinVersion(min: string, target: string): boolean {
  const cmp = compareVersions(target, min)
  if (Number.isNaN(cmp)) return false
  return cmp < 0
}
