import { describe, test, expect } from 'vitest'
import { assertBrowser, isKnownBrowser, BROWSERS } from '../src/index'
import { parseTarget, parseTargets } from '../src/targets'

describe('browser typing', () => {
  test('known browsers + aliases', () => {
    expect(isKnownBrowser('firefox')).toBe(true)
    expect(assertBrowser('chromium')).toBe('chrome')
    expect(assertBrowser('ios')).toBe('safari_ios')
    expect(BROWSERS).toContain('firefox_android')
  })

  test('throws on unknown browser (no silent pass)', () => {
    expect(() => assertBrowser('Safari ')).toThrow()
    expect(() => assertBrowser('netscape')).toThrow(/Unknown browser/)
  })

  test('parseTarget splits browser and version', () => {
    expect(parseTarget('chrome111')).toEqual({
      browser: 'chrome',
      version: '111',
    })
    expect(parseTarget('safari@16.4')).toEqual({
      browser: 'safari',
      version: '16.4',
    })
    expect(parseTarget('firefox_android115')).toEqual({
      browser: 'firefox_android',
      version: '115',
    })
    expect(parseTarget('edge')).toEqual({ browser: 'edge', version: undefined })
  })

  test('parseTargets parses a comma list', () => {
    expect(parseTargets('chrome120, firefox121').map((t) => t.browser)).toEqual(
      ['chrome', 'firefox'],
    )
  })
})
