# Фаза 3 · п.5 — дизайн: реестр контроллеров и вынос vehicle-домена

_Дата: 2026-07-13. Статус: **проект на ревью, кода нет**. Источник: `docs/ARCHITECTURE_AUDIT.md` §5,
`docs/ARCHITECTURE_AUDIT_PROGRESS.md`._

Цель п.5 из аудита: движок/редактор/схема перестают знать про конкретные демо-контроллеры
Isaac Mason; «рабочий проект» (гоночные скетчи) становится отделяемым слоем. Схема уже
переименована в нейтральный `PhysicsController` (коммит `ea751b0`) — но **семь конкретных
видов контроллеров по-прежнему захардкожены** в дискриминированном union и в switch-ах всех
слоёв. Этот документ описывает механизм плагин-реестра, который убирает хардкод, и границу
нового пакета `@haku/vehicle`.

---

## 1. Как контроллеры захардкожены сегодня (карта связей)

Семь видов: `custom-raycast`, `dynamic-raycast`, `arcade-vehicle`, `revolute-joint-vehicle`
(vehicle-домен) и `kinematic-character`, `custom-spring`, `pointer-controls` (обобщённые
физ-примитивы; `custom-spring` по решению удаляется — см. §1). Захардкожены в:

| Слой | Файл | Что знает про конкретные виды |
|---|---|---|
| schema | `physics-controller.ts` (286) | `z.discriminatedUnion('type', [...7 схем])`, `PhysicsControllerTypeSchema` enum, хелперы `controllerNeedsChassis/Capsule` (switch по type) |
| core | `components.ts:82` | `PhysicsControllerComponent` = вся union; `defaults` жёстко `{ type: 'custom-raycast' }` |
| engine | `systems/physics-controller-system.ts` (424) | bootstrap/update/reset/dispose с `if (type === ...)` по всем 7; `computeIsaacDriveControlState` |
| engine | `systems/physics-controller-runtime.ts` (688) | per-kind bootstrap/update-функции |
| engine | `systems/vehicle-visual-sync-system.ts`, `dynamic-raycast-visual-sync-system.ts` | визуал колёс (vehicle-only) |
| engine | `systems/chase-camera-system.ts`, `vehicle-model-fit.ts` | chase-камера + подгонка Isaac-GLB (vehicle-only) |
| serializer | `index.ts` | политика вычистки runtime-хэндлов (`physicsHandle`) — уже нейтральна |
| editor | `components/PhysicsControllerFields.tsx` (472) | switch по 7 типам → инспектор; `CONTROLLER_TYPE_LABELS` |
| editor | `services/playground-demos.ts`, `viewport/vehicle-debug-hook.ts` | список демо-сцен, HTTP-дебаг vehicle |

### Граница physics ↔ vehicle (пересмотрено — vehicle как надстройка над примитивами)

Vehicle — не примитив физ-движка, а высокоуровневая система поверх примитивов (RigidBody,
Joint, Raycast, Query). Rapier сознательно не считает custom raycast vehicle встроенной
способностью. Поэтому `@haku/vehicle` **не должен зависеть от `@haku/physics-rapier`** — только
от абстрактного `@haku/physics` (`IPhysicsWorld`). Смена физ-движка = новый backend, код vehicle
не меняется.

Ключевой факт (подтверждён чтением кода): custom raycast **солвер**
(`raycast-vehicle-simulation.ts` + `-friction.ts` + `-suite.ts`, ~1000 стр.) **не импортирует
Rapier**. Это чистый алгоритм, уже работающий через абстрактный интерфейс
`RaycastVehicleSimulationHooks`. Оба бэкенда лишь дают тонкую обвязку (`raycast`,
`getBodyTransform`, `applyImpulse`…) и зовут общий `stepRaycastVehicle`. То есть солвер **уже
backend-agnostic по реализации** — просто физически лежит в `@haku/physics`.

### Три уровня физической функциональности

