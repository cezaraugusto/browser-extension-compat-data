import {describe, test, expect} from 'vitest'

import {compareVersions} from '../src/index'
import {isBelowMinVersion} from '../src/version'

describe('version compare', () => {
  it('compares segment-by-segment (15.10 > 15.4)', () => {
    expect(compareVersions('15.10', '15.4')).toBeGreaterThan(0)
    expect(compareVersions('15.4', '15.10')).toBeLessThan(0)
    expect(compareVersions('109.0.1', '109')).toBeGreaterThan(0)
    expect(compareVersions('16', '16.0')).toBe(0)
  })

  it('isBelowMinVersion handles minors correctly', () => {
    // Safari 15.4 minimum; target 15.10 is NOT below (the old parseFloat bug).
    expect(isBelowMinVersion('15.4', '15.10')).toBe(false)
    expect(isBelowMinVersion('15.4', '15.3')).toBe(true)
    expect(isBelowMinVersion('15.4', '16')).toBe(false)
  })

  it('tolerates the BCD "≤" prefix', () => {
    expect(isBelowMinVersion('≤37', '40')).toBe(false)
    expect(isBelowMinVersion('≤37', '30')).toBe(true)
  })

  it('unparseable input never false-positives', () => {
    expect(isBelowMinVersion('preview', '17')).toBe(false)
  })
})
