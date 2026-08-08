import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createHakuProject } from './index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

function filesBelow(path: string): string[] {
  const absoluteRoot = join(ROOT, path)
  const visit = (directory: string): string[] =>
    readdirSync(directory)
      .sort()
      .flatMap((entry) => {
        const absolute = join(directory, entry)
        return statSync(absolute).isDirectory() ? visit(absolute) : [relative(absoluteRoot, absolute)]
      })
  return visit(absoluteRoot)
}

interface WorkspacePackage {
  directory: string
  name: string
  exports: Record<string, { import: string; types: string }>
  dependencies: Record<string, string>
}

function workspacePackages(): WorkspacePackage[] {
  return readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = join(ROOT, 'packages', entry.name, 'package.json')
      if (!existsSync(manifestPath)) return []
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name?: string
        exports?: WorkspacePackage['exports']
        dependencies?: Record<string, string>
      }
      if (!manifest.name?.startsWith('@haku/') || !manifest.exports) return []
      return [
        {
          directory: entry.name,
          name: manifest.name,
          exports: manifest.exports,
          dependencies: manifest.dependencies ?? {},
        },
      ]
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

function publicSpecifier(packageName: string, exportKey: string): string {
  return exportKey === '.' ? packageName : `${packageName}/${exportKey.replace(/^\.\//, '')}`
}

const CAPABILITIES = [
  ['MVP-GRAPH', '@haku/graph', 'typed flow/event and dependency-data graphs'],
  ['MVP-COMPILER', '@haku/graph', 'graph compiler and validated execution plans'],
  ['MVP-GRAPH-RUNTIME', '@haku/graph-runtime', 'plan interpreter, effects, and structured concurrency'],
  ['MVP-SCHEDULER', '@haku/core', 'multi-phase fixed-step scheduler'],
  ['MVP-CHECKPOINT', '@haku/graph-runtime', 'checkpoint, rewind, persistence, and migrations'],
  ['MVP-PREFAB', '@haku/serializer', 'prefab loading and expansion'],
  ['MVP-POOL', '@haku/pool', 'entity pooling and lifecycle integration'],
  ['MVP-PHYSICS', '@haku/physics', 'backend-neutral physics contracts and Rapier adapter'],
  ['MVP-UI', '@haku/ui', 'production DOM UI assets and runtime'],
  ['MVP-AUDIO', '@haku/audio', 'audio contracts, mixer buses, and Web Audio adapter'],
  ['MVP-STORAGE', '@haku/storage', 'asynchronous storage and replication contracts'],
  ['MVP-PLATFORM', '@haku/platform', 'browser platform lifecycle and capability contracts'],
  ['MVP-BUILD', '@haku/build', 'browser-local TypeScript tooling and production build'],
  ['MVP-QA', 'apps/bounce-run', 'development-only browser QA evidence'],
  ['MVP-REPLAY', '@haku/core', 'seeded fixed-tick recording and replay evidence'],
  ['MVP-GENERATOR', 'apps/bounce-run', 'deterministic reachable route generation'],
  ['MVP-BOUNCE-RUN', 'apps/bounce-run', 'engine-only proving game'],
  ['MVP-STATIC-ZIP', '@haku/build/browser-static-export', 'relative self-contained static HTML5 ZIP'],
] as const

const IMPLEMENTED_NOT_DEFERRED = [
  'typed gameplay graphs',
  'graph compiler',
  'plan interpreter',
  'multi-phase scheduler',
  'checkpoint and rewind',
  'prefab expansion',
  'entity pool',
  'DOM UI runtime',
  'Web Audio backend',
  'IndexedDB save storage',
  'browser platform adapter',
  'browser-local build Worker',
  'static HTML5 ZIP',
  'seeded replay',
  'deterministic route generator',
  'Bounce Run',
] as const

