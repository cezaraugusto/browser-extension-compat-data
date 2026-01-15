import * as fs from 'fs'
import * as path from 'path'
import { BrowserSupportMap } from './types'

type ManifestIndex = Map<string, { compatPath: string; node: any }>
type PermissionIndex = Map<string, { compatPath: string; node: any }>
type APIIndex = Map<
  string,
  {
    compatPath: string
    node: any
    sub: Map<string, { compatPath: string; node: any }>
    deep?: Map<string, { compatPath: string; node: any }>
  }
>

export function dataRoot(): string {
  return path.resolve(process.cwd(), 'data', 'webextensions')
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function readJSON(filePath: string): any {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

export async function buildIndexes(dataDirectoryPath: string): Promise<{
  manifestIndex: ManifestIndex
  permissionIndex: PermissionIndex
  apiIndex: APIIndex
}> {
  const manifestIndex: ManifestIndex = new Map()
  const permissionIndex: PermissionIndex = new Map()
  const apiIndex: APIIndex = new Map()

  const manifestDirPath = path.join(dataDirectoryPath, 'manifest')
  const permissionsDirPath = path.join(dataDirectoryPath, 'permissions')
  const apiDirPath = path.join(dataDirectoryPath, 'api')

  if (await pathExists(manifestDirPath)) {
    const filenames = await fs.promises.readdir(manifestDirPath)
    for (const filename of filenames) {
      if (!filename.endsWith('.json')) continue
      const json = readJSON(path.join(manifestDirPath, filename))
      const manifestRoot = json?.webextensions?.manifest
      if (!manifestRoot || typeof manifestRoot !== 'object') continue
      for (const manifestKey of Object.keys(manifestRoot)) {
        const node = manifestRoot[manifestKey]
        manifestIndex.set(manifestKey, {
          compatPath: `webextensions.manifest.${manifestKey}`,
          node,
        })
      }
    }
  }

  if (await pathExists(permissionsDirPath)) {
    const filenames = await fs.promises.readdir(permissionsDirPath)
    for (const filename of filenames) {
      if (!filename.endsWith('.json')) continue
      const json = readJSON(path.join(permissionsDirPath, filename))
      const permissionsRoot = json?.webextensions?.permissions
      if (!permissionsRoot || typeof permissionsRoot !== 'object') continue
      for (const permissionKey of Object.keys(permissionsRoot)) {
        const node = permissionsRoot[permissionKey]
        permissionIndex.set(permissionKey, {
          compatPath: `webextensions.permissions.${permissionKey}`,
          node,
        })
      }
    }
  }

  if (await pathExists(apiDirPath)) {
    const filenames = await fs.promises.readdir(apiDirPath)
    for (const filename of filenames) {
      if (!filename.endsWith('.json')) continue
      const json = readJSON(path.join(apiDirPath, filename))
      const apiRoot = json?.webextensions?.api
      if (!apiRoot || typeof apiRoot !== 'object') continue
      for (const namespace of Object.keys(apiRoot)) {
        const node = apiRoot[namespace]
        const sub: Map<string, { compatPath: string; node: any }> = new Map()
        const deep: Map<string, { compatPath: string; node: any }> = new Map()
        if (node && typeof node === 'object') {
          for (const subKey of Object.keys(node)) {
            if (subKey === '__compat') continue
            const subNode = node[subKey]
            if (subNode && typeof subNode === 'object' && '__compat' in subNode) {
              sub.set(subKey, {
                compatPath: `webextensions.api.${namespace}.${subKey}`,
                node: subNode,
              })
            }
            if (subNode && typeof subNode === 'object') {
              for (const deepKey of Object.keys(subNode)) {
                if (deepKey === '__compat') continue
                const deepNode = (subNode as any)[deepKey]
                if (deepNode && typeof deepNode === 'object' && '__compat' in deepNode) {
                  deep.set(`${subKey}.${deepKey}`, {
                    compatPath: `webextensions.api.${namespace}.${subKey}.${deepKey}`,
                    node: deepNode,
                  })
                }
              }
            }
          }
        }
        apiIndex.set(namespace, {
          compatPath: `webextensions.api.${namespace}`,
          node,
          sub,
          deep,
        })
      }
    }
  }

  return { manifestIndex, permissionIndex, apiIndex }
}

let cachedIndexes:
  | ({
      manifestIndex: ManifestIndex
      permissionIndex: PermissionIndex
      apiIndex: APIIndex
      stamp: number
      dir: string
    } | null)
  | null = null

async function computeDirStamp(dirPath: string): Promise<number> {
  let latestModifiedMs = 0
  for (const sub of ['manifest', 'permissions', 'api']) {
    const subPath = path.join(dirPath, sub)
    if (!(await pathExists(subPath))) continue
    const files = await fs.promises.readdir(subPath)
    for (const file of files) {
      const filePath = path.join(subPath, file)
      try {
        const stat = await fs.promises.stat(filePath)
        if (stat.mtimeMs > latestModifiedMs) latestModifiedMs = stat.mtimeMs
      } catch {
        // ignore individual file stat errors
      }
    }
  }
  return latestModifiedMs
}

export async function getIndexes(): Promise<{
  manifestIndex: ManifestIndex
  permissionIndex: PermissionIndex
  apiIndex: APIIndex
}> {
  const root = dataRoot()
  const exists = await pathExists(root)
  if (!exists)
    return {
      manifestIndex: new Map(),
      permissionIndex: new Map(),
      apiIndex: new Map(),
    }
  const stamp = await computeDirStamp(root)
  if (!cachedIndexes || cachedIndexes.dir !== root || cachedIndexes.stamp !== stamp) {
    const built = await buildIndexes(root)
    cachedIndexes = { ...built, stamp, dir: root }
  }
  return {
    manifestIndex: cachedIndexes!.manifestIndex,
    permissionIndex: cachedIndexes!.permissionIndex,
    apiIndex: cachedIndexes!.apiIndex,
  }
}

export function getNodeByPathFromIndexes(
  indexes: {
    manifestIndex: ManifestIndex
    permissionIndex: PermissionIndex
    apiIndex: APIIndex
  },
  featurePath: string,
): any | null {
  const parts = featurePath.split('.')
  if (parts.length < 3 || parts[0] !== 'webextensions') return null
  if (parts[1] === 'manifest') {
    const key = parts[2]
    const entry = indexes.manifestIndex.get(key)
    if (!entry) return null
    if (parts.length === 3) return entry.node
    return (entry.node as any)[parts.slice(3).join('.')]
  }
  if (parts[1] === 'permissions') {
    const key = parts[2]
    const entry = indexes.permissionIndex.get(key)
    return entry?.node ?? null
  }
  if (parts[1] === 'api') {
    const namespace = parts[2]
    const entry = indexes.apiIndex.get(namespace)
    if (!entry) return null
    if (parts.length === 3) return entry.node
    const rest = parts.slice(3)
    if (rest.length === 1) return (entry.node as any)[rest[0]]
    if (rest.length === 2) return ((entry.node as any)[rest[0]] as any)?.[rest[1]]
  }
  return null
}

export type { ManifestIndex, PermissionIndex, APIIndex }




