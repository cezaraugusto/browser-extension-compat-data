import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  getUnsupportedAPIsFromFile,
  setIndex,
  resetIndex,
  type CompactIndex,
} from '../src/index'

const INDEX: CompactIndex = {
  manifest: {},
  permissions: {},
  api: {
    runtime: { s: { chrome: { a: '5' } } },
    'runtime.sendMessage': { s: { chrome: { a: '6' } } },
  },
}

describe('version-aware API checks', () => {
  let entry: string

  beforeAll(() => {
    setIndex(INDEX)
    entry = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'becd-')),
      'entry.js',
    )
    fs.writeFileSync(entry, 'chrome.runtime.sendMessage({})')
  })
  afterAll(() => resetIndex())

  test('runtime.sendMessage unsupported when target version is below minimum', async () => {
    const res = await getUnsupportedAPIsFromFile(entry, {
      browser: 'chrome',
      version: '5',
    })
    expect(res.map((r) => r.key)).toContain('runtime.sendMessage')
  })

  test('runtime.sendMessage supported when target version meets minimum', async () => {
    const res = await getUnsupportedAPIsFromFile(entry, {
      browser: 'chrome',
      version: '6',
    })
    expect(res.map((r) => r.key)).not.toContain('runtime.sendMessage')
  })
})
