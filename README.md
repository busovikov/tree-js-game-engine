# @haku

Browser-first Three.js game engine and standalone React editor. Production games compose
public runtime packages beginning with `@haku/engine/runtime`; they never depend on
`@haku/editor` or React.

## Quick start

Requires Node.js 20+ and pnpm 9.15.0.

```bash
corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm build
pnpm test
```

Run the engine-only Bounce Run release proof or the diagnostic playground:

```bash
pnpm --filter @haku/bounce-run dev
pnpm --filter @haku/playground dev
pnpm --filter @haku/editor-app dev
```

Bounce Run uses public engine packages only—no editor or React dependency. Build its relative
static site with `pnpm --filter @haku/bounce-run build`, then serve `apps/bounce-run/dist/`
from a simple static HTTP server. The browser editor's trusted-project export uses
`@haku/build/browser-static-export` to produce the equivalent self-contained static HTML5 ZIP;
`file://` is not required or supported.

## Create a game

```bash
pnpm --filter @haku/create build
pnpm --filter @haku/create exec create-haku ../games --name my-game --no-install
```

The generated engine-only Vite project uses relative assets and public
`@haku/engine/runtime` + `@haku/assets` imports. See
[`packages/create/README.md`](packages/create/README.md) for local engine linking and commands.

## Project map

- [`examples/minimal.scene.json`](examples/minimal.scene.json) — minimal valid scene fixture.
- [`apps/bounce-run`](apps/bounce-run) — complete engine-only proving game.
- [`apps/playground`](apps/playground) — small engine feature diagnostics.
- [`apps/editor`](apps/editor) — editor shell.
- [`docs/README.md`](docs/README.md) — documentation index.
- [`docs/architecture.md`](docs/architecture.md) — package graph, capability matrix, and
  project authoring locations.
- [`docs/links.md`](docs/links.md) — public entrypoints and pinned official references.
- [`docs/engine-game-development-plan.md`](docs/engine-game-development-plan.md) — milestone
  evidence and deferred backlog.

Run `./scripts/check.sh` for the repository CI-style check. M14's isolated final full-repository
gate remains pending; see the development plan rather than inferring completion from this README.
