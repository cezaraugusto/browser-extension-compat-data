import * as fs from 'fs'

import {getFeature, listKeys} from './store'
import {normalizeFeature, verdictForBrowser} from './compat'
import {assertBrowser} from './browsers'

import type {Browser, ManifestOptions, UnsupportedItem} from './types'

type Json = Record<string, unknown>

/** Walk `node` along `segments`, descending into array elements without consuming a segment. */
function isPresent (node: unknown, segments: string[]): boolean {
  if (segments.length === 0) return node !== undefined && node !== null

  if (Array.isArray(node)) return node.some((el) => isPresent(el, segments))

  if (node && typeof node === 'object') {
    const [head, ...rest] = segments

    if (!Object.prototype.hasOwnProperty.call(node, head)) return false
    return isPresent((node as Json)[head], rest)
  }
  return false
}

interface MvRule {
  path: string[]
  /** Manifest version this key belongs to; flagged when the manifest uses the other. */
  onlyIn: 2 | 3
  message: string
}

const MV_RULES: MvRule[] = [
  {
    path: ['browser_action'],
    onlyIn: 2,
    message: 'browser_action is Manifest V2 only; use "action" in MV3.'
  },
  {
    path: ['page_action'],
    onlyIn: 2,
    message: 'page_action is Manifest V2 only; use "action" in MV3.'
  },
  {
    path: ['background', 'scripts'],
    onlyIn: 2,
    message:
      'background.scripts is Manifest V2; MV3 uses background.service_worker (Chrome) or background.scripts with a service worker (Firefox).'
  },
  {
    path: ['background', 'page'],
    onlyIn: 2,
    message: 'background.page is Manifest V2 only.'
  },
  {
    path: ['background', 'persistent'],
    onlyIn: 2,
    message:
      'background.persistent is Manifest V2 only; MV3 background is non-persistent.'
  },
  {
    path: ['action'],
    onlyIn: 3,
    message: 'action is Manifest V3; MV2 uses browser_action / page_action.'
  },
  {
    path: ['background', 'service_worker'],
    onlyIn: 3,
    message: 'background.service_worker is Manifest V3 only.'
  },
  {
    path: ['host_permissions'],
    onlyIn: 3,
    message:
      'host_permissions is Manifest V3; MV2 declares host match patterns in "permissions".'
  }
]

function manifestVersionFindings (manifest: Json): UnsupportedItem[] {
  const mv = manifest.manifest_version

  if (mv !== 2 && mv !== 3) return []

  const findings: UnsupportedItem[] = []

  for (const rule of MV_RULES) {
    if (rule.onlyIn !== mv && isPresent(manifest, rule.path)) {
      const key = rule.path.join('.')

      findings.push({
        kind: 'manifest',
        key,
        path: `webextensions.manifest.${key}`,
        reason: 'manifest-version',
        message: rule.message
      })
    }
  }

  // Web_accessible_resources changed shape between MV2 (string[]) and MV3 (object[]).
  const war = manifest.web_accessible_resources

  if (Array.isArray(war) && war.length > 0) {
    const allObjects = war.every((e) => e && typeof e === 'object')
    const allStrings = war.every((e) => typeof e === 'string')

    if (mv === 3 && allStrings) {
      findings.push({
        kind: 'manifest',
        key: 'web_accessible_resources',
        path: 'webextensions.manifest.web_accessible_resources',
        reason: 'manifest-version',
        message:
          'web_accessible_resources must be an array of objects ({ resources, matches }) in Manifest V3, not an array of strings.'
      })
    } else if (mv === 2 && allObjects) {
      findings.push({
        kind: 'manifest',
        key: 'web_accessible_resources',
        path: 'webextensions.manifest.web_accessible_resources',
        reason: 'manifest-version',
        message:
          'web_accessible_resources must be an array of strings in Manifest V2, not an array of objects.'
      })
    }
  }

  return findings
}

/** Evaluate an already-parsed manifest object against one browser/version. */
export function evaluateManifest (
  manifest: Json,
  browser: Browser,
  version?: string,
  checkPermissions = true
): UnsupportedItem[] {
  const findings: UnsupportedItem[] = [...manifestVersionFindings(manifest)]

  // Every manifest feature MDN knows about, checked when actually used.
  for (const key of listKeys('manifest')) {
    if (!isPresent(manifest, key.split('.'))) continue

    const feature = getFeature('manifest', key)!
    const verdict = verdictForBrowser(feature, browser, version)

    if (!verdict.ok) {
      findings.push({
        kind: 'manifest',
        key,
        path: `webextensions.manifest.${key}`,
        reason: verdict.reason ?? 'not-supported',
        browser,
        support: normalizeFeature(feature),
        mdnUrl: feature.u
      })
    }
  }

  // Named permissions: `permissions` + `optional_permissions`.
  if (checkPermissions) {
    const named = [
      ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
      ...(Array.isArray(manifest.optional_permissions)
        ? manifest.optional_permissions
        : [])
    ]

    for (const raw of named) {
      const permission = String(raw)

      // Host match patterns (e.g. "<all_urls>", "*://*/*") aren't named permissions.
      if (
        permission.includes('://') ||
        permission.includes('*') ||
        permission === '<all_urls>'
      ) {
        continue
      }

      const feature = getFeature('permissions', permission)

      if (!feature) {
        findings.push({
          kind: 'permission',
          key: permission,
          path: `webextensions.permissions.${permission}`,
          reason: 'no-compat-data'
        })
        continue
      }

      const verdict = verdictForBrowser(feature, browser, version)

      if (!verdict.ok) {
        findings.push({
          kind: 'permission',
          key: permission,
          path: `webextensions.permissions.${permission}`,
          reason: verdict.reason ?? 'not-supported',
          browser,
          support: normalizeFeature(feature),
          mdnUrl: feature.u
        })
      }
    }
  }

  return findings
}

export async function getUnsupportedManifestFields (
  manifestPath: string,
  options: ManifestOptions | string
): Promise<UnsupportedItem[]> {
  const browser = assertBrowser(
    typeof options === 'string' ? options : options.browser
  )

  const version = typeof options === 'string' ? undefined : options.version
  const checkPermissions =
    typeof options === 'string' ? true : (options.checkPermissions ?? true)

  const content = await fs.promises.readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(content) as Json

  return evaluateManifest(manifest, browser, version, checkPermissions)
}
