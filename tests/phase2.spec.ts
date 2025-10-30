import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import {
  listBrowsers,
  hasBrowserKey,
  getMinSupportedVersion,
  isSupported,
  analyzeFiles,
  analyzeProject,
  toNDJSON,
  toSARIF,
  generateBaselineMatrix,
  getUnsupportedAPIsFromFile,
} from '../src/index'

const originalCwd = process.cwd()
const fixturesDir = path.join(__dirname, 'fixtures')

describe('phase 2 utilities and outputs', () => {
  beforeAll(() => {
    process.chdir(fixturesDir)
  })
  afterAll(() => {
    process.chdir(originalCwd)
  })

  test('listBrowsers / hasBrowserKey', async () => {
    const list = await listBrowsers()
    expect(list).toContain('chrome')
    expect(list).toContain('safari')
    expect(await hasBrowserKey('firefox')).toBeTypeOf('boolean')
  })

  test('getMinSupportedVersion and isSupported', async () => {
    const p = 'webextensions.api.runtime.sendMessage'
    const min = await getMinSupportedVersion(p, 'chrome')
    expect(min).toBe('6')
    expect(await isSupported(p, 'chrome', '6')).toBe(true)
    expect(await isSupported(p, 'chrome', '5')).toBe(false)
  })

  test('analyzeFiles and reporters', async () => {
    const entry = path.join(fixturesDir, 'entry.js')
    const res = await analyzeFiles([entry], 'safari', { strict: true })
    const nd = toNDJSON(res)
    expect(nd.split('\n').length).toBeGreaterThan(0)
    const sarif = toSARIF(res)
    expect(sarif.version).toBe('2.1.0')
    // mdnUrl propagated when available
    const runtimeFinding = res.find((r) => r.key === 'runtime.sendMessage')
    expect(runtimeFinding?.mdnUrl).toContain('developer.mozilla.org')
  })

  test('analyzeProject missing/unused permissions', async () => {
    const entry = path.join(fixturesDir, 'entry.js')
    const manifestPath = path.join(fixturesDir, 'manifest.json')
    const proj = await analyzeProject({
      files: [entry],
      manifestPath,
      browser: 'safari',
      options: { strict: true },
    })
    // runtime namespace requires no explicit permission in our mapping, so tabs is unused here
    expect(proj.missingPermissions.length).toBe(0)
    expect(proj.unusedPermissions).toContain('tabs')
  })

  test('baseline matrix generation', async () => {
    const entry = path.join(fixturesDir, 'entry.js')
    const manifestPath = path.join(fixturesDir, 'manifest.json')
    const matrix = await generateBaselineMatrix({
      files: [entry],
      manifestPath,
      targets: { safari: '17' },
      options: { strict: true },
    })
    expect(matrix.safari).toBeDefined()
    expect(matrix.safari.counts.unsupported).toBeGreaterThanOrEqual(1)
  })
})