Обобщённый принцип: **всё, что не выражается на примитивах, — backend-нативная способность и
должно жить за абстрактным интерфейсом с per-backend враппером, а его потребитель гейтится
feature-детекцией.** Тогда смена движка = новый набор врапперов, а не правки в потребителях.

| Уровень | Что | Где | Кто потребляет |
|---|---|---|---|
| **1. Примитивы** (обязательны в каждом backend) | RigidBody, Collider, Joint (revolute/motor + impulse spring/rope/spherical), Raycast, Query, body-запросы (transform/velocity/mass/inverseMass/velocityAtPoint/impulseDenominator), applyImpulse/Force | `@haku/physics` — ядро `IPhysicsWorld` | все |
| **2. Способности** (backend-нативные, опциональны) | CharacterController, DynamicRaycastVehicle | контракт-интерфейс в `@haku/physics`, **враппер в `@haku/physics-rapier`** (свой на каждый backend) | гейтятся `world.capabilities()` |
| **3. Высокоуровневые системы** (чистый алгоритм над ур.1) | custom-raycast solver, arcade, revolute-joint vehicle, pointer-controls | `@haku/vehicle` (vehicle) / engine built-in (generic) | поверх `IPhysicsWorld`, backend-независимо |

`custom-spring` — **удаляется** (не нужен): kind из схемы, `updateCustomSpring`/`applyCustomSpring`
из рантайма, ветка инспектора, demo `custom-spring.scene.json` + запись в `manifest.json` и
`playground-demos.ts`.

`pointer-controls` (`PointerController`) — **высокоуровневая система взаимодействия (tier-3)**, а
не способность. Отвечает за пикинг объекта (raycast/query из указателя), захват, перетаскивание
мышью и обработку pointer-событий/релиза — это **собственный алгоритм**, который дёргает примитивы
(raycast, кинематический `createBody`, обобщённый impulse-joint spring/rope/spherical) через
`IPhysicsWorld`. Примитивы, которые он использует, остаются уровнем 1; сам контроллер —
backend-независимая система поверх них, без гейта способностью.

Классификация оставшихся контроллеров:

| Контроллер | Уровень | Дом | Гейт |
|---|---|---|---|
| `custom-raycast` | 3 (solver над примитивами) | `@haku/vehicle` | — |
| `arcade-vehicle` | 3 (raycast + impulse + velocity) | `@haku/vehicle` | — |
| `revolute-joint-vehicle` | 3 (Joint-примитив) | `@haku/vehicle` | — |
| `pointer-controls` | 3 (система взаимодействия: пикинг + drag поверх примитивов) | engine built-in¹ | — |
| `kinematic-character` | нужна способность **CharacterController** | engine built-in | `capabilities().characterController` |
| `dynamic-raycast` | нужна способность **DynamicRaycastVehicle** (Rapier-only, D6) | `@haku/vehicle` | `capabilities().dynamicRaycastVehicle` |

¹ Раз `pointer-controls` — полноценная tier-3 система (наравне с vehicle-солвером), она
**отделяема** тем же реестром. «Дом» — решение **D7**: (a) engine built-in (обобщённая
интеракция, generic, из коробки) или (b) отдельный высокоуровневый модуль
(`@haku/interaction` / `apps/playground`), если держать движок-ядро свободным от любых готовых
систем. **Рекомендация: (a)** — интеракция обобщённая, не Isaac-домен; но механизм реестра
делает переезд в (b) тривиальным, если позже захочется.
### Способности: механизм (уровень 2)

`@haku/physics` вводит **реестр способностей** на `IPhysicsWorld` — типизированный опциональный
набор фабрик, а не обязательные методы ядра:

```ts
// @haku/physics
export interface PhysicsCapabilities {
  characterController?: CharacterControllerFactory
  dynamicRaycastVehicle?: DynamicRaycastVehicleFactory  // сегодня только Rapier
}
export interface IPhysicsWorld {
  /* ...примитивы уровня 1... */
  capabilities(): PhysicsCapabilities
}
```

