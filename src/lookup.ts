import {getFeature, listKeys} from './store'
import {normalizeSupport} from './compat'
import {assertBrowser} from './browsers'
import {buildMdnUrl} from './mdn'
import {isBelowMinVersion} from './version'

import type {Domain, SupportInfo} from './types'

/** Does the index know about this feature at all? */
export function hasFeature (domain: Domain, key: string): boolean {
  return getFeature(domain, key) !== null
}

/**
 * MDN documentation URL for a known feature: the explicit BCD `mdn_url` when
 * present, otherwise a deterministic best-effort URL. `null` if the feature is
 * not in the index.
 */
export function getMdnUrl (domain: Domain, key: string): string | null {
  const feature = getFeature(domain, key)

  if (!feature) return null
  return feature.u ?? buildMdnUrl(domain, key)
}

/** Full normalized per-browser support map for a feature. */
export function getSupport (
  domain: Domain,
  key: string
): Record<string, SupportInfo> | null {
  const feature = getFeature(domain, key)

  if (!feature) return null

  const out: Record<string, SupportInfo> = {}

  for (const browser of Object.keys(feature.s)) {
    out[browser] = normalizeSupport(feature.s[browser])
  }

  return out
}

/** Normalized support for a single browser. Throws on an unknown browser key. */
export function getBrowserSupport (
  domain: Domain,
  key: string,
  browser: string
): SupportInfo | null {
  const b = assertBrowser(browser)
  const s = getFeature(domain, key)?.s[b]

  return s ? normalizeSupport(s) : null
}

/**
 * Minimum version that added the feature in a browser. Returns the version
 * string, or `null` when supported since forever / unsupported / unknown.
 * Throws on an unknown browser key.
 */
export function getMinVersion (
  domain: Domain,
  key: string,
  browser: string
): string | null {
  const b = assertBrowser(browser)
  const added = getFeature(domain, key)?.s[b]?.a

  return typeof added === 'string' ? added : null
}

/**
 * Whether a feature is supported in a browser, optionally gated on a target
 * version. Unknown features are treated as unsupported; an unknown browser key
 * throws (so a typo can never read as a silent pass).
 */
export function isSupported (
  domain: Domain,
  key: string,
  browser: string,
  version?: string
): boolean {
  const b = assertBrowser(browser)
  const s = getFeature(domain, key)?.s[b]

  if (!s) return false

  const info = normalizeSupport(s)

  if (!info.supported) return false

  if (version && typeof s.a === 'string' && isBelowMinVersion(s.a, version)) {
    return false
  }
  return true
}

/** All indexed keys for a domain (handy for enumeration / autocomplete). */
export {listKeys}
