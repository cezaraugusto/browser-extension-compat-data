[npm-version-image]: https://img.shields.io/npm/v/browser-extension-compat-data.svg?color=0971fe
[npm-version-url]: https://www.npmjs.com/package/browser-extension-compat-data
[npm-downloads-image]: https://img.shields.io/npm/dm/browser-extension-compat-data.svg?color=2ecc40
[npm-downloads-url]: https://www.npmjs.com/package/browser-extension-compat-data
[action-image]: https://github.com/cezaraugusto/browser-extension-compat-data/actions/workflows/ci.yml/badge.svg?branch=main
[action-url]: https://github.com/cezaraugusto/browser-extension-compat-data/actions

> Validate WebExtensions manifest (and optionally permissions/APIs) against MDN browser-compat-data

# browser-extension-compat-data [![Version][npm-version-image]][npm-version-url] [![Downloads][npm-downloads-image]][npm-downloads-url] [![workflow][action-image]][action-url]

MDN WebExtensions compatibility data (**manifest fields, APIs, and permissions**) in one lean package. Query whether a feature is supported in a browser/version (lookup), lint a whole extension across multiple targets (validate), or wire it into ESLint.

- Data: [MDN browser-compat-data (webextensions)](https://github.com/mdn/browser-compat-data/tree/main/webextensions)
- No runtime fetch. Ships a single compact JSON asset (~24 KiB gzipped), not the full ~15 MB MDN dataset.

## Install

```bash
npm i browser-extension-compat-data
```

## Lookup: "is this supported?"

```ts
import {
  isSupported,
  getSupport,
  getMinVersion,
  getMdnUrl,
} from 'browser-extension-compat-data'

isSupported('api', 'runtime.sendMessage', 'safari') // => true
isSupported('manifest', 'side_panel', 'firefox') // => false
isSupported('api', 'scripting.executeScript', 'chrome', '88') // version-gated

getMinVersion('manifest', 'action', 'chrome') // => "88"
getMdnUrl('permissions', 'tabs') // MDN url (explicit or derived)

getSupport('api', 'runtime.sendMessage')
// { chrome: { supported: true, versionAdded: "26" }, safari: { supported: true, ... }, ... }
```

First arg is the **domain** (`'manifest' | 'api' | 'permissions'`), second the dotted BCD key. An unknown **browser** throws (a typo can never read as a silent pass); the canonical set is in `BROWSERS`.

## Validate a whole extension, across targets

```ts
import { analyzeExtension } from 'browser-extension-compat-data'

const report = await analyzeExtension('./my-extension', [
  { browser: 'chrome', version: '116' },
  { browser: 'firefox', version: '115' },
  { browser: 'safari', version: '16.4' },
])

report.ok // false if any target has findings
report.scannedFiles // sources resolved from the manifest (background, content scripts)
for (const { target, findings } of report.targets) {
  // findings: { kind, key, reason, browser, message?, file?, loc?, mdnUrl?, support? }
}
```

It reads `manifest.json`, checks every field/permission MDN knows about (including `host_permissions` and `optional_permissions`), applies Manifest V2/V3 structural rules, and scans referenced source for `chrome.*`/`browser.*` usage. That scan includes **scripts inside HTML entry-points** (popup, options, devtools, sidebar, new-tab overrides), both external `<script src>` and inline blocks.

Usage resolution follows **destructuring**, **`webextension-polyfill` imports**, and **aliasing**, with `file:line:column` on every finding.

`reason` is one of `not-supported | removed | partial | flag | manifest-version | no-compat-data`.

### Lower-level validators

```ts
import {
  getUnsupportedManifestFields,
  getUnsupportedAPIsFromFile,
} from 'browser-extension-compat-data'

await getUnsupportedManifestFields('./manifest.json', {
  browser: 'safari',
  version: '17',
})
await getUnsupportedAPIsFromFile('./background.js', {
  browser: 'firefox',
  scanMode: 'accurate',
})
```

`scanMode: 'accurate'` (default for `analyzeExtension`) parses the AST and is alias-aware; `'fast'` is a quick regex heuristic.

## CLI

```bash
npx browser-extension-compat-data ./my-extension --targets chrome116,firefox115,safari16.4
```

```
manifest: ./my-extension/manifest.json
scanned 2 source file(s): bg.js, content.js

✓ chrome 116: no issues
✗ firefox 115: 3 issue(s)
    [not supported] manifest: side_panel
    [not supported] api: offscreen.createDocument (bg.js:3:0)
    [no compat data] permission: offscreen
```

Exits non-zero when anything is reported. `--scan all` scans every script in the directory; `--mode fast`; `--no-permissions`; `--json`.

## ESLint plugin

```js
// eslint.config.js
import { eslintPlugin } from 'browser-extension-compat-data'

export default [
  {
    plugins: { 'webext-compat': eslintPlugin },
    rules: {
      'webext-compat/compat': [
        'warn',
        { targets: ['firefox115', 'safari16.4'] },
      ],
    },
  },
]
```

Flags `chrome.*`/`browser.*` calls unsupported by your targets, inline in the editor. It is alias-aware (destructuring, `webextension-polyfill`, aliasing), the same resolution the analyzer uses.

## Typed keys

The generated key unions ship with the package, so consumers can opt into compile-time safety:

```ts
import type {
  ApiKey,
  ManifestKey,
  PermissionKey,
} from 'browser-extension-compat-data'

const used = ['runtime.sendMessage', 'tabs.query'] satisfies ApiKey[] // typo => compile error
```

The runtime functions accept any `string` (so dynamic keys and custom datasets still work); the unions are opt-in.

## API surface

```ts
type Domain = 'manifest' | 'api' | 'permissions'
type Browser = 'chrome' | 'edge' | 'firefox' | 'firefox_android' | 'opera' | 'safari' | 'safari_ios'

// Lookup
isSupported(domain, key, browser, version?) // throws on unknown browser
getSupport(domain, key) / getBrowserSupport(domain, key, browser)
getMinVersion(domain, key, browser) / getMdnUrl(domain, key) / hasFeature(domain, key) / listKeys(domain)

// Validate
analyzeExtension(input, targets, options?) -> ExtensionReport
getUnsupportedManifestFields(path, options) / getUnsupportedAPIsFromFile(path, options)
evaluateManifest(manifestObject, browser, version?, checkPermissions?)

// Browsers / targets / helpers
BROWSERS, isKnownBrowser, assertBrowser, parseTarget, parseTargets
compareVersions, buildMdnUrl, runCli, eslintPlugin

// Data source (tests / custom datasets)
getIndex, setIndex, setIndexFromFile, resetIndex
```

## Data & provenance

The package ships one precomputed file, `src/generated/index.json`, copied to `dist/index.json` at build time and read lazily (not inlined into the bundles). It flattens MDN's `webextensions/{manifest,api,permissions}` into `key -> { u?: mdnUrl, s: { browser: { a, r?, p?, f? } } }` (`a` version_added, `r` version_removed, `p` partial, `f` behind-a-flag). `getIndex().v` reports the upstream BCD version.

A daily GitHub Action re-syncs MDN BCD, rebuilds the index + `src/generated/keys.ts`, and commits only when the data changed.

```bash
# rebuild locally against a checkout of mdn/browser-compat-data
node scripts/build-index.mjs path/to/browser-compat-data/webextensions src/generated/index.json
```

> Node-only at runtime (reads the JSON asset via `fs`).

## Related projects

* [browser-extension-manifest-fields](https://github.com/cezaraugusto/browser-extension-manifest-fields)
* [browser-extension-capabilities](https://github.com/cezaraugusto/browser-extension-capabilities)
* [extension-from-store](https://github.com/cezaraugusto/extension-from-store)
* [chrome-extension-manifest-json-schema](https://github.com/cezaraugusto/chrome-extension-manifest-json-schema)
* [parse5-asset-patcher](https://github.com/cezaraugusto/parse5-asset-patcher)

## License

MIT (c) Cezar Augusto.
