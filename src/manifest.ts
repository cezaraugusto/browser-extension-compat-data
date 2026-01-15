import * as fs from 'fs'
import { ManifestOptions, UnsupportedItem } from './types'
import { dataRoot, getIndexes, pathExists } from './data'
import { extractCompat, getSupportStateForBrowser } from './compat'
import { isBelowMinVersion } from './version'

const MANIFEST_KEY_MAP: Record<string, string[]> = {
  action: ['action'],
  browser_action: ['browser_action'],
  page_action: ['page_action'],
  background: ['background'],
  devtools_page: ['devtools_page'],
  options_ui: ['options_ui'],
  options_page: ['options_page'],
  side_panel: ['side_panel'],
  sidebar_action: ['sidebar_action'],
  chrome_url_overrides: [
    'chrome_url_overrides',
    'chrome_url_overrides.newtab',
    'chrome_url_overrides.bookmarks',
    'chrome_url_overrides.history',
  ],
  sandbox: ['sandbox'],
  web_accessible_resources: ['web_accessible_resources'],
  omnibox: ['omnibox'],
  commands: ['commands'],
  chrome_settings_overrides: [
    'chrome_settings_overrides',
    'chrome_settings_overrides.homepage',
    'chrome_settings_overrides.search_provider',
    'chrome_settings_overrides.startup_pages',
  ],
  declarative_net_request: ['declarative_net_request'],
  tts_engine: ['tts_engine'],
}

export async function getUnsupportedManifestFields(
  manifestPath: string,
  options: ManifestOptions | string,
  _maybeLegacy?: any,
): Promise<UnsupportedItem[]> {
  const browserKey = typeof options === 'string' ? options : options.browser
  const targetVersion =
    typeof options === 'string' ? undefined : options.version
  const checkPermissions =
    typeof options === 'string' ? true : options.checkPermissions ?? true

  const root = dataRoot()
  if (!(await pathExists(root))) {
    console.warn(`Compat data dir not found: ${root}.`)
  }

  const { manifestIndex, permissionIndex } = await getIndexes()

  const manifestContent = await fs.promises.readFile(manifestPath, 'utf8')
  const manifestObject = JSON.parse(manifestContent) as Record<string, unknown>

  const findings: UnsupportedItem[] = []

  for (const manifestKey of Object.keys(MANIFEST_KEY_MAP)) {
    if (!(manifestKey in manifestObject)) continue
    for (const bcdKey of MANIFEST_KEY_MAP[manifestKey]) {
      const [baseKey, subKey] = bcdKey.split('.')
      const baseEntry = manifestIndex.get(baseKey)
      if (!baseEntry) {
        findings.push({
          kind: 'manifest',
          key: bcdKey,
          path: `webextensions.manifest.${bcdKey}`,
          reason: 'no-compat-data',
        })
        continue
      }
      if (subKey) {
        const subNode = (baseEntry.node as any)?.[subKey]
        const compat = extractCompat(
          subNode,
          `webextensions.manifest.${bcdKey}`,
        )
        if (!compat) {
          findings.push({
            kind: 'manifest',
            key: bcdKey,
            path: `webextensions.manifest.${bcdKey}`,
            reason: 'no-compat-data',
          })
          continue
        }
        const supportState = getSupportStateForBrowser(
          compat.support,
          browserKey,
          false,
        )
        const isVersionBlocked = isBelowMinVersion(
          compat.support,
          browserKey,
          targetVersion,
        )
        if (
          supportState.state === 'unsupported' ||
          supportState.state === 'removed' ||
          (supportState.state === 'partial' && false) ||
          isVersionBlocked
        ) {
          findings.push({
            kind: 'manifest',
            key: bcdKey,
            path: compat.path,
            reason: supportState.reason ?? 'not-supported',
            support: compat.support,
            mdnUrl: compat.mdnUrl,
          })
        }
      } else {
        const compat = extractCompat(baseEntry.node, baseEntry.compatPath)
        if (!compat) {
          findings.push({
            kind: 'manifest',
            key: baseKey,
            path: baseEntry.compatPath,
            reason: 'no-compat-data',
          })
          continue
        }
        const supportState = getSupportStateForBrowser(
          compat.support,
          browserKey,
          false,
        )
        const isVersionBlocked = isBelowMinVersion(
          compat.support,
          browserKey,
          targetVersion,
        )
        if (
          supportState.state === 'unsupported' ||
          supportState.state === 'removed' ||
          (supportState.state === 'partial' && false) ||
          isVersionBlocked
        ) {
          findings.push({
            kind: 'manifest',
            key: baseKey,
            path: compat.path,
            reason: supportState.reason ?? 'not-supported',
            support: compat.support,
            mdnUrl: compat.mdnUrl,
          })
        }
      }
    }
  }

  const permissionsArray =
    checkPermissions && Array.isArray((manifestObject as any).permissions)
      ? ((manifestObject as any).permissions as unknown[])
      : []
  for (const permissionRaw of permissionsArray) {
    const permission = String(permissionRaw)
    const permissionEntry = permissionIndex.get(permission)
    if (!permissionEntry) {
      findings.push({
        kind: 'permission',
        key: permission,
        path: `webextensions.permissions.${permission}`,
        reason: 'no-compat-data',
      })
      continue
    }
    const compat = extractCompat(
      permissionEntry.node,
      permissionEntry.compatPath,
    )
    const supportState = getSupportStateForBrowser(
      compat?.support,
      browserKey,
      false,
    )
    const isVersionBlocked = isBelowMinVersion(
      compat?.support,
      browserKey,
      targetVersion,
    )
    if (
      supportState.state === 'unsupported' ||
      supportState.state === 'removed' ||
      (supportState.state === 'partial' && false) ||
      isVersionBlocked
    ) {
      findings.push({
        kind: 'permission',
        key: permission,
        path: compat!.path,
        reason: supportState.reason ?? 'not-supported',
        support: compat?.support,
        mdnUrl: compat?.mdnUrl,
      })
    }
  }

  return findings
}




