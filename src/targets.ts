import {assertBrowser} from './browsers'

import type {Target} from './types'

/**
 * Parse a target string into a {browser, version}. Accepts `chrome`,
 * `chrome111`, `chrome@111`, `chrome111.0`, `firefox_android115`, etc.
 * Throws on an unknown browser.
 */
export function parseTarget (input: string): Target {
  const m = input.trim().match(/^([a-zA-Z_]+)[@v]?([\d][\d.]*)?$/)

  if (!m) throw new Error(`Invalid target "${input}".`)
  return {
    browser: assertBrowser(m[1]),
    version: m[2] || undefined
  }
}

export function parseTargets (input: string | string[]): Target[] {
  const list = Array.isArray(input) ? input : input.split(',')

  return list
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseTarget)
}
