import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {describe, test, expect, beforeAll, afterAll} from 'vitest'

import {
  analyzeExtension,
  setIndex,
  resetIndex,
  type CompactIndex
} from '../src/index'

const INDEX: CompactIndex = {
  manifest: {
    action: {
      s: {chrome: {a: '88'}, firefox: {a: '109'}, safari: {a: '15.4'}}
    },
    side_panel: {s: {chrome: {a: '114'}, firefox: {a: false}}}
  },
  permissions: {
    tabs: {
      s: {chrome: {a: '1'}, firefox: {a: '1'}, safari: {a: '14'}}
    },
    offscreen: {s: {chrome: {a: '109'}, firefox: {a: false}}}
  },
  api: {
    offscreen: {s: {chrome: {a: '109'}, firefox: {a: false}}},
    'offscreen.createDocument': {
      s: {chrome: {a: '109'}, firefox: {a: false}}
    }
  }
}

let dir: string

describe('analyzeExtension (multi-target)', () => {
  beforeAll(() => {
    setIndex(INDEX)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'becd-ext-'))
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        action: {},
        side_panel: {default_path: 'p.html'},
        background: {service_worker: 'bg.js'},
        permissions: ['offscreen', 'tabs']
      })
    )
    fs.writeFileSync(
      path.join(dir, 'bg.js'),
      'chrome.offscreen.createDocument({})'
    )
  })
  afterAll(() => {
    resetIndex()
    fs.rmSync(dir, {recursive: true, force: true})
  })

  it('reports per-target, scanning referenced sources', async () => {
    const report = await analyzeExtension(dir, [
      {browser: 'chrome', version: '120'},
      {browser: 'firefox', version: '121'}
    ])

    expect(report.ok).toBe(false)
    expect(report.scannedFiles).toContain('bg.js')

    const chrome = report.targets.find((t) => t.target.browser === 'chrome')!
    const firefox = report.targets.find((t) => t.target.browser === 'firefox')!

    // Chrome supports all of these.
    expect(chrome.findings).toHaveLength(0)

    const ffKeys = firefox.findings.map((f) => f.key)

    expect(ffKeys).toContain('side_panel') // Chrome-only manifest key
    expect(ffKeys).toContain('offscreen') // Chrome-only permission
    expect(ffKeys).toContain('offscreen.createDocument') // Chrome-only API in bg.js
    const apiFinding = firefox.findings.find(
      (f) => f.key === 'offscreen.createDocument'
    )!

    expect(apiFinding.file).toBe('bg.js')
  })

  it('throws on a bad manifest path', async () => {
    await expect(
      analyzeExtension('/no/such/dir', [{browser: 'chrome'}])
    ).rejects.toThrow()
  })
})
