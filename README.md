[npm-version-image]: https://img.shields.io/npm/v/browser-extension-compat-data.svg?color=0971fe
[npm-version-url]: https://www.npmjs.com/package/browser-extension-compat-data

[![Version][npm-version-image]][npm-version-url]

### browser-extension-compat-data

Return NOT supported WebExtensions manifest fields and API usages for a given browser, using MDN Browser Compat Data for WebExtensions.

- Data source: [MDN browser-compat-data (webextensions)](https://github.com/mdn/browser-compat-data/tree/main/webextensions)

### Data

This package reads BCD from `data/webextensions` (committed by CI). There is no runtime fetch and no override option. The compat data MUST exist at runtime; if it does not, treat it as a setup error. For CI and production builds, enable `strict: true` to fail fast when data is missing.

### API

```ts
import {
  getUnsupportedManifest,
  getUnsupportedAPIsFromFile,
  listBrowsers,
  hasBrowserKey,
  getMinSupportedVersion,
  isSupported,
  analyzeFiles,
  analyzeProject,
  generateBaselineMatrix,
  toSARIF,
  toJUnitXML,
  toNDJSON,
  type UnsupportedItem,
} from 'browser-extension-compat-data'

// manifest.json → NOT supported items for Safari
const unsupportedManifest: UnsupportedItem[] = await getUnsupportedManifest(
  './extension/manifest.json',
  'safari',
  {
    // includePartialAsUnsupported: false (default)
    // strict: false (default)
  },
)

// background.js → NOT supported API items for Firefox
const unsupportedAPIs: UnsupportedItem[] = await getUnsupportedAPIsFromFile(
  './extension/background.js',
  'firefox',
)

// utilities
const browsers = await listBrowsers()
const hasSafari = await hasBrowserKey('safari')
const minChrome = await getMinSupportedVersion(
  'webextensions.api.runtime.sendMessage',
  'chrome',
) // "6"
const ok = await isSupported(
  'webextensions.api.runtime.sendMessage',
  'chrome',
  '6',
) // true

// project-level analysis
const proj = await analyzeProject({
  files: ['src/bg.js'],
  manifestPath: 'manifest.json',
  browser: 'safari',
})
// proj = { unsupported, missingPermissions, unusedPermissions }

// baseline matrix across targets
const matrix = await generateBaselineMatrix({
  files: ['src/bg.js'],
  manifestPath: 'manifest.json',
  targets: { chrome: '120', firefox: '124', safari: '17' },
})

// reporters
const sarif = toSARIF(unsupportedAPIs)
const junit = toJUnitXML(unsupportedAPIs)
const ndjson = toNDJSON(unsupportedAPIs)
```

Each `UnsupportedItem` contains:

- `kind`: `"manifest" | "permission" | "api"`
- `key`: e.g. `"action"`, `"chrome_url_overrides.history"`, `"runtime.sendMessage"`
- `path`: full MDN BCD path
- `reason`: `"not-supported" | "removed" | "partial" | "no-compat-data"`
- `support`: raw MDN support block (when available)
- `mdnUrl`: MDN documentation URL when available from BCD

Example return (abbreviated):

```json
[
  {
    "kind": "manifest",
    "key": "action",
    "path": "webextensions.manifest.action",
    "reason": "not-supported",
    "support": {
      "chrome": { "version_added": "88" },
      "safari": { "version_added": false }
    }
  },
  {
    "kind": "api",
    "key": "runtime.sendMessage",
    "path": "webextensions.api.runtime.sendMessage",
    "reason": "removed"
  }
]
```

### Options

```ts
interface AnalyzeOptions {
  strict?: boolean
  includePartialAsUnsupported?: boolean // default false
}
```

- strict: when true, the library throws if the compat data directory (`data/webextensions`) is missing. When false (default), it logs a warning and continues; entries with no compat data are returned with `reason: "no-compat-data"`. Because compat data must be present, prefer `strict: true` in CI and production.
- includePartialAsUnsupported: when true, features marked by MDN as partial implementations are also flagged as `reason: "partial"`. Default is false (partials are treated as supported).

### Precomputed index (CI)

- Generate a single index for fast lookups during runtime/builds:

```bash
pnpm run data:build-index
```

This writes `data/webextensions.index.json` containing precomputed paths that can be loaded quickly by tools.

Notes:

- Browser identifiers must match MDN support keys exactly.
- “Not supported” means MDN shows `version_added` false/null, or the feature is only present with `version_removed`.
- Partial implementations are considered supported by default (you can set `includePartialAsUnsupported: true`).

### Bundler integration (generic suggestions)

- Report formatting

  - Emit structured diagnostics with file id/path and `loc` when possible (map API hits to line/column using a lightweight AST or source maps).
  - Provide severity controls (treat `removed` as error, `not-supported` as warn, `partial` as info).

- Performance & caching

  - Build compat indexes once and cache globally (singleton) to avoid repeated disk reads across plugin/loader instances.
  - Watch `data/webextensions` and invalidate caches on change.

- API analysis accuracy

  - Prefer a fast AST pass (acorn/swc) over regex to avoid false positives and capture more patterns.
  - Follow one level of imports/re-exports inside the current build graph for better coverage.

- Developer experience

  - Emit a JSON summary artifact containing all unsupported items; also expose it as a virtual module for UIs.
  - Link report entries to the MDN BCD path or documentation URL.

- Adapters per ecosystem

  - Webpack: loader for JS/TS modules; plugin to validate `manifest.json` and summarize diagnostics. Use `module.resource` and `this.getOptions()`.
  - Vite/Rollup: plugin using `transform` for modules, `buildStart`/`watchChange` for manifest/data, and `this.emitFile` for the JSON artifact. Use `id` for paths.
  - esbuild: plugin using `onLoad` for modules, `onResolve` to track manifest path, and `build.onEnd` to output summary; use `args.path` for file ids.

- Configuration
  - Allow target versions (e.g., `{ chrome: 120, firefox: 124 }`) and escalate if support < required version.
  - Option to treat `no-compat-data` as warn or error to catch unknowns in CI.

### License

MIT (c) Cezar Augusto
