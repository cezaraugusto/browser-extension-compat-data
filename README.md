[npm-version-image]: https://img.shields.io/npm/v/browser-extension-compat-data.svg?color=0971fe
[npm-version-url]: https://www.npmjs.com/package/browser-extension-compat-data
[npm-downloads-image]: https://img.shields.io/npm/dm/browser-extension-compat-data.svg?color=2ecc40
[npm-downloads-url]: https://www.npmjs.com/package/browser-extension-compat-data
[action-image]: https://github.com/cezaraugusto/browser-extension-compat-data/actions/workflows/ci.yml/badge.svg?branch=main
[action-url]: https://github.com/cezaraugusto/browser-extension-compat-data/actions

[![Version][npm-version-image]][npm-version-url] [![Downloads][npm-downloads-image]][npm-downloads-url] [![workflow][action-image]][action-url]

# browser-extension-compat-data

Validate your browser extension/WebExtension for unsupported manifest fields (and optionally permissions/APIs) using MDN Browser Compat Data.

- Data source: [MDN browser-compat-data (webextensions)](https://github.com/mdn/browser-compat-data/tree/main/webextensions)

## Install

```bash
npm i -D browser-extension-compat-data
# or
pnpm add -D browser-extension-compat-data
# or
yarn add -D browser-extension-compat-data
```

## Quickstart

```ts
import {
  getUnsupportedManifestFields,
  getUnsupportedAPIsFromFile,
  type UnsupportedItem,
} from 'browser-extension-compat-data'

// Manifest: unsupported items for Safari 17
const manifestFindings: UnsupportedItem[] = await getUnsupportedManifestFields(
  './extension/manifest.json',
  { browser: 'safari', version: '17' },
)

// Version is optional (ignore version gating)
await getUnsupportedManifestFields('./extension/manifest.json', {
  browser: 'safari',
})

// File: unsupported APIs for Firefox (fast scan by default)
const apiFindings: UnsupportedItem[] = await getUnsupportedAPIsFromFile(
  './extension/background.js',
  { browser: 'firefox', version: '124' },
)

// Accurate mode parses AST (avoids false positives in strings/comments)
await getUnsupportedAPIsFromFile('./extension/background.js', {
  browser: 'firefox',
  scanMode: 'accurate',
})
```

## API

```ts
type ManifestOptions = {
  browser: string
  version?: string // optional
}

type FileOptions = {
  browser: string
  version?: string // optional
  scanMode?: 'fast' | 'accurate' // default: 'fast'
}

function getUnsupportedManifestFields(
  manifestPath: string,
  options: ManifestOptions,
): Promise<UnsupportedItem[]>

function getUnsupportedAPIsFromFile(
  filePath: string,
  options: FileOptions,
): Promise<UnsupportedItem[]>
```

Each `UnsupportedItem` contains:

- `kind`: `"manifest" | "permission" | "api"`
- `key`: e.g. `"action"`, `"chrome_url_overrides.history"`, `"runtime.sendMessage"`
- `path`: full MDN BCD path
- `reason`: `"not-supported" | "removed" | "partial" | "no-compat-data"`
- `support`: raw MDN support block (when available)
- `mdnUrl`: MDN documentation URL when available

## Performance

- Prebuilt indexes are cached in-process with mtime-based invalidation.
- Fast scan: streaming regex with a small rolling buffer; minimal memory and very fast.
- Accurate scan: single AST parse via acorn; slower but avoids matches in strings/comments.

## Data

This package reads MDN BCD from `data/webextensions` (committed or provisioned by CI). There is no runtime fetch and no override option. The compat data MUST exist at runtime; otherwise, entries may be returned with `reason: "no-compat-data"`.

### What gets synced

- Only the MDN WebExtensions manifest data is synced automatically:
  - Source: `mdn/browser-compat-data/webextensions/manifest`
  - Destination in this repo: `data/webextensions/manifest`
- Permissions and API directories may be empty unless you populate them yourself.

### Update cadence

- A GitHub Actions workflow runs daily at 00:00 UTC to sync manifest data and automatically commits to `main` when changes are detected.
- You can also trigger it manually from the Actions tab ("Update MDN WebExtensions manifest data").

### Local development

If you want to run validations locally without CI-provisioned data, ensure `data/webextensions/manifest` contains JSON files from the MDN BCD `webextensions/manifest` folder.

### Permissions checking

- `getUnsupportedManifestFields` checks permissions by default. To skip permission checks (manifest-only validation), pass `checkPermissions: false`:

```ts
await getUnsupportedManifestFields('./extension/manifest.json', {
  browser: 'safari',
  version: '17',
  checkPermissions: false,
})
```

## FAQ

- What does “not supported” mean?
  - MDN shows `version_added` false/null, or the feature only appears with `version_removed`.
- Do you validate unknown manifest keys?
  - No. Only keys covered by MDN BCD in this package (e.g., `action`, `background`, selected nested keys) and permissions.

## License

MIT (c) Cezar Augusto
