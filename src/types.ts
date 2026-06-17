/** A BCD subtree we index. */
export type Domain = 'manifest' | 'api' | 'permissions'

/**
 * Browsers covered by MDN's WebExtensions compat data. (Mobile Chrome has no
 * extension support, so there is no `chrome_android`.)
 */
export type Browser =
  | 'chrome' |
  'edge' |
  'firefox' |
  'firefox_android' |
  'opera' |
  'safari' |
  'safari_ios'

/**
 * Compact per-browser support, reduced from MDN BCD's verbose support
 * statements to the few fields lookups and validators actually need.
 */
export interface CompactSupport {
  /** Version_added (minimum): a version string, `true` (since forever) or `false`/`null` (known-unsupported). */
  a: string | boolean | null
  /** Version_removed, when the feature was dropped. */
  r?: string | boolean
  /** Partial_implementation flag. */
  p?: boolean
  /** Behind a runtime/config flag (BCD `flags`); not on by default. */
  f?: boolean
}

/** One flattened BCD feature: its MDN url and per-browser support. */
export interface CompactFeature {
  /** Mdn_url, when MDN documents the feature. */
  u?: string
  /** Browser key -> compact support. */
  s: Record<string, CompactSupport>
}

/** Dotted feature key (e.g. `runtime.sendMessage`) -> feature. */
export type DomainMap = Record<string, CompactFeature>

/** The single precomputed index shipped with the package. */
export interface CompactIndex {
  /** Source BCD version (provenance), informational. */
  v?: string
  manifest: DomainMap
  api: DomainMap
  permissions: DomainMap
}

/** Friendly, normalized support shape returned by the lookup API. */
export interface SupportInfo {
  /** True when currently supported (added, not removed, not behind a flag). */
  supported: boolean
  versionAdded: string | boolean | null
  versionRemoved?: string | boolean
  partial?: boolean
  flagged?: boolean
}

/** A single browser/version pair to validate against. */
export interface Target {
  browser: Browser
  version?: string
}

export type Reason =
  | 'not-supported' |
  'removed' |
  'partial' |
  'flag' |
  'manifest-version' |
  'no-compat-data'

/** Source position of an API usage (1-based line, 0-based column). */
export interface SourceLocation {
  line: number
  column: number
}

export interface UnsupportedItem {
  kind: 'manifest' | 'permission' | 'api'
  key: string
  path: string
  reason: Reason
  /** Human-readable explanation (set for manifest-version and flag findings). */
  message?: string
  /** The browser this finding is about. */
  browser?: Browser
  /** Normalized per-browser support (absent for no-compat-data). */
  support?: Record<string, SupportInfo>
  mdnUrl?: string
  /** Source file the finding came from (API findings via analyzeExtension/file scan). */
  file?: string
  /** Source position (API findings in accurate scan mode). */
  loc?: SourceLocation
}

/** Findings for one target, used by multi-target / whole-extension reports. */
export interface TargetReport {
  target: Target
  findings: UnsupportedItem[]
}

export interface ExtensionReport {
  /** Resolved manifest path. */
  manifestPath: string
  /** Source files scanned for API usage. */
  scannedFiles: string[]
  /** One entry per requested target. */
  targets: TargetReport[]
  /** True when no target produced any finding. */
  ok: boolean
}

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
