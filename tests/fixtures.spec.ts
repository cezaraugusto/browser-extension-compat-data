import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import {
  getUnsupportedManifest,
  getUnsupportedAPIsFromFile,
} from '../src/index'

const originalCwd = process.cwd()
const fixturesDir = path.join(__dirname, 'fixtures')

describe('fixtures demo', () => {
  beforeAll(() => {
    // chdir so data/webextensions is resolved within fixtures
    process.chdir(fixturesDir)
  })

  afterAll(() => {
    process.chdir(originalCwd)
  })

  test('manifest fixture: unsupported items for safari', async () => {
    const manifestPath = path.join(fixturesDir, 'manifest.json')
    const res = await getUnsupportedManifest(manifestPath, 'safari', {
      strict: true,
    })
    const keys = res.map((r) => `${r.kind}:${r.key}`)
    expect(keys).toContain('manifest:action')
    expect(keys).toContain('permission:tabs')
  })

  test('api fixture: runtime.sendMessage unsupported in safari', async () => {
    const entry = path.join(fixturesDir, 'entry.js')
    const res = await getUnsupportedAPIsFromFile(entry, 'safari', {
      strict: true,
    })
    const keys = res.map((r) => r.key)
    expect(keys).toContain('runtime.sendMessage')
    expect(keys).not.toContain('runtime')
  })
})
