/**
 * dependency-cruiser — architectural boundary guard for the haku monorepo.
 *
 * Encodes the target layering from docs/ARCHITECTURE_AUDIT.md:
 *
 *   schema -> core -> { serializer, engine } -> editor -> editor-app
 *   physics -> physics-rapier
 *   engine -> physics (abstraction);  editor/playground -> physics-rapier (impl)
 *
 * Known current violations (audit §3, §5 — editor/demo code leaking into
 * engine/core) are captured in a baseline so CI only fails on NEW violations:
 *
 *   pnpm depcruise:baseline   # regenerate .dependency-cruiser-known-violations.json
 *   pnpm depcruise            # fail on any violation not in the baseline
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make packages impossible to reason about and extract.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'engine-not-to-editor',
      severity: 'error',
      comment:
        'Runtime engine must not depend on the editor (reverse-layer leak, audit §3).',
      from: { path: '^packages/engine/src' },
      to: { path: '^packages/editor/src' },
    },
    {
      name: 'core-not-to-engine-or-editor',
      severity: 'error',
      comment: 'ECS core is the lowest layer; it must not depend upward.',
      from: { path: '^packages/core/src' },
      to: { path: '^packages/(engine|editor|serializer)/src' },
    },
    {
      name: 'schema-is-a-leaf',
      severity: 'error',
      comment: 'Schema is the base layer and must not depend on any other @haku package.',
      from: { path: '^packages/schema/src' },
      to: { path: '^packages/(core|engine|editor|serializer|physics|physics-rapier)/src' },
    },
    {
      name: 'no-three-in-core-schema-physics',
      severity: 'error',
      comment:
        'core/schema/physics must stay renderer-agnostic — no three.js (audit "good, do not break").',
      from: { path: '^packages/(core|schema|physics)/src' },
      to: { path: 'node_modules/(three|@types/three)' },
    },
    {
      name: 'rapier-impl-restricted',
      severity: 'error',
      comment:
        'The concrete rapier backend may only be wired in editor/playground/tests, never in engine/core/schema runtime code.',
      from: {
        path: '^packages/(engine|core|schema|physics)/src',
        pathNot: '\\.(test|spec)\\.[tj]sx?$',
      },
      to: { path: '^packages/physics-rapier/src' },
    },
    {
      name: 'no-react-in-engine-core',
      severity: 'error',
      comment: 'React is an editor-UI concern; engine/core/schema must not import it.',
      from: { path: '^packages/(engine|core|schema|physics|physics-rapier|serializer)/src' },
      to: { path: 'node_modules/(react|react-dom)' },
    },
    {
      name: 'no-orphan-dead-modules',
      severity: 'warn',
      comment: 'Orphaned modules are usually dead code left after a refactor.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(d\\.ts)$',
          '(^|/)(index|runtime)\\.ts$',
          '\\.(test|spec)\\.[tj]sx?$',
          '(^|/)vite\\.config\\.',
          '(^|/)vitest\\.config\\.',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    exclude: {
      path: ['/dist/', '/public/', 'node_modules'],
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
  },
}
