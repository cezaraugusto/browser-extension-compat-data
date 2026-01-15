import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import * as path from 'path'
import { getUnsupportedAPIsFromFile } from '../src/index'

const originalCwd = process.cwd()
const fixturesDir = path.join(__dirname, 'fixtures')

describe('version-aware API checks', () => {
  beforeAll(() => {
    process.chdir(fixturesDir)
  })
  afterAll(() => {
    process.chdir(originalCwd)
  })

  test('runtime.sendMessage unsupported when target version is below minimum', async () => {
    const entry = path.join(fixturesDir, 'entry.js')
    const res = await getUnsupportedAPIsFromFile(entry, {
      browser: 'chrome',
      version: '5',
    })
    const keys = res.map((r) => r.key)
    expect(keys).toContain('runtime.sendMessage')
  })

  test('runtime.sendMessage supported when target version meets minimum', async () => {
    const entry = path.join(fixturesDir, 'entry.js')
    const res = await getUnsupportedAPIsFromFile(entry, {
      browser: 'chrome',
      version: '6',
    })
    const keys = res.map((r) => r.key)
    expect(keys).not.toContain('runtime.sendMessage')
  })
})