- Контракт-интерфейсы (`ICharacterController`, `IDynamicRaycastVehicle`) и типы фабрик —
  **абстрактные, в `@haku/physics`**. Это позволяет `@haku/vehicle` и engine кодировать против
  них, не завися от Rapier.
- Каждый backend реализует свои врапперы **в своём пакете** (`@haku/physics-rapier` — свой
  модуль на способность; stub — свой/пусто) и заполняет `capabilities()`. Это прямо отвечает
  «в разных движках свой CharacterController — для каждого backend свой враппер».
- **Убрать из ядра `IPhysicsWorld`** обязательные `createCharacterController`,
  `createDynamicRaycastVehicle` → перевести в `capabilities()`. Rapier-KCC-враппер, ныне инлайном
  в `rapier-backend.ts`, вынести в отдельный модуль
  `physics-rapier/src/capabilities/character-controller.ts` (и dynamic-raycast-vehicle.ts).
  Обобщённые impulse-джоинты (`createPointerAnchorBody`/`createPointerJoint`) — **не** способность,
  остаются примитивами уровня 1 в ядре.
- Потребитель гейтится: `const cc = world.capabilities().characterController; if (!cc) return`
  (контроллер просто не активируется на backend без способности). Дополнительно композиционный
  корень может вовсе не регистрировать плагин, если знает, что backend её не даёт.

### Изменения интерфейса physics для выноса solver (уровень 3)

Custom-raycast solver надо снять с `@haku/physics` на `@haku/vehicle`:

- **Поднять 4 body-запроса** из внутреннего `IPhysicsBackend` в публичный `IPhysicsWorld`
  (уровень 1): `getBodyMass`, `getInverseMass`, `getVelocityAtWorldPoint`,
  `getImpulseDenominator` (impulse denominator = 1/m + (r×n)·I⁻¹(r×n) — стандартно для
  constraint-солвера, не vehicle-специфично).
- **Убрать из `@haku/physics`**: `createRaycastVehicle`, `IRaycastVehicle`, `WheelConfig`,
  `WheelState`, файлы `raycast-vehicle.ts`, `raycast-vehicle-simulation.ts`, `-friction.ts`,
  `-suite.ts`, glue-классы `RapierRaycastVehicle`/stub-аналог. (Custom-raycast — уровень 3, не
  способность backend: любой backend с примитивами его тянет, поэтому враппер в physics не нужен.)
- В `@haku/vehicle/sim` появляется класс `RaycastVehicle` поверх `IPhysicsWorld`: держит
  `WheelRuntime[]`, в `simulate(dt)` строит hooks из примитивов `world.*` и зовёт
  `stepRaycastVehicle`. Никакого Rapier.

---

## 2. Ключевое архитектурное решение: где живёт валидация типа

Сейчас `@haku/schema` статически знает все 7 схем через `discriminatedUnion`, а `@haku/core`
валидирует компонент этой union прямо при загрузке сцены. Чтобы core/engine перестали знать про
vehicle, **дискриминированный union нельзя держать в schema/core**. Предлагается:

- **`@haku/schema` даёт только `ControllerBaseSchema`** (нейтральный): `{ type: string,
  enabled, followCamera, physicsHandle? }` с `.passthrough()` — неизвестные поля не режутся.
  Это единственное, что core валидирует на этапе загрузки. Полная (per-type) валидация — у
  плагина.
- **Каждый контроллер несёт свою Zod-схему** и регистрируется в реестре. Полный parse его
  полей происходит там, где плагин зарегистрирован (в engine-bootstrap и в инспекторе), а не в
  core.
- **Типовая безопасность сохраняется**: каждый плагин-файл владеет своим конкретным типом
  (`ArcadeVehicleController` и т.д.) и парсит его сам — сужение типов остаётся *внутри* файла
  плагина, никакой `discriminatedUnion` для этого не нужен. Мы ничего не теряем в типах,
  наоборот — убираем гигантские switch-и.

