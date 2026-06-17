import {describe, test, expect, beforeAll} from 'vitest'

import {
  isSupported,
  getMinVersion,
  getMdnUrl,
  hasFeature,
  getIndex,
  resetIndex
} from '../src/index'

/**
 * Runs against the real committed index (src/generated/index.json), so a broken
 * flatten or stale data is caught here rather than in production.
 */
describe('real-data smoke', () => {
  beforeAll(() => resetIndex())

  test('index has real provenance and substantial coverage', () => {
    const idx = getIndex()

    expect(idx.v).not.toBe('placeholder')
    expect(idx.v).not.toBe('empty')
    expect(Object.keys(idx.manifest).length).toBeGreaterThan(100)
    expect(Object.keys(idx.api).length).toBeGreaterThan(1000)
    expect(Object.keys(idx.permissions).length).toBeGreaterThan(20)
  })

  test('known compatibility truths', () => {
    // Side_panel is Chrome/Edge/Opera only.
    expect(isSupported('manifest', 'side_panel', 'chrome')).toBe(true)
    expect(isSupported('manifest', 'side_panel', 'firefox')).toBe(false)

    // Runtime.sendMessage works everywhere including Safari.
    expect(isSupported('api', 'runtime.sendMessage', 'safari')).toBe(true)

    // Action landed in Chrome 88.
    expect(getMinVersion('manifest', 'action', 'chrome')).toBe('88')

    // Offscreen is a real BCD coverage gap (not indexed).
    expect(hasFeature('permissions', 'offscreen')).toBe(false)
  })

  test('MDN url falls back deterministically when BCD has none', () => {
    const url = getMdnUrl('permissions', 'tabs')

    expect(url).toContain('developer.mozilla.org')
  })
})
