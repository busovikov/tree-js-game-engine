# @haku — Implementation Plan

> **Audience:** Agent implementing the project from scratch (no prior conversation context).  
> **Goal:** Browser game/app **engine** + separate **editor**. Production projects use only the engine and scene assets — never the editor.

---

## 1. Product Summary

**@haku** is a Three.js-based runtime engine and a standalone resource editor for browser games and applications.


| Package                                          | Role                                    | Ships in production? |
| ------------------------------------------------ | --------------------------------------- | -------------------- |
| `@haku/engine`                                   | Runtime: render, load scenes, game loop | ✅ Yes                |
| `@haku/editor`                                   | Dev tool: edit scenes, cameras, assets  | ❌ No                 |
| `@haku/schema`, `@haku/core`, `@haku/serializer` | Shared contracts and abstractions       | ✅ Yes (no UI)        |


**Key rules:**

- Editor and engine are **separate packages** with a shared **data contract** (scene JSON schema).
- A game project (`apps/playground` or an **external repo** scaffolded via `@haku/create`) depends on `@haku/engine` only.
- Editor uses engine for viewport preview (same render path as runtime).
- Editor-only code (gizmos, undo UI, asset import UI) must **never** leak into engine or production bundles.

---

## 2. Locked Architectural Decisions

Do **not** revisit these unless the user explicitly asks.


| Decision               | Choice                                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm scope              | `@haku/*`                                                                                                                                                                        |
| Monorepo               | pnpm workspaces                                                                                                                                                                  |
| Language               | TypeScript                                                                                                                                                                       |
| 3D library             | Three.js                                                                                                                                                                         |
| Editor UI              | **React 18+** (TypeScript) — `apps/editor` + `@haku/editor` as React component library; state via **Zustand**; Inspector fields as React components generated from Zod schemas   |
| Agent skills           | Install **Phase 0** (§2.1) before any code — Tier 1 engineering + Three.js + React skills                                                                                        |
| Runtime architecture   | **Classic scene graph** (GameObject + components) behind an `**IWorld` abstraction** in `@haku/core` so a future ECS backend can swap in without changing editor or scene format |
| Scene format           | JSON document with versioned schema                                                                                                                                              |
| Prefabs                | **Yes, from v1** — prefabId + overrides in schema                                                                                                                                |
| Render architecture    | **Simulation ≠ Presentation** — component data + systems; `RenderSyncSystem` + `IRenderBackend` sync to Three.js / render buckets                                                |
| Scale / spatial index  | **Out of scope for this plan** — do not implement `ISpatialIndex` or culling optimizations unless requested later                                                                |
| ECS migration          | **Out of scope** — only preserve `IWorld` + `query()` contract; no `@haku/engine-ecs` package in this plan                                                                       |
| Testing                | **Minimal** — serializer roundtrip golden test only                                                                                                                              |
| External game projects | `**@haku/create`** — CLI + `createHakuProject()` scaffolds standalone repo (§8)                                                                                                  |


---

## 2.1 Agent Skills Setup (Phase 0 — before Phase 1)

Install agent skills **before writing project code**. Skills guide implementation quality; they do not replace this plan or project-specific rules.

### Where skills live


| Location               | Scope                                        |
| ---------------------- | -------------------------------------------- |
| `haku/.cursor/skills/` | Project skills (commit to repo; team-shared) |
| `~/.cursor/skills/`    | Optional global copy of generic skills       |


