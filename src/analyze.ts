import * as fs from 'fs'
import * as path from 'path'

import {apiNamespaces} from './store'
import {assertBrowser} from './browsers'
import {evaluateManifest} from './manifest'
import {
  collectApiCandidates,
  collectFromContent,
  evaluateApiCandidates
} from './api'
import {extractScripts} from './html'

import type {Candidate} from './api'
import type {ExtensionReport, Target, TargetReport, UnsupportedItem} from './types'

export interface AnalyzeOptions {
  /** Manifest permission checks. Default: true. */
  checkPermissions?: boolean
  /** API scan mode. Default: 'accurate'. */
  scanMode?: 'fast' | 'accurate'
  /** Which sources to scan. Default: 'manifest' (files referenced by the manifest). */
  scan?: 'manifest' | 'all'
  /** Extra source files to scan (resolved relative to the extension dir). */
  files?: string[]
}

type Json = Record<string, unknown>

interface Source {
  rel: string
  candidates: Candidate[]
}

function resolveManifestPath (input: string): string {
  const stat = fs.existsSync(input) ? fs.statSync(input) : null

  if (stat?.isFile()) return input

  const candidate = path.join(input, 'manifest.json')

  if (!fs.existsSync(candidate)) {
    throw new Error(`No manifest.json found at "${input}".`)
  }
  return candidate
}

const SCRIPT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build'])

function globFiles (dir: string, exts: Set<string>): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, {withFileTypes: true})) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(d, entry.name))
      } else if (exts.has(path.extname(entry.name))) {
        out.push(path.join(d, entry.name))
      }
    }
  }

  walk(dir)

  return out
}

function asString (v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

/** HTML entry-points the manifest can reference (popups, options, devtools, overrides…). */
function htmlEntrypoints (manifest: Json): string[] {
  const out: Array<string | undefined> = []
  const get = (obj: unknown, key: string): Json | undefined =>
    (obj && typeof obj === 'object' ? ((obj as Json)[key] as Json) : undefined)

  out.push(asString(get(manifest, 'action')?.default_popup))
  out.push(asString(get(manifest, 'browser_action')?.default_popup))
  out.push(asString(get(manifest, 'page_action')?.default_popup))
  out.push(asString(manifest.options_page))
  out.push(asString(get(manifest, 'options_ui')?.page))
  out.push(asString(get(manifest, 'background')?.page))
  out.push(asString(manifest.devtools_page))
  out.push(asString(get(manifest, 'sidebar_action')?.default_panel))
  out.push(asString(get(manifest, 'side_panel')?.default_path))
  const overrides = get(manifest, 'chrome_url_overrides')

  for (const k of ['newtab', 'bookmarks', 'history']) {
    out.push(asString(overrides?.[k]))
  }

  return out.filter((s): s is string => !!s && !s.includes('://'))
}

function manifestReferencedScripts (dir: string, manifest: Json): string[] {
  const rels: string[] = []
  const bg = manifest.background as Json | undefined

  if (bg) {
    if (typeof bg.service_worker === 'string') rels.push(bg.service_worker)

    if (Array.isArray(bg.scripts)) {
      for (const s of bg.scripts) if (typeof s === 'string') rels.push(s)
    }
  }

  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts as Json[]) {
      if (Array.isArray(cs?.js)) {
        for (const s of cs.js) if (typeof s === 'string') rels.push(s)
      }
    }
  }
  return rels.map((r) => path.resolve(dir, r))
}

const exists = (f: string) => fs.existsSync(f) && fs.statSync(f).isFile()

async function gatherSources (
  dir: string,
  manifest: Json,
  options: AnalyzeOptions,
  scanMode: 'fast' | 'accurate',
  namespaces: Set<string>
): Promise<Source[]> {
  const jsFiles = new Set<string>()
  const htmlFiles = new Set<string>()

  if (options.scan === 'all') {
    for (const f of globFiles(dir, SCRIPT_EXT)) jsFiles.add(f)
    for (const f of globFiles(dir, new Set(['.html', '.htm']))) htmlFiles.add(f)
  } else {
    for (const f of manifestReferencedScripts(dir, manifest)) jsFiles.add(f)
    for (const h of htmlEntrypoints(manifest)) { htmlFiles.add(path.resolve(dir, h)) }
  }

  for (const extra of options.files ?? []) jsFiles.add(path.resolve(dir, extra))

  // Follow HTML: external <script src> become JS files; inline scripts are scanned in place.
  const inline: Array<{rel: string; content: string; lineOffset: number}> = []

  for (const html of htmlFiles) {
    if (!exists(html)) continue

    const {external, inline: blocks} = extractScripts(
      fs.readFileSync(html, 'utf8')
    )

    for (const src of external) {
      if (!src.includes('://')) { jsFiles.add(path.resolve(path.dirname(html), src)) }
    }

    for (const block of blocks) {
      inline.push({
        rel: path.relative(dir, html),
        content: block.content,
        lineOffset: block.line - 1
      })
    }
  }

  const fileSources = await Promise.all(
    Array.from(jsFiles)
      .filter(exists)
      .map(async (file) => ({
        rel: path.relative(dir, file),
        candidates: await collectApiCandidates(file, scanMode, namespaces)
      }))
  )

  const inlineSources = await Promise.all(
    inline.map(async ({rel, content, lineOffset}) => {
      const candidates = (
        await collectFromContent(content, scanMode, namespaces)
      ).map((c) =>
        (c.loc
          ? {
              ...c,
              loc: {line: c.loc.line + lineOffset, column: c.loc.column}
            }
          : c))

      return {rel, candidates}
    })
  )

  return [...fileSources, ...inlineSources]
}

/**
 * Analyze a whole extension (manifest + referenced source, including scripts
 * inside HTML entry-points) against one or more browser/version targets.
 */
export async function analyzeExtension (
  input: string,
  targets: Target[],
  options: AnalyzeOptions = {}
): Promise<ExtensionReport> {
  const manifestPath = resolveManifestPath(input)
  const dir = path.dirname(manifestPath)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Json

  const checkPermissions = options.checkPermissions ?? true
  const scanMode = options.scanMode ?? 'accurate'
  const namespaces = apiNamespaces()

  const sources = await gatherSources(
    dir,
    manifest,
    options,
    scanMode,
    namespaces
  )

  const targetReports: TargetReport[] = targets.map((t) => {
    const browser = assertBrowser(t.browser)
    const findings: UnsupportedItem[] = evaluateManifest(
      manifest,
      browser,
      t.version,
      checkPermissions
    )

    for (const src of sources) {
      findings.push(
        ...evaluateApiCandidates(
          src.candidates,
          browser,
          t.version,
          namespaces,
          src.rel
        )
      )
    }

    return {target: {browser, version: t.version}, findings}
  })

  return {
    manifestPath,
    scannedFiles: Array.from(new Set(sources.map((s) => s.rel))),
    targets: targetReports,
    ok: targetReports.every((r) => r.findings.length === 0)
  }
}
