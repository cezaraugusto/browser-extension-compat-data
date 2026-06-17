import {analyzeExtension} from './analyze'
import {parseTargets} from './targets'

import type {ExtensionReport, UnsupportedItem} from './types'

const USAGE = `browser-extension-compat-data , check a WebExtension against MDN compat data

Usage:
  browser-extension-compat-data [dir] --targets <list> [options]

Arguments:
  dir                  Extension directory or path to manifest.json (default: ".")

Options:
  -t, --targets <list> Comma-separated targets, e.g. chrome111,firefox115,safari16.4
      --scan <mode>    "manifest" (referenced files) or "all" (default: manifest)
      --mode <mode>    API scan: "fast" or "accurate" (default: accurate)
      --no-permissions Skip manifest permission checks
      --json           Output JSON
  -h, --help           Show this help

Exit code is non-zero when any finding is reported.`

interface Cli {
  dir: string
  targets: string
  scan: 'manifest' | 'all'
  mode: 'fast' | 'accurate'
  permissions: boolean
  json: boolean
  help: boolean
}

function parseArgs (argv: string[]): Cli {
  const cli: Cli = {
    dir: '.',
    targets: '',
    scan: 'manifest',
    mode: 'accurate',
    permissions: true,
    json: false,
    help: false
  }

  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]

    switch (a) {
      case '-h':
      case '--help':
        cli.help = true
        break
      case '-t':
      case '--targets':
        cli.targets = argv[++i] ?? ''
        break
      case '--scan':
        cli.scan = (argv[++i] as Cli['scan']) ?? 'manifest'
        break
      case '--mode':
        cli.mode = (argv[++i] as Cli['mode']) ?? 'accurate'
        break
      case '--no-permissions':
        cli.permissions = false
        break
      case '--json':
        cli.json = true
        break
      default:
        if (a.startsWith('--targets=')) { cli.targets = a.slice('--targets='.length) } else if (!a.startsWith('-')) positional.push(a)

        break
    }
  }

  if (positional[0]) cli.dir = positional[0]
  return cli
}

const REASON_LABEL: Record<string, string> = {
  'not-supported': 'not supported',
  removed: 'removed',
  partial: 'partial support',
  flag: 'behind a flag',
  'manifest-version': 'manifest version',
  'no-compat-data': 'no compat data'
}

function formatFinding (f: UnsupportedItem): string {
  const where = f.file
    ? ` (${f.file}${f.loc ? `:${f.loc.line}:${f.loc.column}` : ''})`
    : ''

  const label = REASON_LABEL[f.reason] ?? f.reason
  const detail = f.message ? ` , ${f.message}` : ''

  return `    [${label}] ${f.kind}: ${f.key}${where}${detail}`
}

function formatReport (report: ExtensionReport): string {
  const lines: string[] = []

  lines.push(`manifest: ${report.manifestPath}`)
  lines.push(
    `scanned ${report.scannedFiles.length} source file(s)${
      report.scannedFiles.length ? `: ${report.scannedFiles.join(', ')}` : ''}`
  )
  lines.push('')
  for (const tr of report.targets) {
    const name = `${tr.target.browser}${tr.target.version ? ` ${tr.target.version}` : ''}`

    if (tr.findings.length === 0) {
      lines.push(`✓ ${name}: no issues`)
      continue
    }

    lines.push(`✗ ${name}: ${tr.findings.length} issue(s)`)
    for (const f of tr.findings) lines.push(formatFinding(f))
  }

  return lines.join('\n')
}

export async function runCli (argv: string[]): Promise<number> {
  const cli = parseArgs(argv)

  if (cli.help || (!cli.targets && argv.length === 0)) {
    console.log(USAGE)

    return cli.help ? 0 : 1
  }

  if (!cli.targets) {
    console.error('Error: --targets is required.\n')
    console.error(USAGE)

    return 1
  }

  let targets

  try {
    targets = parseTargets(cli.targets)
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`)

    return 1
  }

  let report: ExtensionReport

  try {
    report = await analyzeExtension(cli.dir, targets, {
      checkPermissions: cli.permissions,
      scanMode: cli.mode,
      scan: cli.scan
    })
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`)

    return 1
  }

  if (cli.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatReport(report))
  }
  return report.ok ? 0 : 1
}
