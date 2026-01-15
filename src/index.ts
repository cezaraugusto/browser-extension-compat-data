export type {
  ManifestOptions,
  FileOptions,
  UnsupportedItem,
  SimpleSupportStatement,
  BrowserSupportMap,
} from './types'

export { getUnsupportedManifestFields } from './manifest'
export { getUnsupportedAPIsFromFile } from './api'

// Deprecated alias for backward compatibility
export { getUnsupportedManifestFields as getUnsupportedManifest } from './manifest'
