# Прогресс рефакторинга по аудиту — статус для продолжения

_Обновлено: 2026-07-13. Источник плана: `docs/ARCHITECTURE_AUDIT.md` (раздел «Поэтапный план»)._

Этот файл — точка передачи (handoff). Агент, продолжающий работу, должен сначала
прочитать `docs/ARCHITECTURE_AUDIT.md`, затем этот файл.

## Ограничения среды (важно)

Инструменты bash выполняются в изолированной Linux-песочнице (aarch64), отдельной
от машины пользователя (macOS):

- `pnpm` в песочнице **нет**, только `npm`/`node`/`npx`.
- Реестр npm из песочницы заблокирован (403) — доустановить пакеты нельзя.
- `node_modules` собраны под macOS (в `.pnpm` только `@rollup+rollup-darwin-arm64`),
  Linux-нативного rollup нет → **vitest в песочнице не запускается**.
- `tsc` и `eslint` работают (чистый JS/TS, нативные бинарники не нужны) — их
  использовать для валидации здесь.
- Новый workspace-пакет в песочнице не слинкуется (нужен `pnpm install` на Mac),
  поэтому tsc по новому пакету здесь не проверить — это влияет на планирование
  Фазы 3 (вынос `@haku/vehicle`).

Итог: код/сборку/tsc/lint валидируем в песочнице; **`pnpm install`, `pnpm test`,
`pnpm depcruise:baseline` — на стороне пользователя (Mac)**.

## Сделано

### Фаза 0 — быстрые победы ✅
- **п.1** (фантомная dev-зависимость): уже была в `packages/engine/package.json`
  (`@haku/physics-rapier` в `devDependencies`) — правок не потребовалось.
- **п.8**: утечка resize-листенера в `packages/engine/src/engine.ts` закрыта
  (поле `resizeHandler`, снятие в `dispose()`); импорты в середине файла подняты
  наверх в `packages/core/src/types.ts` и `packages/core/src/world.ts`; включено
  правило lint `import/first` (scoped на core/engine) + `eslint-plugin-import`
  в devDeps.

### Побочно (при включении lint) ✅
`pnpm lint` был красным (предсуществующие ошибки). Исправлено в `eslint.config.js`:
`**/public/**` в ignores (вендорный DRACO), `no-unused-vars` игнорирует `^_`
(конвенция кода), node-глобалы для `scripts/**` и `*.mjs`, CommonJS-блок для
`*.cjs`. Точечно: пустой интерфейс `WheelRecord` → type alias
(`packages/physics-rapier/src/rapier-backend.ts`), unused `mass` → `_mass`
(`scripts/generate-isaac-sketch-scenes.mjs`). Сейчас `eslint .` зелёный.

### Фаза 1 — развязать оснастку ✅ (код), ⏳ (тесты на Mac)
- **п.4** (SceneLoader): `SceneLoader.load(path, fetchScene?)` принимает
  опциональный fetcher (тип `SceneFetch`, дефолт — глобальный `fetch`). Обратно
  совместимо. Тип экспортирован из `engine/src/index.ts` и `runtime.ts`.
  Файл: `packages/engine/src/engine.ts`.
- **п.2** (playtest, согласованный сокращённый объём): убран мёртвый публичный API
  метрик (`collectVehiclePlaytestMetrics`, `assertVehiclePlaytestMetrics`,
  `chassisForwardDeltaZ`, `VehiclePlaytestMetrics`, `VehiclePlaytestOptions`,
  `PlaytestWindowApi`) — потребителей не было после удаления Playwright-харнесса.
  `packages/engine/src/playtest/vehicle-metrics.ts` ужат 242→34 строк (осталась
  только `estimateGroundTopY`, используемая `vehicle-debug.ts`). Экспорты удалены
  из `engine/src/index.ts` и `engine/src/engine.ts`.
  **Полный вынос debug-модуля отложен в Фазу 3** (по решению пользователя).
- **dependency-cruiser**: добавлен `.dependency-cruiser.cjs` (правила целевой
  архитектуры), скрипты `depcruise`/`depcruise:baseline` в `package.json`, devDep
  `dependency-cruiser@^16`, док `docs/architecture-boundaries.md`.

Валидация в песочнице: tsc по 7 пакетам + `apps/playground` + `apps/editor` —
зелёный; `eslint .` — зелёный. Vitest — не запускался (ограничение среды).

