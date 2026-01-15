export interface ManifestOptions {
  browser: string
  version?: string
  checkPermissions?: boolean
}

export interface FileOptions {
  browser: string
  version?: string
  scanMode?: 'fast' | 'accurate'
}

export type SimpleSupportStatement = {
  version_added: string | boolean | null
  version_removed?: string | boolean | null
  flags?: unknown
  notes?: string | string[]
  prefix?: string
  alternative_name?: string
  partial_implementation?: boolean
}

export type BrowserSupportMap = Record<
  string,
  SimpleSupportStatement | SimpleSupportStatement[]
>

export interface UnsupportedItem {
  kind: 'manifest' | 'permission' | 'api'
  key: string
  path: string
  reason: 'not-supported' | 'removed' | 'partial' | 'no-compat-data'
  support?: BrowserSupportMap
  mdnUrl?: string
}




