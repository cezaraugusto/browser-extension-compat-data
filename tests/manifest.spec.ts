import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  evaluateManifest,
  getUnsupportedManifestFields,
  setIndex,
  resetIndex,
  type CompactIndex,
} from '../src/index'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const INDEX: CompactIndex = {
  manifest: {
    action: {
      s: { chrome: { a: '88' }, firefox: { a: '109' }, safari: { a: '15.4' } },
    },
    side_panel: {
      s: { chrome: { a: '114' }, firefox: { a: false }, safari: { a: false } },
    }, // chrome only
    background: {
      s: { chrome: { a: '1' }, firefox: { a: '1' }, safari: { a: '14' } },
    },
    host_permissions: { s: { chrome: { a: '88' }, firefox: { a: '109' } } },
  },
  permissions: {
    tabs: {
      s: { chrome: { a: '1' }, firefox: { a: '1' }, safari: { a: '14' } },
    },
    offscreen: {
      s: { chrome: { a: '109' }, firefox: { a: false }, safari: { a: false } },
    }, // chrome only
    scripting: {
      s: { chrome: { a: '88' }, firefox: { a: '101' }, safari: { a: false } },
    },
  },
  api: {},
}

describe('manifest validator', () => {
  beforeAll(() => setIndex(INDEX))
  afterAll(() => resetIndex())

  test('generic walk flags any indexed key actually used', () => {
    const findings = evaluateManifest(
      {
        manifest_version: 3,
        action: {},
        side_panel: { default_path: 'p.html' },
      },
      'firefox',
    )
    const keys = findings.map((f) => f.key)
    expect(keys).toContain('side_panel') // chrome-only
    expect(keys).not.toContain('action') // firefox 109 supported
  })

  test('checks permissions + optional_permissions, ignores host patterns', () => {
    const findings = evaluateManifest(
      {
        manifest_version: 3,
        permissions: ['offscreen', 'tabs', '<all_urls>', 'https://*/*'],
        optional_permissions: ['scripting'],
      },
      'safari',
    )
    const perms = findings
      .filter((f) => f.kind === 'permission')
      .map((f) => f.key)
    expect(perms).toContain('offscreen') // chrome-only
    expect(perms).toContain('scripting') // safari false
    expect(perms).not.toContain('<all_urls>') // host pattern, skipped
    expect(perms).not.toContain('https://*/*')
  })

  test('manifest_version structural rules', () => {
    const mv3 = evaluateManifest(
      {
        manifest_version: 3,
        browser_action: {},
        background: { scripts: ['b.js'] },
      },
      'chrome',
    )
    const mvFindings = mv3
      .filter((f) => f.reason === 'manifest-version')
      .map((f) => f.key)
    expect(mvFindings).toContain('browser_action')
    expect(mvFindings).toContain('background.scripts')

    const mv2 = evaluateManifest(
      { manifest_version: 2, action: {}, host_permissions: ['*://*/*'] },
      'chrome',
    )
    const mv2Findings = mv2
      .filter((f) => f.reason === 'manifest-version')
      .map((f) => f.key)
    expect(mv2Findings).toContain('action')
    expect(mv2Findings).toContain('host_permissions')
  })

  test('web_accessible_resources shape mismatch (MV3 wants objects)', () => {
    const findings = evaluateManifest(
      { manifest_version: 3, web_accessible_resources: ['a.png', 'b.png'] },
      'chrome',
    )
    expect(
      findings.some(
        (f) =>
          f.key === 'web_accessible_resources' &&
          f.reason === 'manifest-version',
      ),
    ).toBe(true)
  })

  test('throws on unknown browser', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'becd-'))
    const file = path.join(tmp, 'manifest.json')
    fs.writeFileSync(file, JSON.stringify({ manifest_version: 3, action: {} }))
    await expect(
      getUnsupportedManifestFields(file, { browser: 'chromeos' }),
    ).rejects.toThrow(/Unknown browser/)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
