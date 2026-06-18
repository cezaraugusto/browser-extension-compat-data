import {describe, test, expect, beforeAll, afterAll} from 'vitest'

import {
  getSupport,
  getBrowserSupport,
  getMinVersion,
  getMdnUrl,
  isSupported,
  hasFeature,
  listKeys,
  setIndex,
  resetIndex,
  type CompactIndex
} from '../src/index'

const INDEX: CompactIndex = {
  manifest: {
    action: {
      u: 'https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/manifest.json/action',
      s: {chrome: {a: '88'}, firefox: {a: '109'}, safari: {a: false}}
    }
  },
  permissions: {
    tabs: {s: {chrome: {a: '5'}, safari: {a: false}}}
  },
  api: {
    runtime: {s: {chrome: {a: '5'}, safari: {a: '14'}}},
    'runtime.sendMessage': {s: {chrome: {a: '26'}, safari: {a: false}}}
  }
}

describe('lookup API', () => {
  beforeAll(() => setIndex(INDEX))
  afterAll(() => resetIndex())

  it('getSupport returns normalized per-browser support', () => {
    const support = getSupport('manifest', 'action')!

    expect(support.chrome).toEqual({
      supported: true,
      versionAdded: '88',
      versionRemoved: undefined,
      partial: undefined
    })
    expect(support.safari.supported).toBe(false)
  })

  it('isSupported honors version gating', () => {
    expect(isSupported('api', 'runtime.sendMessage', 'chrome')).toBe(true)
    expect(isSupported('api', 'runtime.sendMessage', 'chrome', '26')).toBe(true)
    expect(isSupported('api', 'runtime.sendMessage', 'chrome', '25')).toBe(
      false
    )
    expect(isSupported('api', 'runtime.sendMessage', 'safari')).toBe(false)
    expect(isSupported('manifest', 'action', 'edge')).toBe(false) // Unknown browser
  })

  it('getMinVersion / getMdnUrl / hasFeature', () => {
    expect(getMinVersion('manifest', 'action', 'firefox')).toBe('109')
    expect(getMinVersion('manifest', 'action', 'safari')).toBeNull()
    expect(getMdnUrl('manifest', 'action')).toContain('developer.mozilla.org')
    expect(hasFeature('permissions', 'tabs')).toBe(true)
    expect(hasFeature('permissions', 'nope')).toBe(false)
  })

  it('getBrowserSupport / listKeys', () => {
    expect(getBrowserSupport('api', 'runtime', 'safari')?.versionAdded).toBe(
      '14'
    )
    expect(getBrowserSupport('api', 'runtime', 'opera')).toBeNull()
    expect(listKeys('api').sort()).toEqual(['runtime', 'runtime.sendMessage'])
  })

  it('throws on unknown browser instead of silently passing', () => {
    expect(() => isSupported('manifest', 'action', 'nope')).toThrow(
      /Unknown browser/
    )
  })
})

describe('flag + partial support', () => {
  beforeAll(() =>
    setIndex({
      manifest: {},
      permissions: {},
      api: {
        'a.flagged': {s: {firefox: {a: '100', f: true}}},
        'a.partial': {s: {firefox: {a: '100', p: true}}}
      }
    }))
  afterAll(() => resetIndex())

  it('flagged is not "supported" and gets its own info', () => {
    const info = getBrowserSupport('api', 'a.flagged', 'firefox')!

    expect(info.flagged).toBe(true)
    expect(info.supported).toBe(false)
    expect(isSupported('api', 'a.flagged', 'firefox')).toBe(false)
  })

  it('partial is surfaced', () => {
    expect(getBrowserSupport('api', 'a.partial', 'firefox')?.partial).toBe(true)
  })
})