Последствие: `core` `PhysicsControllerComponent.defaults` больше не может вернуть
`custom-raycast`. Дефолт станет обобщённым (см. решение D3).

---

## 3. Контракт реестра

Реестр — простой типизированный registry-объект (не «магия»), по образцу существующего
core-компонент-реестра (`getCoreComponent`) и `setAfterSyncHook` из Фазы 2. Два уровня:
рантайм (engine) и UI (editor), чтобы `@haku/vehicle` не тянул React в рантайм-путь.

### 3.1 Рантайм-плагин (потребляет engine)

```ts
// @haku/engine — новый модуль controllers/registry.ts
export interface ControllerPlugin<C = unknown> {
  readonly type: string
  /** Zod-схема конкретного вида; core валидирует только базу, полный parse — здесь. */
  readonly schema: z.ZodType<C>
  /** Неявный коллайдер (шасси-бокс / капсула), если нужен. null — контроллер без него. */
  implicitCollider?(data: C): ImplicitColliderDescriptor | null
  /** Создать рантайм-состояние для сущности при входе в play-mode. */
  bootstrap(ctx: ControllerBootstrapCtx<C>): void
  /** Кадровый апдейт: применить input к физике. */
  update(ctx: ControllerUpdateCtx<C>, dt: number): void
  /** Сброс при выключении/выходе из play-mode. */
  reset(ctx: ControllerResetCtx<C>): void
  /** Убрать рантайм-ресурсы (джоинты, тела колёс). */
  dispose(ctx: ControllerDisposeCtx): void
  /** Опц.: вклад в chase/follow-камеру (позиция цели, скорость). */
  cameraTarget?(ctx: ControllerCameraCtx<C>): ControllerCameraState | null
  /** Опц.: визуал-синк (трансформы колёс) для render-sync. */
  visualSync?(ctx: ControllerVisualCtx<C>): void
}

export interface ControllerRegistry {
  register(plugin: ControllerPlugin): void
  get(type: string): ControllerPlugin | undefined
  all(): readonly ControllerPlugin[]
}
```

`PhysicsControllerSystem` перестаёт быть switch-ем: он держит `Map<entity, unknown>` рантайм-
состояний и в bootstrap/update/reset/dispose делегирует `registry.get(data.type)?.<method>`.
`ctx` даёт плагину узкий доступ: `world`, `physicsWorld`, `physicsSystem` (тела/трансформы/
скорости), `input`, и его собственное `state` (замыкание/Map по типу — плагин хранит своё).

### 3.2 UI-плагин (потребляет editor)

```ts
// @haku/editor — components/controller-registry.ts
export interface ControllerInspectorPlugin {
  readonly type: string
  readonly label: string
  /** React-инспектор для этого вида. */
  readonly Fields: React.ComponentType<ControllerFieldsProps>
  /** Дефолтные данные при выборе типа в дропдауне. */
  makeDefault(): unknown
}
```

`PhysicsControllerFields.tsx` схлопывается до: дропдаул из `registry.all().map(label)` +
`registry.get(value.type)?.Fields`. Гигантский switch на 472 строки уходит в per-vehicle файлы.

### 3.3 Точка регистрации

`@haku/vehicle` экспортирует `registerVehicleControllers(engineRegistry)` и
`registerVehicleInspectors(editorRegistry)`. Их зовёт **композиционный корень** — `apps/playground`
(рантайм) и editor-app при старте. Ни engine, ни editor-пакет не импортируют `@haku/vehicle` —
зависимость строго `playground/editor-app → @haku/vehicle → engine/editor`. Это и есть проверяемая
dependency-cruiser'ом инверсия.

---

## 4. Целевой пакет `@haku/vehicle`

