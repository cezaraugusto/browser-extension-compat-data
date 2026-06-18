import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {describe, test, expect, beforeAll, afterAll} from 'vitest'

import {
  getUnsupportedManifest,
  getUnsupportedAPIsFromFile,
  setIndex,
  resetIndex,
  type CompactIndex
} from '../src/index'

const INDEX: CompactIndex = {
  v: 'test',
  manifest: {
    action: {s: {chrome: {a: '88'}, safari: {a: false}}}
  },
  permissions: {
    tabs: {s: {chrome: {a: '5'}, safari: {a: false}}}
  },
  api: {
    runtime: {s: {chrome: {a: '5'}, safari: {a: '14'}}},
    'runtime.sendMessage': {s: {chrome: {a: '6'}, safari: {a: false}}}
  }
}

describe('unsupported analyzers', () => {
  let tmp: string

  beforeAll(() => {
    setIndex(INDEX)
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'becd-'))
  })

  afterAll(() => {
    resetIndex()
    fs.rmSync(tmp, {recursive: true, force: true})
  })

  it('getUnsupportedManifest returns manifest fields and permissions not supported by target browser', async () => {
    const manifestFile = path.join(tmp, 'manifest.json')

    fs.writeFileSync(
      manifestFile,
      JSON.stringify({
        manifest_version: 3,
        name: 'x',
        version: '1.0.0',
        action: {},
        permissions: ['tabs']
      })
    )

    const res = await getUnsupportedManifest(manifestFile, 'safari')
    const keys = res.map((r) => `${r.kind}:${r.key}`)

    expect(keys).toContain('manifest:action')
    expect(keys).toContain('permission:tabs')

    const reasons = new Set(res.map((r) => r.reason))

    expect(reasons.has('not-supported')).toBe(true)
  })

  it('getUnsupportedAPIsFromFile returns API items not supported by target browser', async () => {
    const file = path.join(tmp, 'entry.js')

    fs.writeFileSync(file, 'chrome.runtime.sendMessage({})')

    const res = await getUnsupportedAPIsFromFile(file, 'safari')
    const keys = res.map((r) => r.key)

    expect(keys).toContain('runtime.sendMessage')

    // Namespace supported, subfeature unsupported → only the subfeature should appear
    expect(keys).not.toContain('runtime')
  })
})