## Сделано на Mac (продолжение, 2026-07-13)

1. `pnpm install` — ок, подтянул `eslint-plugin-import`, `dependency-cruiser`.
2. `pnpm test` — **310 passed, 2 failed, 8 skipped** (52 файла). Оба падения
   (`chase-camera-system.test.ts` — "raises airborne blend after jump leaves
   the ground", `input-binding-system.test.ts` — "applies jump pulse from
   Space keydown") воспроизведены и на базовом коммите **до** правок Фазы 0/1
   (проверено через `git stash` + повторный прогон) — предсуществующая
   нестабильность физики прыжка (не регрессия от рефакторинга, не блокирует
   продолжение). Не трогать в рамках этого аудита — отдельная задача.
3. `pnpm depcruise:baseline` → `.dependency-cruiser-known-violations.json`
   закоммичен. **7 известных нарушений**: 4 цикла импортов (`no-circular`,
   все внутри одного пакета — `engine.ts`↔`play-mode-vehicle.ts`,
   `engine.ts`↔`render-backend.ts`, `physics-controller-runtime.ts`↔
   `physics-controller-system.ts`, `schema/index.ts`↔`schema/scene-camera.ts`)
   и 3 orphan-модуля (`no-orphan-dead-modules`, warn — это точки входа
   `apps/editor/src/main.tsx`, `apps/playground/scripts/player.ts`,
   `packages/create/templates/scripts/player.ts`, не подхваченные excludes —
   ложные срабатывания). Важно: правила `engine-not-to-editor` и
   `core-not-to-engine-or-editor` дали **0** нарушений в baseline — не потому,
   что утечки §3/§5 нет, а потому что редакторные файлы физически лежат
   *внутри* `packages/engine/src` (не импортируются из `packages/editor`),
   поэтому dependency-cruiser не видит эту утечку как edge графа. Фаза 2
   должна не просто исправить существующие импорты, а **переместить файлы** —
   после переноса вновь появившийся импорт `engine`→`editor`-пакет должен
   остаться нулевым, и это станет реальной проверкой, а не тавтологией.
4. `pnpm lint` и `pnpm typecheck` (все 10 пакетов) — зелёные.
5. Закоммичены Фазы 0–1 (см. ниже).

## Дальше по плану

### Фаза 2 — восстановить направление зависимостей (следующая)
**п.3.** Ввести точки расширения рендера в `IRenderBackend` (render-pass hooks);
перенести редакторные проходы и типы из `engine`/`core` в `@haku/editor`.
Затронутые файлы (по аудиту): в `engine` — `editor-visual-dim.ts`,
`editor-wireframe-overlay.ts`, `render/passes/editor-selection-outline.ts`,
`render/passes/editor-selection-edges.ts`; в `core` — `EditorRenderExtensions`,
`ViewportRenderOverrides` в `src/types.ts`. Цель: убрать редакторные записи из
baseline dependency-cruiser по оси движок↔редактор.

### Фаза 3 — отделить демо от движка (наибольшая ценность)
**п.5**: обобщить `packages/schema/src/physics-controller.ts` до нейтрального
`PhysicsController` с плагин-контроллерами; вынести vehicle-контроллеры, системы и
инспекторы в `@haku/vehicle` (или `apps/playground`), включая остаток `playtest/`
(vehicle-debug) и editor `viewport/vehicle-debug-hook.ts`.
**п.6**: trimesh-коллайдеры в схеме + rapier-бэкенде.
**п.7**: демо-ассеты (~4.9 МБ) в Git LFS/внешнее хранилище.

Примечание: Фаза 3 создаёт новый пакет — валидировать tsc/тестами придётся на Mac
(см. ограничения среды).

## Изменённые/созданные файлы (Фазы 0–1)

Изменены: `eslint.config.js`, `package.json`, `packages/core/src/types.ts`,
`packages/core/src/world.ts`, `packages/engine/src/engine.ts`,
`packages/engine/src/index.ts`, `packages/engine/src/runtime.ts`,
`packages/engine/src/playtest/vehicle-metrics.ts`,
`packages/physics-rapier/src/rapier-backend.ts`,
`scripts/generate-isaac-sketch-scenes.mjs`.
Созданы: `.dependency-cruiser.cjs`, `docs/architecture-boundaries.md`,
`docs/ARCHITECTURE_AUDIT.md` (сам аудит), этот файл.
