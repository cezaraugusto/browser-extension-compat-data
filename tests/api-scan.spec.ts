import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {describe, test, expect, beforeAll, afterAll} from 'vitest'

import {
  getUnsupportedAPIsFromFile,
  setIndex,
  resetIndex,
  type CompactIndex
} from '../src/index'

const INDEX: CompactIndex = {
  manifest: {},
  permissions: {},
  api: {
    tabs: {
      s: {chrome: {a: '1'}, firefox: {a: '1'}, safari: {a: '14'}}
    },
    'tabs.query': {
      s: {chrome: {a: '1'}, firefox: {a: '1'}, safari: {a: '14'}}
    },
    scripting: {
      s: {chrome: {a: '88'}, firefox: {a: '101'}, safari: {a: false}}
    },
    'scripting.executeScript': {
      s: {chrome: {a: '88'}, firefox: {a: '101'}, safari: {a: false}}
    },
    'storage.local': {
      s: {chrome: {a: '1'}, firefox: {a: '1'}, safari: {a: '14'}}
    }
  }
}

let dir: string

function write (name: string, src: string): string {
  const p = path.join(dir, name)

  fs.writeFileSync(p, src)

  return p
}

describe('API scanner (accurate)', () => {
  beforeAll(() => {
    setIndex(INDEX)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'becd-'))
  })
  afterAll(() => {
    resetIndex()
    fs.rmSync(dir, {recursive: true, force: true})
  })

  test('resolves destructuring + polyfill default import + aliasing, with locations', async () => {
    const file = write(
      'bg.js',
      [
        "import browser from 'webextension-polyfill'",
        'const { scripting } = chrome',
        'const { executeScript } = scripting',
        'executeScript({})',
        'browser.tabs.query({})',
        'chrome.storage.local.get()'
      ].join('\n')
    )

    const res = await getUnsupportedAPIsFromFile(file, {
      browser: 'safari',
      scanMode: 'accurate'
    })

    const keys = res.map((r) => r.key)

    // Scripting.executeScript (destructured twice) unsupported in safari
    expect(keys).toContain('scripting.executeScript')
    // Browser.tabs.query via polyfill -> tabs.query, supported in safari 14
    expect(keys).not.toContain('tabs.query')
    // Storage.local supported
    expect(keys).not.toContain('storage.local')

    const finding = res.find((r) => r.key === 'scripting.executeScript')!

    expect(finding.loc?.line).toBe(4) // The executeScript({}) call
    expect(finding.file).toBe(file)
  })

  test('custom polyfill alias is followed', async () => {
    const file = write(
      'alias.js',
      [
        "const ext = require('webextension-polyfill')",
        'ext.scripting.executeScript({})'
      ].join('\n')
    )

    const res = await getUnsupportedAPIsFromFile(file, {
      browser: 'safari',
      scanMode: 'accurate'
    })

    expect(res.map((r) => r.key)).toContain('scripting.executeScript')
  })

  test('fast mode still catches direct chains', async () => {
    const file = write('direct.js', 'chrome.scripting.executeScript({})')
    const res = await getUnsupportedAPIsFromFile(file, {browser: 'safari'})

    expect(res.map((r) => r.key)).toContain('scripting.executeScript')
  })
})
