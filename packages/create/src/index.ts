import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CreateProjectOptions {
  targetDir: string
  name?: string
  engineVersion?: string
  packageManager?: 'npm' | 'pnpm' | 'yarn'
  git?: boolean
  install?: boolean
}

export interface CreateProjectResult {
  projectDir: string
  name: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, '../templates')

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) copyDir(srcPath, destPath)
    else cpSync(srcPath, destPath)
  }
}

function isNonEmpty(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).length > 0
}

/** When engine is a file: link into the monorepo, wire all @haku/* deps for standalone install. */
function resolveMonorepoPackageLinks(engineVersion: string): Record<string, string> | null {
  if (!engineVersion.startsWith('file:')) return null
  const enginePath = resolve(engineVersion.slice('file:'.length).replace(/\/$/, ''))
  const packagesDir = dirname(enginePath)
  if (!enginePath.endsWith('/engine') && !enginePath.endsWith('\\engine')) return null

  const links: Record<string, string> = {}
  const pending = [enginePath]
  while (pending.length > 0) {
    const packagePath = pending.pop()!
    const manifestPath = join(packagePath, 'package.json')
    if (!existsSync(manifestPath)) return null
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string
      dependencies?: Record<string, string>
    }
    if (!manifest.name?.startsWith('@haku/')) return null
    if (links[manifest.name]) continue

    links[manifest.name] = `file:${packagePath}`
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (!dependency.startsWith('@haku/')) continue
      pending.push(join(packagesDir, dependency.slice('@haku/'.length)))
    }
  }
  return links
}

export async function createHakuProject(
  options: CreateProjectOptions,
): Promise<CreateProjectResult> {
  const name = options.name ?? 'my-game'
  const projectDir = join(options.targetDir, name)
  const engineVersion = options.engineVersion ?? 'latest'
  const packageManager = options.packageManager ?? 'pnpm'
  const git = options.git ?? true
  const install = options.install ?? true

  if (isNonEmpty(projectDir)) {
    throw new Error(`Target directory is not empty: ${projectDir}`)
  }

  mkdirSync(projectDir, { recursive: true })
  copyDir(TEMPLATES_DIR, projectDir)

  const pkgPath = join(projectDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkg.name = name

  const monorepoLinks = resolveMonorepoPackageLinks(engineVersion)
  if (monorepoLinks) {
    for (const [dep, link] of Object.entries(monorepoLinks)) {
      if (dep in pkg.dependencies) {
        pkg.dependencies[dep] = link
      }
    }
    pkg.pnpm = { overrides: monorepoLinks }
  } else {
    pkg.dependencies['@haku/engine'] = engineVersion
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  const manifestPath = join(projectDir, 'haku.project.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  manifest.name = name
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  if (git) {
    execSync('git init', { cwd: projectDir, stdio: 'inherit' })
    execSync('git add .', { cwd: projectDir, stdio: 'inherit' })
    execSync('git commit -m "chore: init haku project"', { cwd: projectDir, stdio: 'inherit' })
  }

  if (install) {
    execSync(`${packageManager} install`, { cwd: projectDir, stdio: 'inherit' })
  }

  return { projectDir, name }
}
