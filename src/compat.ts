import { CompactFeature, CompactSupport, Reason, SupportInfo } from './types'
import { isBelowMinVersion } from './version'

export interface Verdict {
  ok: boolean
  reason?: Reason
}

function isAdded(s: CompactSupport): boolean {
  return s.a === true || typeof s.a === 'string'
}

function isRemoved(s: CompactSupport): boolean {
  return s.r === true || typeof s.r === 'string'
}

/** Normalize compact support into the friendly public shape. */
export function normalizeSupport(s: CompactSupport): SupportInfo {
  return {
    supported: isAdded(s) && !isRemoved(s) && !s.f,
    versionAdded: s.a,
    versionRemoved: s.r,
    partial: s.p,
    flagged: s.f,
  }
}

/** Normalize a whole feature's support map. */
export function normalizeFeature(
  feature: CompactFeature,
): Record<string, SupportInfo> {
  const out: Record<string, SupportInfo> = {}
  for (const browser of Object.keys(feature.s)) {
    out[browser] = normalizeSupport(feature.s[browser])
  }
  return out
}

/**
 * Decide whether a feature is a compatibility problem for a target
 * browser/version. A browser with no statement is treated as "unknown" and
 * left unflagged (BCD silence is not evidence of breakage). Flagged and
 * partial implementations are surfaced as caveats, not hard failures.
 */
export function verdictForBrowser(
  feature: CompactFeature,
  browser: string,
  version?: string,
): Verdict {
  const s = feature.s[browser]
  if (!s) return { ok: true }
  if (isRemoved(s)) return { ok: false, reason: 'removed' }
  if (!isAdded(s)) return { ok: false, reason: 'not-supported' }
  if (version && typeof s.a === 'string' && isBelowMinVersion(s.a, version)) {
    return { ok: false, reason: 'not-supported' }
  }
  if (s.f) return { ok: false, reason: 'flag' }
  if (s.p) return { ok: false, reason: 'partial' }
  return { ok: true }
}