```
packages/vehicle/
  package.json         deps: @haku/schema @haku/core @haku/engine @haku/physics; peer: three
                       # НЕ зависит от @haku/physics-rapier — только абстрактный IPhysicsWorld
  src/
    index.ts                     registerVehicleControllers / registerVehicleInspectors
    schema/                      4 vehicle Zod-схемы (из physics-controller.ts)
    sim/                         raycast-vehicle-{simulation,friction,suite}.ts + RaycastVehicle
                                 класс поверх IPhysicsWorld (из @haku/physics)
    controllers/                 custom-raycast, dynamic-raycast, arcade, revolute (из runtime.ts + system.ts)
    visual/                      wheel visual-sync (из vehicle-visual-sync + dynamic-raycast-visual-sync)
    camera/                      chase-camera-system.ts
    model-fit/                   vehicle-model-fit.ts (Isaac GLB подгонка)
    inspector/                   *.tsx (из PhysicsControllerFields switch-веток)
    debug/                       playtest/vehicle-debug.ts + editor vehicle-debug-hook (остаток п.2)
```

Направление зависимостей: `apps/playground / editor-app → @haku/vehicle → { @haku/engine,
@haku/physics (абстракция) }`. `@haku/vehicle ↛ @haku/physics-rapier` — это новое
depcruise-правило и главная проверяемая инверсия слоя.

Заодно закрывается **остаток п.2** (аудит): HTTP-дебаг vehicle (`playtest/vehicle-debug.ts`)
переезжает сюда из движка — Фаза 1 его наполовину подрезала, тут добиваем.

Внутри `@haku/vehicle` контроллер `dynamic-raycast` (D6(b)) кодирует против абстрактного
`IDynamicRaycastVehicle` из `@haku/physics` и активируется лишь при наличии способности —
его Rapier-враппер лежит в `@haku/physics-rapier`, а не здесь.

**Обобщённые контроллеры (character/pointer)** — НЕ демо-домен Isaac по сути (`custom-spring`
удалён). Рекомендация (решение D2): оставить их зарегистрированными движком как встроенные
(built-in) в `@haku/engine/src/controllers/builtin/`. `pointer-controls` — безусловный (уровень 3,
поверх impulse-джоинт примитивов). `kinematic-character` — уровень 2: built-in-регистрация есть
всегда, но контроллер активируется, только если backend отдаёт `capabilities().characterController`.
Rapier-KCC-враппер уезжает в `@haku/physics-rapier/src/capabilities/`.

---

## 5. Пошаговый план миграции (каждый шаг зелёный на tsc/lint/test/depcruise)

Порядок выбран так, чтобы **на каждом шаге репозиторий собирался и все демо работали** — это
рефакторинг без остановки продукта.

- **Шаг 0 — реестр вхолостую (+ дроп `custom-spring`).** Сначала удалить `custom-spring` (kind,
  рантайм, инспектор, demo-артефакты). Затем ввести `ControllerRegistry` + `ControllerPlugin` в
  engine и `ControllerInspectorPlugin` в editor. Обернуть оставшиеся 6 контроллеров в плагины,
  **оставив их файлы на месте** и зарегистрировав built-in'ами внутри engine/editor. Switch-и
  заменить на делегацию в реестр. Поведение идентично (кроме удалённого spring). Схема пока остаётся union (обратная
  совместимость), реестр читает из неё. _Валидация: полный `pnpm test` — ноль изменений в
  снапшотах поведения._ Это самый крупный и рискованный шаг; делать первым, пока всё в одном
  пакете и легко откатить.
- **Шаг 1 — база схемы.** В `@haku/schema` выделить `ControllerBaseSchema` (`.passthrough()`).
  `core` `PhysicsControllerComponent.schema` → база; полный parse ушёл в плагины (шаг 0 их уже
  ввёл). Дефолт компонента → generic (решение D3). Union в schema помечается `@deprecated`, но
  пока остаётся для миграционных тестов.
- **Шаг 2 — создать пакет `@haku/vehicle`**, пустой, в workspace; `pnpm install` слинкует.
  Прогнать tsc по нему.