describe('M14 release surface documentation', () => {
  it('links the manifest-derived runtime dependency closure for local engine scaffolds', async () => {
    const packages = workspacePackages()
    const byName = new Map(packages.map((workspacePackage) => [workspacePackage.name, workspacePackage]))
    const expected = new Set<string>()
    const visit = (packageName: string): void => {
      if (expected.has(packageName)) return
      expected.add(packageName)
      const workspacePackage = byName.get(packageName)
      for (const dependency of Object.keys(workspacePackage?.dependencies ?? {})) {
        if (dependency.startsWith('@haku/')) visit(dependency)
      }
    }
    visit('@haku/engine')

    const temporaryRoot = mkdtempSync(join(tmpdir(), 'haku-m14-local-link-audit-'))
    try {
      const result = await createHakuProject({
        targetDir: temporaryRoot,
        name: 'local-link-audit',
        engineVersion: `file:${join(ROOT, 'packages/engine')}`,
        git: false,
        install: false,
      })
      const manifest = JSON.parse(readFileSync(join(result.projectDir, 'package.json'), 'utf8')) as {
        pnpm?: { overrides?: Record<string, string> }
      }
      expect(Object.keys(manifest.pnpm?.overrides ?? {}).sort()).toEqual([...expected].sort())
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('derives every workspace public package and export from manifests and documents it', () => {
    const packages = workspacePackages()
    const techstack = read('docs/techstack.md')
    const links = read('docs/links.md')
    const architecture = read('docs/architecture.md')

    expect(packages.length).toBeGreaterThanOrEqual(17)
    for (const workspacePackage of packages) {
      expect(techstack, `${workspacePackage.name} missing from docs/techstack.md`).toContain(
        workspacePackage.name,
      )
      expect(architecture, `${workspacePackage.name} missing from docs/architecture.md`).toContain(
        workspacePackage.name,
      )
      for (const exportKey of Object.keys(workspacePackage.exports)) {
        const specifier = publicSpecifier(workspacePackage.name, exportKey)
        expect(links, `${specifier} missing from docs/links.md`).toContain(`\`${specifier}\``)
      }
    }
  })

  it('maps every implemented MVP capability to a real package or proving app', () => {
    const architecture = read('docs/architecture.md')
    const knownSurfaces = new Set([
      ...workspacePackages().map((workspacePackage) => workspacePackage.name),
      ...workspacePackages().flatMap((workspacePackage) =>
        Object.keys(workspacePackage.exports).map((key) =>
          publicSpecifier(workspacePackage.name, key),
        ),
      ),
      'apps/bounce-run',
    ])

    for (const [id, owner, summary] of CAPABILITIES) {
      expect(knownSurfaces, `${id} names an invented release surface`).toContain(owner)
      expect(architecture, `${id} missing from the implemented capability matrix`).toContain(id)
      expect(architecture, `${id} does not map to ${owner}`).toContain(owner)
      expect(architecture, `${id} summary is undocumented`).toContain(summary)
    }
  })

  it('keeps implemented capabilities out of the deferred backlog', () => {
    const plan = read('docs/engine-game-development-plan.md')
    const deferredBullets = plan
      .slice(plan.indexOf('## Deferred backlog'))
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).replace(/;$/, '').toLowerCase())

    for (const implemented of IMPLEMENTED_NOT_DEFERRED) {
      expect(deferredBullets, `${implemented} is still presented as deferred`).not.toContain(
        implemented.toLowerCase(),
      )
    }
  })

  it('indexes the minimal scene and Bounce Run without claiming games require React or editor code', () => {
    const rootReadme = read('README.md')
    const docsIndex = read('docs/README.md')
    const combined = `${rootReadme}\n${docsIndex}`

    expect(existsSync(join(ROOT, 'examples/minimal.scene.json'))).toBe(true)
    expect(combined).toContain('examples/minimal.scene.json')
    expect(combined).toContain('apps/bounce-run')
    expect(combined).toContain('engine-only')
    expect(rootReadme).not.toContain('Production games depend on `@haku/engine` only.')
    expect(combined).toContain('@haku/engine/runtime')
  })

  it('derives the emitted create-template file set and requires a production-usable relative scaffold', async () => {
    const templateFiles = filesBelow('packages/create/templates')
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'haku-m14-release-audit-'))

    try {
      const result = await createHakuProject({
        targetDir: temporaryRoot,
        name: 'release-audit',
        engineVersion: '0.1.0',
        git: false,
        install: false,
      })
      const emittedFiles = filesBelow(relative(ROOT, result.projectDir))
      const emittedRead = (path: string) => readFileSync(join(result.projectDir, path), 'utf8')
      const html = emittedRead('index.html')
      const viteConfig = emittedRead('vite.config.ts')
      const packageManifest = JSON.parse(emittedRead('package.json')) as {
        scripts: Record<string, string>
        dependencies: Record<string, string>
      }
      const projectManifest = JSON.parse(emittedRead('haku.project.json')) as {
        assetsDir: string
        assets: Array<{ path: string }>
      }
      const source = emittedRead('src/main.ts')
      const createReadme = read('packages/create/README.md')

      expect(emittedFiles).toEqual(templateFiles)
      expect(emittedFiles).toContain('public/assets/scenes/menu.scene.json')
      expect(html).toContain('src="./src/main.ts"')
      expect(viteConfig).toMatch(/base:\s*['"]\.\/['"]/)
      expect(packageManifest.scripts).toMatchObject({
        build: 'tsc && vite build',
        typecheck: 'tsc --noEmit',
      })
      expect(Object.keys(packageManifest.dependencies)).toEqual(['@haku/assets', '@haku/engine'])
      expect(source).toContain("from '@haku/engine/runtime'")
      expect(source).toContain("from '@haku/assets'")
      expect(`${source}\n${html}\n${viteConfig}`).not.toMatch(
        /@haku\/editor|react|monaco|QA|https?:\/\//i,
      )
      for (const asset of projectManifest.assets) {
        expect(existsSync(join(result.projectDir, projectManifest.assetsDir, asset.path))).toBe(true)
      }
      expect(createReadme).toContain('relative')
      expect(createReadme).toContain('pnpm build')
      expect(createReadme).toContain('static HTTP server')
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('documents authoring locations and the Bounce Run run/export workflow honestly', () => {
    const rootReadme = read('README.md')
    const architecture = read('docs/architecture.md')
    const links = read('docs/links.md')
    const docs = `${rootReadme}\n${architecture}\n${links}`

    expect(docs).toContain('graphs/')
    expect(docs).toContain('types/')
    expect(docs).toContain('components/')
    expect(docs).toContain('extensions/')
    expect(docs).toContain('pnpm --filter @haku/bounce-run dev')
    expect(docs).toContain('pnpm --filter @haku/bounce-run build')
    expect(docs).toContain('simple static HTTP server')
    expect(docs).toContain('30 Hz')
    expect(docs).toContain('heap')
    expect(docs).toContain('mobile/touch')
    expect(docs).toContain('deferred')
  })
})
