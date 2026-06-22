/**
 * Flatten MDN browser-compat-data's `webextensions/{manifest,api,permissions}`
 * subtrees into a single compact index that ships with the package.
 *
 * Usage:
 *   node scripts/build-index.mjs [sourceDir] [outFile]
 *
 *   sourceDir  directory containing `webextensions/` (default: ./data, then ./mdn-bcd)
 *   outFile    output path (default: ./src/generated/index.json)
 *
 * The compact shape per feature is `{ u?: mdnUrl, s: { browser: { a, r?, p? } } }`
 * where `a` = version_added, `r` = version_removed, `p` = partial_implementation.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const DOMAINS = ['manifest', 'api', 'permissions']

function firstExisting (candidates) {
  return candidates.find((c) => fs.existsSync(c))
}

const sourceArg = process.argv[2]
const outArg = process.argv[3]

const sourceDir =
  sourceArg ??
  firstExisting([
    path.resolve('data', 'webextensions'),
    path.resolve('mdn-bcd', 'webextensions'),
    path.resolve('data'),
    path.resolve('mdn-bcd')
  ])

const outFile = path.resolve(
  outArg ?? path.join('src', 'generated', 'index.json')
)

if (!sourceDir || !fs.existsSync(sourceDir)) {
  console.error(
    `build-index: source directory not found. Looked for webextensions data, got "${sourceDir}".`
  )
  process.exit(1)
}

const isFlagged = (s) => Array.isArray(s?.flags) && s.flags.length > 0

function decorate (out, s) {
  if (s?.partial_implementation) out.p = true

  if (isFlagged(s)) out.f = true
  return out
}

/** Reduce a BCD statement list to one compact { a, r?, p?, f? }. */
function compactSupport (raw) {
  const list = Array.isArray(raw) ? raw : [raw]
  // Prefer a currently-supported, non-flagged statement (added and not removed).
  const isAddedNotRemoved = (s) => {
    const added = s?.version_added
    const removed = s?.version_removed
    const isAdded = added === true || typeof added === 'string'
    const isRemoved = removed === true || typeof removed === 'string'

    return isAdded && !isRemoved
  }

  const supported = list.filter(isAddedNotRemoved)

  const pickMinAdded = (arr) =>
    arr.slice().sort((a, b) => {
      const av =
        typeof a.version_added === 'string' ? parseFloat(a.version_added) : 0

      const bv =
        typeof b.version_added === 'string' ? parseFloat(b.version_added) : 0

      return av - bv
    })[0]

  if (supported.length) {
    // Prefer an unflagged statement so a flag on one path doesn't mask real support.
    const unflagged = supported.filter((s) => !isFlagged(s))
    const chosen = pickMinAdded(unflagged.length ? unflagged : supported)

    return decorate({a: chosen.version_added}, chosen)
  }

  const removed = list.find((s) => {
    const r = s?.version_removed

    return r === true || typeof r === 'string'
  })

  if (removed) {
    return decorate(
      {a: removed.version_added ?? false, r: removed.version_removed},
      removed
    )
  }

  // Otherwise known-unsupported (version_added false/null) or empty.
  return {a: list[0]?.version_added ?? false}
}

function compactCompat (compat) {
  const feature = {s: {}}

  if (compat.mdn_url) feature.u = compat.mdn_url

  const support = compat.support ?? {}

  for (const browser of Object.keys(support)) {
    feature.s[browser] = compactSupport(support[browser])
  }

  return feature
}

/** Recursively collect every node carrying `__compat`, keyed by dotted path. */
function collect (node, prefix, out) {
  if (!node || typeof node !== 'object') return

  if (node.__compat && typeof node.__compat === 'object' && prefix) {
    out[prefix] = compactCompat(node.__compat)
  }

  for (const key of Object.keys(node)) {
    if (key === '__compat') continue

    const child = node[key]

    if (child && typeof child === 'object') {
      collect(child, prefix ? `${prefix}.${key}` : key, out)
    }
  }
}

/** Build a domain by reading every JSON file in `webextensions/<dir>`. */
function buildFromDir (dir, domainKey, {skip = []} = {}) {
  const dirPath = path.join(sourceDir, dir)
  const out = {}

  if (!fs.existsSync(dirPath)) {
    console.warn(`build-index: no "${dir}" directory at ${dirPath}; skipping.`)

    return out
  }

  for (const filename of fs.readdirSync(dirPath)) {
    if (!filename.endsWith('.json') || skip.includes(filename)) continue

    const json = JSON.parse(
      fs.readFileSync(path.join(dirPath, filename), 'utf8')
    )

    const root = json?.webextensions?.[domainKey]

    if (root && typeof root === 'object') collect(root, '', out)
  }

  return out
}

/**
 * Permissions used in the manifest `permissions` array live under
 * `webextensions.manifest.permissions.<name>` in MDN BCD (there is no separate
 * permissions directory). Lift those into their own flat domain keyed by name.
 */
function buildPermissions () {
  const file = path.join(sourceDir, 'manifest', 'permissions.json')
  const out = {}

  if (!fs.existsSync(file)) {
    console.warn(
      `build-index: no manifest/permissions.json at ${file}; skipping.`
    )

    return out
  }

  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  const node = json?.webextensions?.manifest?.permissions

  if (node && typeof node === 'object') collect(node, '', out)
  return out
}

// Provenance: the upstream BCD version, when available. No timestamp on purpose:
// the index is committed by CI only when data changes, so its content must be
// stable across rebuilds.
function bcdVersion () {
  // SourceDir is `<root>/webextensions`; BCD's package.json sits at `<root>`.
  for (const p of [
    path.join(sourceDir, '..', 'package.json'),
    path.join(sourceDir, 'package.json')
  ]) {
    try {
      if (fs.existsSync(p)) { return JSON.parse(fs.readFileSync(p, 'utf8')).version }
    } catch {
      // Ignore
    }
  }

  return 'unknown'
}

const index = {
  v: bcdVersion()
}

const built = {
  manifest: buildFromDir('manifest', 'manifest', {
    skip: ['permissions.json']
  }),
  api: buildFromDir('api', 'api'),
  permissions: buildPermissions()
}

let total = 0

for (const domain of DOMAINS) {
  index[domain] = built[domain]
  const count = Object.keys(index[domain]).length

  total += count
  console.log(`build-index: ${domain} -> ${count} features`)
}

fs.mkdirSync(path.dirname(outFile), {recursive: true})
fs.writeFileSync(outFile, `${JSON.stringify(index)}\n`)
const bytes = fs.statSync(outFile).size

console.log(
  `build-index: wrote ${total} features to ${outFile} (${(bytes / 1024).toFixed(1)} KiB)`
)

// Emit literal-union key types so consumers can type their own keys strictly.
function unionType (name, keys) {
  if (!keys.length) return `export type ${name} = never\n`

  const body = keys
    .sort()
    .map((k) => `  | ${JSON.stringify(k)}`)
    .join('\n')

  return `export type ${name} =\n${body}\n`
}

const keysFile = path.join(path.dirname(outFile), 'keys.ts')
const keysContent =
  `// AUTO-GENERATED by scripts/build-index.mjs. Do not edit.\n\n${
  unionType('ManifestKey', Object.keys(index.manifest))
  }\n${
  unionType('ApiKey', Object.keys(index.api))
  }\n${
  unionType('PermissionKey', Object.keys(index.permissions))}`

fs.writeFileSync(keysFile, keysContent)
console.log(`build-index: wrote key unions to ${keysFile}`)
