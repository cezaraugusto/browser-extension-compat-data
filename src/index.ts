export type {
  Domain,
  Browser,
  Target,
  Reason,
  SourceLocation,
  ManifestOptions,
  FileOptions,
  UnsupportedItem,
  TargetReport,
  ExtensionReport,
  SupportInfo,
  CompactIndex,
  CompactFeature,
  CompactSupport
} from './types'

// Browsers
export {BROWSERS, isKnownBrowser, assertBrowser} from './browsers'

// Lookup API: "inform me" about any manifest field, API or permission.
export {
  hasFeature,
  getMdnUrl,
  getSupport,
  getBrowserSupport,
  getMinVersion,
  isSupported,
  listKeys
} from './lookup'

// Validators: "tell me what won't work" for a target browser/version.
export {getUnsupportedManifestFields, evaluateManifest} from './manifest'
export {getUnsupportedAPIsFromFile} from './api'

// Whole-extension, multi-target analysis.
export {analyzeExtension} from './analyze'
export type {AnalyzeOptions} from './analyze'

// Targets, CLI, ESLint plugin, MDN URLs.
export {parseTarget, parseTargets} from './targets'
export {runCli} from './cli'
export {eslintPlugin} from './eslint'
export {buildMdnUrl} from './mdn'

// Generated literal-union key types (opt-in strictness for consumers).
export type {ManifestKey, ApiKey, PermissionKey} from './generated/keys'

// Version helpers.
export {compareVersions} from './version'

// Data source control (mainly for tests / custom datasets).
export {getIndex, setIndex, setIndexFromFile, resetIndex} from './store'

// Deprecated alias for backward compatibility.
export {getUnsupportedManifestFields as getUnsupportedManifest} from './manifest'