- **Шаг 2a — модель способностей physics (уровень 2, §1).** Ввести `capabilities()` +
  контракт-интерфейсы (`ICharacterController` уже есть; `IDynamicRaycastVehicle` — сделать
  абстрактным) в `@haku/physics`. Убрать из обязательного ядра `IPhysicsWorld` методы
  `createCharacterController`, `createDynamicRaycastVehicle`; перевести их под `capabilities()`
  (impulse-джоинты `createPointerAnchorBody`/`createPointerJoint` остаются примитивами уровня 1).
  Вынести Rapier-врапперы из инлайна `rapier-backend.ts` в
  `physics-rapier/src/capabilities/{character-controller,dynamic-raycast-vehicle}.ts`. Гейт-точка
  в engine (kinematic-character) — `if (!world.capabilities().characterController) return`.
  _Валидация: rapier-backend отдаёт обе способности, stub — по факту; tsc/тесты зелёные._
- **Шаг 2b — снять custom-raycast solver с physics (уровень 3, §1).** Поднять 4 body-запроса
  (`getBodyMass`/`getInverseMass`/`getVelocityAtWorldPoint`/`getImpulseDenominator`) в
  `IPhysicsWorld`. Перенести солвер (`raycast-vehicle-*.ts`) и класс `RaycastVehicle` в
  `@haku/vehicle/sim` поверх `IPhysicsWorld`. Убрать `createRaycastVehicle`/`IRaycastVehicle`/
  `WheelConfig` и glue-классы из `@haku/physics`, `physics-rapier`, `stub-backend`. _Валидация:
  `raycast-vehicle-suite` тесты переезжают в vehicle, зелёные на stub и rapier._
- **Шаг 3 — переезд vehicle (4 контроллера).** Перенести схемы+рантайм+инспекторы+визуал+
  camera+model-fit+debug 4 vehicle-видов в `@haku/vehicle`. `dynamic-raycast` кодирует против
  абстрактного `IDynamicRaycastVehicle`, гейтится способностью (D6(b)). Регистрация — через
  `registerVehicleControllers`, вызываемую из `apps/playground` и editor-app. Удалить vehicle-
  ветки из engine/editor. _Валидация: depcruise-правила `engine-not-to-vehicle` = 0 и
  `vehicle-not-to-physics-rapier` = 0; новый edge `playground→vehicle→engine` — ожидаемый._
- **Шаг 4 — зачистка.** Убрать `@deprecated` union из schema, deprecated-реэкспорты
  (`VehicleFields`, `VehicleControllerSystem`, `vehicleWheelConfigs`, ...), обновить
  `engine/index.ts`. Обновить `.dependency-cruiser.cjs` (правило движок↛vehicle) и
  `docs/architecture-boundaries.md`.

Character/pointer при этом остаются built-in в engine (D2) — их не двигаем. `custom-spring`
удаляется на Шаге 0 (снять из union/рантайма/инспектора + demo-артефакты).

---

## 6. Точки решения (нужен ваш выбор до кода)

- **D1 — глубина реестра.** (a) Полный плагин-реестр как в §3 (рекомендую: честно достигает
  цели аудита, снимает switch-и). (b) Лёгкий вариант: только *схему* и *инспектор* сделать
  плагинными, а рантайм-switch оставить в engine (дешевле, но engine всё ещё знает vehicle —
  цель аудита достигается лишь частично). **Рекомендация: (a).**
- **D2 — куда character/pointer.** (a) built-in в engine (рекомендую, §4). (b) отдельный
  `@haku/controllers`. (c) тоже в `@haku/vehicle` (неверно семантически). **Рекомендация: (a).**
  Уточнение (§1): `pointer-controls` — уровень 3 (impulse-джоинт примитивы), безусловный built-in;
  `kinematic-character` — уровень 2, built-in-регистрация **гейтится**
  `capabilities().characterController`. `custom-spring` удалён.
