import { getFeature } from './store'
import { verdictForBrowser } from './compat'
import { parseTargets } from './targets'
import { scanApiUsage, ScanNode } from './scan-ast'
import { Reason, Target } from './types'

interface RuleContext {
  options: unknown[]
  report(d: { node: ScanNode; message: string }): void
}

const REASON_LABEL: Record<Reason, string> = {
  'not-supported': 'not supported',
  removed: 'removed',
  partial: 'only partially supported',
  flag: 'available only behind a flag',
  'manifest-version': 'a manifest-version mismatch',
  'no-compat-data': 'undocumented',
}

function resolveApiFeature(apiPath: string) {
  const parts = apiPath.split('.')
  while (parts.length) {
    const key = parts.join('.')
    const feature = getFeature('api', key)
    if (feature) return { key, feature }
    parts.pop()
  }
  return null
}

const compatRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow WebExtension APIs unsupported by the configured browser targets.',
    },
    schema: [
      {
        type: 'object',
        properties: { targets: { type: 'array', items: { type: 'string' } } },
        required: ['targets'],
        additionalProperties: false,
      },
    ],
  },
  create(context: RuleContext) {
    const opts = (context.options[0] ?? {}) as { targets?: string[] }
    let targets: Target[] = []
    try {
      targets = parseTargets(opts.targets ?? [])
    } catch {
      targets = []
    }
    if (!targets.length) return {}

    return {
      // Run once over the whole program so destructuring / polyfill / aliasing resolve.
      Program(program: ScanNode) {
        for (const { path, node } of scanApiUsage(program)) {
          const resolved = resolveApiFeature(path)
          if (!resolved) continue
          const problems: string[] = []
          for (const t of targets) {
            const verdict = verdictForBrowser(
              resolved.feature,
              t.browser,
              t.version,
            )
            if (!verdict.ok) {
              const name = `${t.browser}${t.version ? ` ${t.version}` : ''}`
              problems.push(
                `${REASON_LABEL[verdict.reason ?? 'not-supported']} in ${name}`,
              )
            }
          }
          if (problems.length) {
            context.report({
              node,
              message: `chrome.${resolved.key} is ${problems.join('; ')}.`,
            })
          }
        }
      },
    }
  },
}

/** Flat-config ESLint plugin. Register as `webext-compat`. */
export const eslintPlugin = {
  meta: { name: 'webext-compat' },
  rules: { compat: compatRule },
}
