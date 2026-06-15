import { Browser } from './types'

/** Canonical list of browsers covered by MDN WebExtensions compat data. */
export const BROWSERS: readonly Browser[] = [
  'chrome',
  'edge',
  'firefox',
  'firefox_android',
  'opera',
  'safari',
  'safari_ios',
] as const

const BROWSER_SET = new Set<string>(BROWSERS)

/** Common aliases mapped to their canonical BCD key. */
const ALIASES: Record<string, Browser> = {
  chromium: 'chrome',
  'firefox-android': 'firefox_android',
  fennec: 'firefox_android',
  'safari-ios': 'safari_ios',
  ios: 'safari_ios',
  ios_saf: 'safari_ios',
}

export function isKnownBrowser(value: string): value is Browser {
  return BROWSER_SET.has(value)
}

/**
 * Resolve a user-supplied browser string to a canonical {@link Browser},
 * accepting a few common aliases. Throws on anything unrecognized so a typo
 * can never silently pass validation.
 */
export function assertBrowser(value: string): Browser {
  if (isKnownBrowser(value)) return value
  const alias = ALIASES[value.toLowerCase()]
  if (alias) return alias
  throw new Error(
    `Unknown browser "${value}". Expected one of: ${BROWSERS.join(', ')}.`,
  )
}