- **D3 — дефолт компонента в core.** Когда vehicle уедет, `defaults` не может быть
  `custom-raycast`. (a) `kinematic-character` (generic, остаётся built-in). (b) реестр отдаёт
  «первый зарегистрированный». (c) компонент без дефолт-типа — требует явного выбора в UI.
  **Рекомендация: (a).**
- **D4 — неизвестный `type` в сцене.** Если сцена ссылается на незарегистрированный контроллер
  (например vehicle-сцена открыта без `@haku/vehicle`): (a) сохранить данные как есть
  (passthrough) + предупреждение в лог, не трогать в play-mode (рекомендую — не теряем данные).
  (b) отбросить компонент. **Рекомендация: (a).**
- **D5 — deprecated-хвост.** Сносить ли `@deprecated` реэкспорты (`VehicleFields` и ~10 др.)
  сразу на шаге 4 или оставить один релиз? Внутренний монорепо, внешних потребителей нет →
  **рекомендация: сносить сразу.**
- **D6 — `dynamic-raycast` (нативный Rapier `DynamicRayCastVehicleController`). ✅ ВЫБРАНО (b).**
  Трактуется как backend-способность уровня 2 (§1): контракт-интерфейс `IDynamicRaycastVehicle` +
  тип фабрики абстрактны в `@haku/physics`, но **враппер живёт в `@haku/physics-rapier`**
  (`capabilities().dynamicRaycastVehicle`), а stub/иные backend'ы его не дают. ECS-контроллер
  `dynamic-raycast` в `@haku/vehicle` гейтится `world.capabilities().dynamicRaycastVehicle` и
  регистрируется/активируется только когда способность присутствует (rapier-backend). Так демо
  `dynamic-raycast` работает на Rapier, `@haku/vehicle ↛ physics-rapier` сохраняется, а
  портируемый флагман — `custom-raycast`. _(Тонкость: абстрактный контракт всё же остаётся в
  `@haku/physics` — иначе `@haku/vehicle` не смог бы кодировать против него, не завися от Rapier;
  «Rapier-only» относится к **реализации-врапперу**, не к контракту.)_
- **D7 — дом `pointer-controls` (tier-3 система взаимодействия).** (a) engine built-in
  (обобщённая интеракция, из коробки — рекомендую). (b) отдельный высокоуровневый модуль
  (`@haku/interaction`), если держать движок-ядро без готовых систем. Реестр делает (b)
  тривиальным позже. **Рекомендация: (a).**

---

## 7. Оценка и риск

- Объём: ~42 файла касаются домена; реально перемещается ~15–18, новые ~12. Два самых ёмких
  шага — Шаг 0 (реестр контроллеров, ~1–1.5 дня) и Шаг 2a (модель способностей physics: снять 3
  метода с ядра, вынести 3 Rapier-враппера, гейт-точки, ~1 день). Модель способностей — расширение
  объёма п.5 против исходного аудита (аудит просил только вынос vehicle), принято по решению
  архитектора: делает CharacterController/dynamic-raycast backend-сменными. Остальное
  механическое.
- Главный риск — **регрессия поведения контроллеров** (физика чувствительна к порядку/каденции;
  ср. фикс dim в Фазе 2). Митигируется: шаг 0 не меняет логику, только оборачивает; полный
  `pnpm test` (310 passed baseline) + ручная проверка каждого демо (custom-raycast, arcade,
  character и т.д.) после шага 3.
- Известные 2 pre-existing падения теста прыжка (см. progress §«Сделано на Mac») — не трогаем,
  не блокируют.
- **Валидация среды: теперь на Mac есть pnpm** — ограничения песочницы из progress-дока сняты,
  tsc/тесты/depcruise/новый пакет проверяются локально.

---

## 8. Что НЕ входит в п.5

п.6 (trimesh-коллайдеры) и п.7 (ассеты в LFS) — отдельные пункты Фазы 3, делаются независимо.
Раздел «Дальше по плану» в `ARCHITECTURE_AUDIT_PROGRESS.md` остаётся источником статуса.
