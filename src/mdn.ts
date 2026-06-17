import type {Domain} from './types'

const BASE = 'https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions'

/**
 * Construct a best-effort MDN documentation URL from a domain + key, for use
 * when BCD carries no explicit `mdn_url`. Deterministic, but not guaranteed to
 * resolve for every nested key.
 */
export function buildMdnUrl (domain: Domain, key: string): string {
  if (domain === 'manifest') {
    return `${BASE}/manifest.json/${key.split('.')[0]}`
  }

  if (domain === 'permissions') {
    return `${BASE}/manifest.json/permissions`
  }
  return `${BASE}/API/${key.split('.').join('/')}`
}
