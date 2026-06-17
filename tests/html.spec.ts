import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {describe, test, expect, beforeAll, afterAll} from 'vitest'

import {extractScripts} from '../src/html'
import {
  analyzeExtension,
  setIndex,
  resetIndex,
  type CompactIndex
} from '../src/index'

describe('extractScripts', () => {
  test('separates external and inline, skips JSON', () => {
    const html = [
      '<html><head>',
      '<script src="a.js"></script>',
      '<script type="application/json">{"x":1}</script>',
      '<script type="module" src="b.js"></script>',
      '</head><body>',
      '<script>',
      'chrome.tabs.query({})',
      '</script>',
      '</body></html>'
    ].join('\n')

    const {external, inline} = extractScripts(html)

    expect(external).toEqual(['a.js', 'b.js'])
    expect(inline).toHaveLength(1)
    expect(inline[0].content).toContain('chrome.tabs.query')
    expect(inline[0].line).toBe(6) // <script> opens on line 6
  })
})

const INDEX: CompactIndex = {
  manifest: {
    action: {s: {chrome: {a: '88'}, firefox: {a: '109'}}}
  },
  permissions: {},
  api: {
    offscreen: {s: {chrome: {a: '109'}, firefox: {a: false}}},
    'offscreen.createDocument': {
      s: {chrome: {a: '109'}, firefox: {a: false}}
    }
  }
}

describe('analyzeExtension follows HTML entry-points', () => {
  let dir: string

  beforeAll(() => {
    setIndex(INDEX)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'becd-html-'))
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        action: {default_popup: 'ui/popup.html'}
      })
    )
    fs.mkdirSync(path.join(dir, 'ui'))
    fs.writeFileSync(
      path.join(dir, 'ui', 'popup.html'),
      [
        '<html><body>',
        '<script src="popup.js"></script>',
        '<script>',
        'chrome.offscreen.createDocument({})',
        '</script>',
        '</body></html>'
      ].join('\n')
    )
    fs.writeFileSync(
      path.join(dir, 'ui', 'popup.js'),
      'chrome.offscreen.createDocument({})'
    )
  })
  afterAll(() => {
    resetIndex()
    fs.rmSync(dir, {recursive: true, force: true})
  })

  test('scans external popup.js and inline popup.html scripts', async () => {
    const report = await analyzeExtension(dir, [
      {browser: 'firefox', version: '121'}
    ])

    const ff = report.targets[0]
    const files = ff.findings.filter((f) => f.kind === 'api').map((f) => f.file)

    expect(files).toContain(path.join('ui', 'popup.js'))
    expect(files).toContain(path.join('ui', 'popup.html'))
    // ScannedFiles lists both the external script and the HTML host.
    expect(report.scannedFiles).toContain(path.join('ui', 'popup.js'))
    expect(report.scannedFiles).toContain(path.join('ui', 'popup.html'))

    // Inline finding's line is offset to its position in the HTML (line 4).
    const inlineFinding = ff.findings.find(
      (f) => f.file === path.join('ui', 'popup.html')
    )!

    expect(inlineFinding.loc?.line).toBe(4)
  })
})
