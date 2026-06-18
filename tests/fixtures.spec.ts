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

describe('fixtures demo', () => {
  let tmp: string

  beforeAll(() => {
    setIndex(INDEX)
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'becd-'))
    fs.writeFileSync(
      path.join(tmp, 'manifest.json'),
      JSON.stringify({action: {}, permissions: ['tabs']})
    )
    fs.writeFileSync(
      path.join(tmp, 'entry.js'),
      'chrome.runtime.sendMessage({})'
    )
  })
  afterAll(() => {
    resetIndex()
    fs.rmSync(tmp, {recursive: true, force: true})
  })

  it('manifest fixture: unsupported items for safari', async () => {
    const res = await getUnsupportedManifest(
      path.join(tmp, 'manifest.json'),
      'safari'
    )

    const keys = res.map((r) => `${r.kind}:${r.key}`)

    expect(keys).toContain('manifest:action')
    expect(keys).toContain('permission:tabs')
  })

  it('api fixture: runtime.sendMessage unsupported in safari', async () => {
    const res = await getUnsupportedAPIsFromFile(
      path.join(tmp, 'entry.js'),
      'safari'
    )

    const keys = res.map((r) => r.key)

    expect(keys).toContain('runtime.sendMessage')
    expect(keys).not.toContain('runtime')
  })
})