Use the [skills CLI](https://github.com/vercel-labs/skills): `npx skills add …` from the `haku/` repo root.

### Install script

Add `scripts/install-agent-skills.sh` and run it as the **first step**:

```bash
cd haku
chmod +x scripts/install-agent-skills.sh
./scripts/install-agent-skills.sh
```

Script contents (agent must create this file in Phase 0):

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Installing Tier 1 + React agent skills into .cursor/skills/ …"

# --- Tier 1: Engineering workflow ---
npx skills add addyosmani/agent-skills --skill source-driven-development -y
npx skills add addyosmani/agent-skills --skill incremental-implementation -y
npx skills add addyosmani/agent-skills --skill test-driven-development -y
npx skills add addyosmani/agent-skills --skill ci-cd-and-automation -y
npx skills add addyosmani/agent-skills --skill git-workflow-and-versioning -y
npx skills add addyosmani/agent-skills --skill context-engineering -y

# --- Tier 1: Three.js (engine) ---
npx skills add emalorenzo/three-agent-skills --skill three-best-practices -y
npx skills add cloudai-x/threejs-skills --skill threejs-fundamentals -y
npx skills add cloudai-x/threejs-skills --skill threejs-loaders -y
npx skills add cloudai-x/threejs-skills --skill threejs-animation -y
npx skills add cloudai-x/threejs-skills --skill threejs-geometry -y

# --- Tier 1: Git / GitHub ---
npx skills add gardusig/cursor-skills -y

# --- React (editor UI) ---
npx skills add vercel-labs/agent-skills --skill react-best-practices -y
npx skills add vercel-labs/agent-skills --skill composition-patterns -y
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -y
npx skills add addyosmani/agent-skills --skill frontend-ui-engineering -y

echo "Done. Verify: npx skills list"
```

### Skill inventory (what each is for)


| Skill                         | Repo                          | Use in @haku                                           |
| ----------------------------- | ----------------------------- | ------------------------------------------------------ |
| `source-driven-development`   | addyosmani/agent-skills       | Three.js / Vite / React — verify against official docs |
| `incremental-implementation`  | addyosmani/agent-skills       | Small slices per phase; avoid big-bang PRs             |
| `test-driven-development`     | addyosmani/agent-skills       | serializer roundtrip, core unit tests                  |
| `ci-cd-and-automation`        | addyosmani/agent-skills       | pnpm CI: lint, tsc, vitest, build                      |
| `git-workflow-and-versioning` | addyosmani/agent-skills       | Atomic commits per phase milestone                     |
| `context-engineering`         | addyosmani/agent-skills       | AGENTS.md, project map for monorepo                    |
| `three-best-practices`        | emalorenzo/three-agent-skills | Engine: dispose, render loop, GLTF, instancing         |
| `threejs-fundamentals`        | cloudai-x/threejs-skills      | Scene graph, camera, renderer                          |
| `threejs-loaders`             | cloudai-x/threejs-skills      | Asset pipeline, GLTF                                   |
| `threejs-animation`           | cloudai-x/threejs-skills      | AnimationMixer, clips                                  |
| `threejs-geometry`            | cloudai-x/threejs-skills      | Instancing, BufferGeometry                             |
| `gardusig/cursor-skills`      | gardusig/cursor-skills        | Git + GitHub PR workflow                               |
| `react-best-practices`        | vercel-labs/agent-skills      | Editor performance, rerenders                          |
| `composition-patterns`        | vercel-labs/agent-skills      | Panel compound components                              |
| `web-design-guidelines`       | vercel-labs/agent-skills      | Editor a11y, layout                                    |
| `frontend-ui-engineering`     | addyosmani/agent-skills       | Production-quality editor UI                           |


### Skills vs project rules

- **Skills** (above): generic workflows — loaded when relevant.
- **Rules** (Phase 1): `.cursor/rules/` — always-on @haku constraints (package boundaries, `IWorld`, no React in engine).
- **This plan** (`IMPLEMENTATION_PLAN.md`): source of truth for architecture and phases.

Do **not** install React/R3F skills into engine packages. Three.js skills apply to `@haku/engine`; React skills apply to `@haku/editor` and `apps/editor` only.

### Phase 0 deliverables

- [ ] `scripts/install-agent-skills.sh` exists and is executable
- [ ] `./scripts/install-agent-skills.sh` completes without errors
- [ ] `npx skills list` shows Tier 1 + React skills under `haku/.cursor/skills/`
- [ ] Agent reads `IMPLEMENTATION_PLAN.md` before Phase 1

---

## 3. Repository Structure

Create this monorepo layout:

```
haku/
├── packages/
│   ├── schema/           @haku/schema
│   ├── core/             @haku/core
│   ├── serializer/       @haku/serializer
│   ├── engine/           @haku/engine
│   ├── editor/           @haku/editor
│   └── create/           @haku/create       — scaffold external game projects
├── apps/
│   ├── editor/           @haku/editor-app   — standalone editor shell
│   └── playground/       @haku/playground   — minimal game, no editor
├── scripts/
│   └── install-agent-skills.sh   — Phase 0: install Cursor agent skills
├── .cursor/
│   └── skills/                   — installed agent skills (Phase 0)
├── package.json
├── tsconfig.base.json
└── turbo.json            (optional)
```

### Dependency graph (strict)

```
@haku/schema          → (none)
@haku/core            → @haku/schema
@haku/serializer      → @haku/schema, @haku/core
@haku/engine          → @haku/core, @haku/schema, @haku/serializer, three
@haku/editor          → @haku/engine, @haku/core, @haku/schema, @haku/serializer, react, react-dom, zustand
@haku/playground      → @haku/engine
@haku/editor-app      → @haku/editor
@haku/create          → @haku/schema (templates only; no engine runtime dep)
```

### Package boundary rules

1. `@haku/engine` must **not** depend on `@haku/editor`, **react**, or **react-dom**.
2. `@haku/playground` must **not** depend on `@haku/editor`, **react**, or **react-dom**.
3. Enforce with ESLint `no-restricted-imports` and/or `depcheck` in CI.
4. `@haku/engine` exports:
  - `"."` — full runtime API
  - `"./runtime"` — tree-shake friendly entry for games (no dev re-exports)
5. CI (or a script): build `playground` and assert bundle contains no strings like `editor`, `TransformControls`, `inspector`, `react-dom`.

---

## 4. Core Abstractions (`@haku/core`)

These interfaces are the **stability contract** between editor, serializer, and engine. Implement scene graph now; ECS later without breaking callers.

### 4.1 Entity identity

```typescript
interface EntityId { readonly __brand: 'EntityId' }
```

- Stored in JSON as **UUID v4** strings — never array indices.
- Stable across save/load, copy/paste, prefab instantiation.

### 4.2 IWorld

```typescript
interface IWorld {
  createEntity(name?: string): EntityId
  destroyEntity(id: EntityId): void
  hasEntity(id: EntityId): boolean

  addComponent<T>(id: EntityId, type: ComponentType<T>, data: T): void
  removeComponent(id: EntityId, type: ComponentType): void
  getComponent<T>(id: EntityId, type: ComponentType<T>): T | undefined
  hasComponent(id: EntityId, type: ComponentType): boolean

  setParent(child: EntityId, parent: EntityId | null): void
  getParent(id: EntityId): EntityId | null
  getChildren(id: EntityId): readonly EntityId[]

  query(...types: ComponentType[]): Iterable<EntityId>
}
```

**Rules for implementers:**

- Components are **plain data only** — no methods, no Three.js objects.
- Game logic uses `world.query(...)`, **not** tree traversal (`root.children.forEach`).
- Scene graph implementation: internal `GameObject` map + parent/child links.
- Future ECS: same public API, different internal storage.

### 4.3 ISystem

```typescript
interface ISystem {
  readonly order?: number
  update(world: IWorld, dt: number): void
}
```

### 4.4 ComponentType + registry

```typescript
interface ComponentType<T = unknown> {
  readonly id: string           // stable string, e.g. "MeshRenderer"
  readonly schema: ZodType<T>   // validation in editor + runtime
  readonly defaults?: () => T
}

interface ComponentRegistry {
  register(type: ComponentType): void
  get(typeId: string): ComponentType | undefined
  all(): ComponentType[]
}
```

Custom game components register in both editor and playground.

### 4.5 IRenderBackend

```typescript
interface IRenderBackend {
  attach(world: IWorld): void
  detach(): void
  setActiveCamera(entityId: EntityId): void
  render(): void
  resize(width: number, height: number): void
}
```

- `ThreeRenderBackend` lives in `@haku/engine`.
- Editor viewport and playground both use this — **no direct Three.js in editor** except inside engine.

### 4.6 Render buckets (schema + engine)

Entities reference render **prototypes**, not raw Three.js objects.

```typescript
type RenderMode = 'mesh' | 'instanced' | 'batched' | 'sprite-atlas'

interface RenderPrototype {
  id: string
  mode: RenderMode
  sourceAsset: string
}
```

- `MeshRenderer` component holds `prototypeId` (and optional material overrides).
- `RenderSyncSystem` maps entities → GPU representation (individual mesh, instanced bucket, etc.).
- Editor edits component data only; bucket allocation is engine-internal.

---

## 5. Scene Document Format v1 (`@haku/schema`)

### 5.1 Top-level structure

```json
{
  "schemaVersion": 1,
  "metadata": { "name": "Level01" },
  "entities": [ /* EntityRecord[] */ ],
  "prototypes": { /* RenderPrototype map */ },
  "prefabs": { /* PrefabDefinition map */ }
}
```

### 5.2 Entity record

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "MainCamera",
  "parent": null,
  "components": [
    {
      "type": "Transform",
      "data": {
        "position": [0, 2, 5],
        "rotation": [0, 0, 0, 1],
        "scale": [1, 1, 1]
      }
    },
    {
      "type": "Camera",
      "data": { "fov": 60, "near": 0.1, "far": 1000 }
    }
  ]
}
```

**Conventions:**

- `parent`: entity UUID or `null` (parent is **not** inside Transform).
- `rotation`: **quaternion** `[x, y, z, w]` in JSON (pick one format and stick to it).
- Component `type`: stable string matching `ComponentType.id`.
- References use `$ref`:
  - `{ "$ref": "entity:uuid" }`
  - `{ "$ref": "asset:assets/models/tree.glb" }`
  - `{ "$ref": "prefab:props/tree_oak" }`

### 5.3 Prefab model (required in v1)

```json
{
  "type": "PrefabInstance",
  "data": {
    "prefabId": "props/tree_oak",
    "overrides": {
      "Transform": { "position": [1, 0, 3] }
    }
  }
}
```

- Prefab definitions live in `prefabs` map or separate `.prefab.json` files (choose one approach, document it).
- Resolver expands prefab → entity subtree at load time.
- Same prefabId → same render bucket / instancing group in engine.

### 5.4 Core components v1


| Component      | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `Transform`    | position, rotation (quat), scale                                  |
| `Camera`       | fov, near, far, ortho options                                     |
| `Light`        | type (directional/point/spot), color, intensity                   |
| `MeshRenderer` | prototypeId, material overrides                                   |
| `ScriptRef`    | path string to external script module, e.g. `"scripts/player.ts"` |


No inline script source in scene JSON.

### 5.5 Schema migrations

- Every breaking change bumps `schemaVersion`.
- `@haku/serializer` includes migration functions (`v1 → v2`).
- Implement v1 only in this plan.

---

## 6. Editor Architecture (`@haku/editor`)

**React 18+** with TypeScript. `@haku/editor` exports React components and hooks; `apps/editor` is the Vite shell that mounts the editor app.

**Stack:** React, Zustand (editor state), Vite (build). No React in `@haku/engine` or `@haku/playground`.

### 6.1 Modules

```
EditorApp (React root)
├── EditorLayout           — split/dock panels (react-resizable-panels or similar)
├── useEditorStore         — Zustand: selection, activeScene, mode (edit/play), project path
├── CommandBus             — execute / undo / redo (framework-agnostic class, used from hooks)
├── panels/
│   ├── HierarchyPanel     — entity tree, reparent, create/delete
│   ├── InspectorPanel     — schema-driven fields (Transform, Camera, Light, MeshRenderer, ScriptRef)
│   ├── ViewportPanel      — <canvas ref> + @haku/engine lifecycle in useEffect
│   └── AssetBrowserPanel  — project files, import, drag to scene
└── ProjectService         — open folder, read/write scene + asset files (no React)
```

### 6.2 UI patterns

- **Zustand store** for selection, scene path, edit/play mode — panels subscribe via hooks.
- **Inspector:** React components per field type (`NumberField`, `Vec3Field`, …); map from `ComponentRegistry` + Zod schema where possible.
- **Viewport:** single `<canvas ref={canvasRef}>`, Engine created in `useEffect`, destroyed on unmount; do not put Three.js objects in React state.
- **Performance:** memoize heavy panels; avoid re-rendering Viewport on every inspector keystroke (split store slices).
- **Gizmos** (`TransformControls` or equivalent): **editor package only**, never exported from engine.
- Follow installed skills: `react-best-practices`, `composition-patterns`, `frontend-ui-engineering`, `web-design-guidelines`.

### 6.3 Edit mode vs Play mode


|                  | Edit mode | Play mode                                     |
| ---------------- | --------- | --------------------------------------------- |
| Gizmos           | ✅         | ❌                                             |
| Undo             | ✅         | ❌                                             |
| Gameplay systems | ❌         | ✅                                             |
| World state      | live      | snapshot → run → **restore snapshot** on stop |


Implement `WorldSnapshot` via serialize/deserialize or deep clone of component data early — required for Play mode + undo.

### 6.4 Command pattern (undo/redo)

```typescript
interface Command {
  execute(): void
  undo(): void
  merge?(other: Command): Command | null
}
```

All mutations go through commands (transform drag, add component, reparent, property edit).

---

## 7. Asset Pipeline

- **Scenes:** `*.scene.json`
- **Prefabs:** `*.prefab.json` (if separate from scene)
- **Binary assets:** `assets/models/`, `assets/textures/`, etc.
- **Scripts:** `scripts/` — referenced by `ScriptRef`, bundled by game project (not editor).

Editor responsibilities: import files, update manifest, write refs into scene.  
Engine responsibilities: load by path/id at runtime.

Document GLTF import convention: imported model → entity subtree rooted at new entity (define in README when implementing).

---

## 8. External Game Project (Separate Repo)

Games ship **outside** the haku monorepo. The monorepo provides a scaffolder — `**@haku/create`** — that initializes a standalone project the editor can open.

### 8.1 Target layout

Scaffolder creates this structure (default name `my-game`, overridable):

```
my-game/
├── package.json              # dependency: @haku/engine only
├── haku.project.json         # project manifest for editor (name, entry scene)
├── index.html
├── vite.config.ts
├── tsconfig.json
├── .gitignore
├── src/
│   └── main.ts               # bootstrap Engine + custom logic
├── assets/
│   ├── scenes/
│   │   └── menu.scene.json   # starter scene (valid schema v1)
│   ├── models/
│   │   └── .gitkeep
│   └── textures/
│       └── .gitkeep
└── scripts/
    └── player.ts             # example ScriptRef target (optional)
```

**Rules:**

- No `@haku/editor` in `package.json` or imports.
- Scenes live under `assets/scenes/`; binary assets under `assets/models/`, `assets/textures/`.
- Game logic in `src/main.ts` + optional `scripts/` modules referenced by `ScriptRef` in scenes.
- `apps/playground` inside the monorepo follows the **same layout** (reference implementation).

### 8.2 Project manifest — `haku.project.json`

Editor uses this file to recognize and open a game project:

```json
{
  "name": "my-game",
  "entryScene": "assets/scenes/menu.scene.json",
  "assetsDir": "assets",
  "scriptsDir": "scripts"
}
```

Scaffolder writes this file on init. Editor `ProjectService` reads it when opening a folder.

### 8.3 `@haku/create` package

**Location:** `packages/create`  
**CLI bin:** `create-haku` (or `haku-create`)

#### Public API

```typescript
export interface CreateProjectOptions {
  /** Absolute or relative path where the project folder is created */
  targetDir: string
  /** Folder name / project name (default: "my-game") */
  name?: string
  /** @haku/engine version or range (default: latest published) */
  engineVersion?: string
  /** npm | pnpm | yarn (default: detect from user-agent or "pnpm") */
  packageManager?: 'npm' | 'pnpm' | 'yarn'
  /** Run git init + initial commit (default: true) */
  git?: boolean
  /** Install dependencies after scaffold (default: true) */
  install?: boolean
}

export interface CreateProjectResult {
  projectDir: string
  name: string
}

/** Create a new haku game project on disk. */
export function createHakuProject(options: CreateProjectOptions): Promise<CreateProjectResult>
```

#### CLI usage

```bash
# published (future)
pnpm create @haku/game my-game
# or
npx @haku/create my-game

# local dev (from haku monorepo)
pnpm --filter @haku/create exec create-haku ../my-game --name my-game
```

#### What `createHakuProject` does (ordered steps)

1. Resolve `projectDir = join(targetDir, name)`.
2. Fail if `projectDir` exists and is non-empty.
3. Create directory tree (`src/`, `assets/scenes|models|textures/`, `scripts/`).
4. Copy embedded **templates** from `packages/create/templates/`:
  - `package.json` — `"dependencies": { "@haku/engine": "<engineVersion>" }`, scripts `dev` / `build` / `preview`
  - `src/main.ts` — create canvas, `Engine`, load `haku.project.json` → `entryScene`, start loop
  - `index.html`, `vite.config.ts`, `tsconfig.json`, `.gitignore`
  - `haku.project.json`
  - `assets/scenes/menu.scene.json` — minimal valid scene (camera + light; no mesh required)
  - `scripts/player.ts` — stub implementing script hook interface (placeholder until engine script system exists)
5. Optionally `git init` + initial commit `"chore: init haku project"`.
6. Optionally run `pnpm install` / `npm install` in `projectDir`.
7. Return `{ projectDir, name }`.

#### Template `src/main.ts` (behavioral spec)

```typescript
import { Engine, SceneLoader } from '@haku/engine/runtime'
import project from '../haku.project.json'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const engine = new Engine({ canvas })

const world = await SceneLoader.load(project.entryScene)
engine.loadWorld(world)
engine.start()
```

(Adjust imports to match actual `@haku/engine` API when implemented.)

#### Local development linking

Document in README: until `@haku/engine` is published, scaffold with:

```bash
create-haku ../my-game --engine-version "file:../haku/packages/engine"
```

Or manually set `"@haku/engine": "workspace:*"` only when game lives inside a pnpm workspace (external repos use npm version or `file:` path).

### 8.4 Editor integration

- **Open Project** in editor: user selects `my-game/` root (folder containing `haku.project.json`).
- Editor reads/writes `assets/scenes/*.scene.json` and assets; never adds editor deps to `package.json`.
- **Play in editor** uses the same scene paths as the game's `entryScene`.

### 8.5 Workflow summary

```
1. create-haku ../my-game
2. Open ../my-game in @haku/editor-app
3. Edit assets/scenes/menu.scene.json (+ models, prefabs)
4. cd ../my-game && pnpm dev          → runtime only, no editor
5. pnpm build                           → production bundle, audit: no editor code
```

---

## 9. Implementation Phases

Execute **in order**. Each phase ends with verifiable deliverables. Do not skip ahead.


| Phase | Name                    | Main packages                                   |
| ----- | ----------------------- | ----------------------------------------------- |
| 0     | Agent Skills Setup      | `scripts/`, `.cursor/skills/`                   |
| 1     | Foundation              | `@haku/schema`, `@haku/core`                    |
| 2     | Engine                  | `@haku/engine`, `apps/playground`               |
| 3     | Serializer              | `@haku/serializer`                              |
| 4     | Editor (React)          | `@haku/editor`, `apps/editor`                   |
| 5     | Undo, Assets, Play Mode | `@haku/editor`, `@haku/engine`                  |
| 6     | Game Project Scaffolder | `@haku/create`, `@haku/editor` (ProjectService) |


---

### Phase 0 — Agent Skills Setup

**Prerequisite:** Empty or freshly cloned `haku/` repo.

**Tasks:**

1. Create `scripts/install-agent-skills.sh` (contents in §2.1).
2. Run `./scripts/install-agent-skills.sh`.
3. Optionally add `AGENTS.md` at repo root pointing to `IMPLEMENTATION_PLAN.md` and monorepo map (use `context-engineering` skill).
4. Read this plan end-to-end before Phase 1.

**Deliverables:**

- [ ] All skills from §2.1 installed under `.cursor/skills/`
- [ ] `npx skills list` confirms installation
- [ ] Agent acknowledges Phase 0 complete before scaffolding monorepo

---

### Phase 1 — Foundation

**Packages:** `@haku/schema`, `@haku/core`, monorepo scaffolding

**Tasks:**

1. Initialize pnpm monorepo with `packages/*` and `apps/*`.
2. Shared TypeScript config (`tsconfig.base.json`), ESLint, Prettier.
3. `@haku/schema`:
  - Zod schemas for scene document v1, all core components, prefab, `$ref` types.
  - Export TypeScript types inferred from Zod.
4. `@haku/core`:
  - `EntityId`, `ComponentType`, `ComponentRegistry`, `IWorld`, `ISystem`, `IRenderBackend` interfaces.
  - Scene graph `World` class implementing `IWorld` (in-memory only, no Three.js yet).
  - `query()` implementation over component maps.
5. ESLint rule: `@haku/core` must not import `three` or `dom` types.

**Deliverables:**

- [ ] `pnpm install && pnpm build` succeeds
- [ ] Unit smoke test: create world, add entity + Transform + Camera, query works
- [ ] Example `examples/minimal.scene.json` validates against schema

---

### Phase 2 — Engine

**Packages:** `@haku/engine`, `apps/playground` (skeleton)

**Tasks:**

1. `@haku/engine`:
  - `Engine` class: canvas, game loop, delta time, system runner.
  - `ThreeRenderBackend` implementing `IRenderBackend`.
  - `RenderSyncSystem`: sync `Transform` + `MeshRenderer` + `Light` + `Camera` → Three.js.
  - Basic render bucket scaffolding (at minimum: `mesh` mode; stub hooks for `instanced`, `batched`, `sprite-atlas`).
  - Hardcoded or programmatic test scene (before serializer exists).
2. `apps/playground`:
  - Vite app, single canvas, imports `@haku/engine/runtime`.
  - Renders test scene with camera + mesh + light.

**Deliverables:**

- [ ] `pnpm --filter @haku/playground dev` shows rendered 3D scene
- [ ] No `@haku/editor` in playground dependencies
- [ ] `IRenderBackend` usable without editor code

---

### Phase 3 — Serializer

**Packages:** `@haku/serializer`

**Tasks:**

1. `loadSceneDocument(json | path): IWorld` — parse, validate with Zod, build world.
2. `saveSceneDocument(world): SceneDocument` — serialize entities, components, hierarchy.
3. Prefab resolver: expand `PrefabInstance` using `prefabs` map.
4. `$ref` resolution for assets (store refs; engine resolves paths at load).
5. Roundtrip test (golden file):
  - Load `examples/minimal.scene.json` → save → deep equal (or semantic equal) to original.

**Deliverables:**

- [ ] Playground loads scene from JSON file instead of hardcoded setup
- [ ] Golden roundtrip test passes in CI
- [ ] Invalid JSON rejected with clear Zod errors

---

### Phase 4 — Editor (React)

**Packages:** `@haku/editor`, `apps/editor`

**Tasks:**

1. `**@haku/editor`:** React library setup (tsup/vite), peer deps: `react`, `react-dom`, `zustand`.
2. `**apps/editor`:** Vite + React app shell; imports `@haku/editor`.
3. **Zustand store:** selection, active scene path, edit/play mode, project root.
4. **EditorLayout:** docked panels (Hierarchy | Viewport | Inspector | Assets).
5. **HierarchyPanel:** entity tree from `IWorld`, select entity, create/delete, reparent.
6. **InspectorPanel:** React field components for Transform, Camera, Light, MeshRenderer, ScriptRef.
7. **ViewportPanel:** canvas ref + `@haku/engine` in `useEffect`; editor orbit controls.
8. **ProjectService:** read/write `*.scene.json`, list project files (open `apps/playground` or any folder with scenes).
9. Wire save/load: editor ↔ serializer ↔ world.

> `haku.project.json` manifest support — **Phase 6** (after scaffolder exists).

**Deliverables:**

- [ ] Open playground project folder in editor
- [ ] Edit transform in inspector → updates viewport
- [ ] Save scene → reload → changes persist
- [ ] Editor bundle does not need to be imported by playground

---

### Phase 5 — Undo, Assets, Play Mode

**Packages:** `@haku/editor` (extend), `@haku/engine` (minor Play mode hooks)

**Tasks:**

1. **CommandBus** with undo/redo stack; wire Hierarchy, Inspector, gizmo transforms.
2. **Transform gizmo** in viewport (editor-only, e.g. Three.js `TransformControls` wrapped in editor).
3. **AssetBrowserPanel:**
  - Show project `assets/` tree.
  - Import/copy asset files.
  - Assign asset to `MeshRenderer` / prototype.
4. **Prefab workflow:**
  - Create prefab from entity subtree.
  - Place prefab instance in scene.
5. **Play mode:**
  - Snapshot world on Play.
  - Start engine systems (placeholder script system OK).
  - Stop → restore snapshot, return to edit mode.
6. **ComponentRegistry** wired in editor: auto-generate inspector from Zod schema where possible.

**Deliverables:**

- [ ] Undo/redo for transform edit and entity create/delete
- [ ] Import GLTF/PNG into assets folder and assign to entity
- [ ] Create prefab + place instance with override
- [ ] Play → simulate → Stop restores editor state
- [ ] Serializer roundtrip test still passes

---

### Phase 6 — Game Project Scaffolder

**Packages:** `@haku/create`, `@haku/editor` (ProjectService extend), `apps/playground` (align layout)

**Prerequisite:** Phases 1–5 complete (engine, serializer, editor with Play mode).

**Tasks:**

1. `**@haku/create` package** (see §8.3):
  - Implement `createHakuProject()` API.
  - CLI bin `create-haku` with args: `[targetDir]`, `--name`, `--engine-version`, `--no-git`, `--no-install`.
2. **Templates** in `packages/create/templates/` matching §8.1:
  - `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `.gitignore`
  - `haku.project.json`, `src/main.ts`
  - `assets/scenes/menu.scene.json`, `assets/models/.gitkeep`, `assets/textures/.gitkeep`
  - `scripts/player.ts` stub
3. **Align `apps/playground`** with the same layout as external template (reference implementation).
4. **Editor `ProjectService`:**
  - Detect project root via `haku.project.json`.
  - Load `entryScene` on open; resolve paths relative to project root.
5. **Documentation:**
  - README in `@haku/create`: `pnpm create @haku/game`, local `file:` linking (§8.3).
  - Verify production bundle of scaffolded project contains no editor code.

**Deliverables:**

- [ ] `create-haku /tmp/my-game` creates valid standalone repo
- [ ] `cd /tmp/my-game && pnpm install && pnpm dev` loads `menu.scene.json` via `@haku/engine` only
- [ ] Editor opens `/tmp/my-game`, edits scene, saves — changes persist
- [ ] `apps/playground` matches external template structure
- [ ] Optional: `git init` + initial commit when `--git` (default on)

---

## 10. Explicitly Out of Scope

Do **not** implement unless the user asks in a follow-up:

- `ISpatialIndex`, frustum culling, logic sleep for 6000 objects
- `@haku/engine-ecs` or full ECS backend
- Multi-user / collaboration
- Advanced material editor
- Mobile export pipelines
- Comprehensive test suite beyond serializer roundtrip
- Plugin SDK documentation beyond `ComponentRegistry`

---

## 11. Tech Stack Reference


| Layer         | Choice                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------ |
| 3D            | Three.js (recent r16x+)                                                                    |
| Language      | TypeScript                                                                                 |
| Monorepo      | pnpm workspaces                                                                            |
| Validation    | Zod                                                                                        |
| Build         | Vite (apps) + tsc or tsup (packages)                                                       |
| Editor UI     | React 18 + Zustand; Vite for `apps/editor`                                                 |
| Editor skills | react-best-practices, composition-patterns, web-design-guidelines, frontend-ui-engineering |
| Engine skills | three-best-practices, threejs-* (see §2.1)                                                 |
| Gizmos        | Three.js TransformControls (editor only)                                                   |


---

## 12. Success Criteria (Project Complete)

1. **Playground** runs a scene from JSON using **only** `@haku/engine`.
2. **Editor app** opens a project, edits entities/components visually, saves scenes and prefabs.
3. **Play mode** in editor matches playground render behavior.
4. **Production bundle** of playground contains zero editor code.
5. **Scene format v1** is documented by example JSON + Zod schemas in `@haku/schema`.
6. **Serializer roundtrip** golden test passes.
7. `**IWorld` API** is the only way editor and engine mutate/query entities — no leaked Three.js objects into component data.
8. `**create-haku my-game`** scaffolds an external repo; game runs with `@haku/engine` only; editor opens and edits that project.

---

## 13. Suggested First Commands for Agent

```bash
mkdir -p haku && cd haku
# Phase 0 first:
mkdir -p scripts .cursor/skills
# create scripts/install-agent-skills.sh (see §2.1), then:
./scripts/install-agent-skills.sh
# Phase 1:
pnpm init
# create pnpm-workspace.yaml, packages/*, apps/*
# scaffold @haku/schema and @haku/core
```

Start with **Phase 0**, then **Phase 1**. Ask the user only if a requirement is ambiguous — architectural decisions in this document are final.

---

## Appendix A — Example Minimal Scene

```json
{
  "schemaVersion": 1,
  "metadata": { "name": "Minimal" },
  "prototypes": {
    "box": { "id": "box", "mode": "mesh", "sourceAsset": "assets/models/box.glb" }
  },
  "prefabs": {},
  "entities": [
    {
      "id": "a0000000-0000-4000-8000-000000000001",
      "name": "MainCamera",
      "parent": null,
      "components": [
        { "type": "Transform", "data": { "position": [0, 2, 5], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] } },
        { "type": "Camera", "data": { "fov": 60, "near": 0.1, "far": 1000 } }
      ]
    },
    {
      "id": "a0000000-0000-4000-8000-000000000002",
      "name": "Box",
      "parent": null,
      "components": [
        { "type": "Transform", "data": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] } },
        { "type": "MeshRenderer", "data": { "prototypeId": "box" } }
      ]
    },
    {
      "id": "a0000000-0000-4000-8000-000000000003",
      "name": "Sun",
      "parent": null,
      "components": [
        { "type": "Transform", "data": { "position": [5, 10, 5], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] } },
        { "type": "Light", "data": { "type": "directional", "color": "#ffffff", "intensity": 1 } }
      ]
    }
  ]Tier 1
}
```

---

## Appendix B — Conversation Context (for human reviewer)

Decisions confirmed with project owner:

- ✅ Monorepo structure and package list
- ✅ **React 18 editor UI** (Zustand, schema-driven Inspector); no React in engine/playground
- ✅ **Phase 0:** install Tier 1 + React agent skills before coding (§2.1)
- ✅ Scene graph via `IWorld` abstraction (ECS later, not in this plan)
- ✅ Strict editor/engine separation + bundle audit (no react in playground)
- ✅ Scene JSON v1 format with UUIDs and `$ref`
- ✅ Prefabs from v1
- ✅ Simulation / Presentation split + render buckets
- ❌ Spatial index / 6k-object optimizations — **excluded**
- ✅ Full editor scope (Hierarchy, Inspector, Viewport, Assets, Undo, Play mode)
- ✅ Core components v1 list
- ✅ Minimal testing (serializer roundtrip only)
- ✅ Seven phases: **Skills Setup** → Foundation → Engine → Serializer → Editor → Undo/Assets/Play → **Game Project Scaffolder**
- ✅ `@haku/create` — Phase 6; `createHakuProject()` + CLI (§8)

