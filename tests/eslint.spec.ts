import {describe, test, expect, beforeAll, afterAll} from 'vitest'
import * as acorn from 'acorn'

import {
  eslintPlugin,
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
    }
  }
}

/** Run the rule against source by feeding an acorn Program to its Program() handler. */
function lint (source: string, targets: string[]): string[] {
  const messages: string[] = []
  const context = {
    options: [{targets}],
    report: (d: {message: string}) => messages.push(d.message)
  }

  const handlers = eslintPlugin.rules.compat.create(context) as {
    Program?: (n: unknown) => void
  }

  const ast = acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true
  })

  handlers.Program?.(ast)

  return messages
}

describe('eslint webext-compat rule (alias-aware)', () => {
  beforeAll(() => setIndex(INDEX))
  afterAll(() => resetIndex())

  it('flags direct chrome.* usage unsupported in a target', () => {
    const msgs = lint('chrome.scripting.executeScript({})', ['safari16'])

    expect(msgs.some((m) => m.includes('scripting.executeScript'))).toBe(true)
  })

  it('resolves destructuring + polyfill default import', () => {
    const src = [
      "import browser from 'webextension-polyfill'",
      'const { scripting } = chrome',
      'const { executeScript } = scripting',
      'executeScript({})',
      'browser.tabs.query({})'
    ].join('\n')

    const msgs = lint(src, ['safari16'])

    expect(msgs.some((m) => m.includes('scripting.executeScript'))).toBe(true)
    // Tabs.query is supported in safari 14 -> no message
    expect(msgs.some((m) => m.includes('tabs.query'))).toBe(false)
  })

  it('no messages when everything is supported', () => {
    expect(
      lint('chrome.tabs.query({})', ['chrome120', 'firefox115'])
    ).toHaveLength(0)
  })

  it('destructured namespace + member is reported once, not twice', () => {
    const msgs = lint(
      'const { scripting } = chrome\nscripting.executeScript({})',
      ['safari16']
    )

    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('scripting.executeScript')
  })
})
