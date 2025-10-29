import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { getUnsupportedManifest, getUnsupportedAPIsFromFile } from '../src/index'

function writeJSON(p: string, v: any) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(v, null, 2))
}

describe('unsupported analyzers', () => {
  const root = path.join(process.cwd(), 'data', 'webextensions')

  beforeAll(() => {
    // manifest: action supported only in chrome; not in safari
    writeJSON(path.join(root, 'manifest', 'action.json'), {
      webextensions: {
        manifest: {
          action: {
            __compat: {
              support: {
                chrome: { version_added: '88' },
                safari: { version_added: false },
              },
            },
          },
        },
      },
    })
    // permission: tabs not supported in safari (for test purposes)
    writeJSON(path.join(root, 'permissions', 'tabs.json'), {
      webextensions: {
        permissions: {
          tabs: {
            __compat: {
              support: {
                chrome: { version_added: '5' },
                safari: { version_added: false },
              },
            },
          },
        },
      },
    })
    // api: runtime supported; runtime.sendMessage unsupported in safari
    writeJSON(path.join(root, 'api', 'runtime.json'), {
      webextensions: {
        api: {
          runtime: {
            __compat: {
              support: {
                chrome: { version_added: '5' },
                safari: { version_added: '14' },
              },
            },
            sendMessage: {
              __compat: {
                support: {
                  chrome: { version_added: '6' },
                  safari: { version_added: false },
                },
              },
            },
          },
        },
      },
    })
  })

  afterAll(() => {
    fs.rmSync(path.join(process.cwd(), 'data'), { recursive: true, force: true })
  })

  test('getUnsupportedManifest returns manifest fields and permissions not supported by target browser', async () => {
    const manifestFile = path.join(process.cwd(), 'manifest.json')
    fs.writeFileSync(
      manifestFile,
      JSON.stringify({ manifest_version: 3, name: 'x', version: '1.0.0', action: {}, permissions: ['tabs'] }),
    )

    const res = await getUnsupportedManifest(manifestFile, 'safari')
    const keys = res.map((r) => `${r.kind}:${r.key}`)
    expect(keys).toContain('manifest:action')
    expect(keys).toContain('permission:tabs')

    const reasons = new Set(res.map((r) => r.reason))
    expect(reasons.has('not-supported')).toBe(true)
  })

  test('getUnsupportedAPIsFromFile returns API items not supported by target browser', async () => {
    const file = path.join(process.cwd(), 'entry.js')
    fs.writeFileSync(file, 'chrome.runtime.sendMessage({})')

    const res = await getUnsupportedAPIsFromFile(file, 'safari')
    const keys = res.map((r) => r.key)
    expect(keys).toContain('runtime.sendMessage')

    // namespace supported, subfeature unsupported → only the subfeature should appear
    expect(keys).not.toContain('runtime')
  })
})
