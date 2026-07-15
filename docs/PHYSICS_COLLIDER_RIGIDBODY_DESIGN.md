# Физика: Collider / RigidBody / capabilities — мастер-план рефакторинга

_Дата: 2026-07-13. Статус: **проект на ревью, кода нет**._
_Ревизия 2 (2026-07-13): учтён строгий аудит против Rapier 0.19 и референсов Unity/Godot/Unreal —
разделы §0.5, §2.7, §3–§5, §10.5, §10.6 переписаны; см. журнал изменений в §0.5._

Цель: привести физическую модель @haku к индустриальной философии (Unity / Godot):
**форма коллизии отделена от участия в симуляции**, UI показывает только то, что поддерживает
конкретный backend, сцена описывает полный набор возможностей с graceful degradation.

Связанные документы:

- `docs/PHASE3_P5_DESIGN.md` — реестр контроллеров, `capabilities()` для CharacterController /
  DynamicRaycastVehicle (уровень 2)
- `docs/architecture.md` § Physics — текущее поведение (T01.x)
- `docs/edge-cases.md` — failure paths (дополняется по мере реализации)
- `docs/links.md` § Rapier — официальные ссылки

---

## 0. Проблема сегодня

| Сейчас | Проблема |
|--------|----------|
| `Collider.isStatic` | Смешивает форму и тип тела |
| Один `Collider` ≈ одно Rapier-тело | Нет разделения static collider / dynamic body |
| Нет `RigidBody` в схеме | Mass/damping только через `PhysicsController.chassis` |
| `PhysicsColliderSystem` игнорирует `controller.enabled` | Нельзя исключить объект из физики |
| Только box/sphere/capsule | Нет convex hull / trimesh / cylinder |
| Collider из geometry меша | Нет bake из `MeshRenderer` |
| Нет collision layers | Нельзя фильтровать столкновения и raycast |
| Нет collision events | Нет gameplay-хуков OnCollision / body_entered |
| UI не гейтится backend | Показываются поля, которые stub не реализует |

---

## 0.5 Ограничения выбранного backend (Rapier 0.19) — читать до дизайна схемы

Дизайн ведётся **против Rapier**, а не против абстрактного движка. Ключевые факты Rapier,
которые формируют схему (источники — [collider_collision_groups](https://rapier.rs/docs/user_guides/javascript/collider_collision_groups/),
[colliders guide](https://rapier.rs/docs/user_guides/javascript/colliders)):

| Факт Rapier | Следствие для дизайна |
|-------------|------------------------|
| **16 групп коллизий** (u32 = 16 бит membership + 16 бит filter), а не 32 | `MAX_LAYERS = 16`; Unity/Godot-конвенция 32 не поддерживается → §2.7, capability `maxCollisionLayers` |
| `collision_groups` предпочтительнее `solver_groups` (пропускает больше вычислений) | Слои → `collision_groups`; `solver_groups` держим в резерве под one-way collision |
| Симметричная матрица `membership=1<<layer, filter=matrix[layer]` выражается группами без hooks; произвольная несимметричная — **нет** (rapier3d-compat почти не даёт `PhysicsHooks`) | Выбрана **Unity-модель**: слой-индекс + симметричная project-матрица (§2.7). Godot-модель per-object mask отвергнута как дубль |
| `ActiveCollisionTypes.DEFAULT` = только пары с dynamic (dynamic-dynamic/kinematic/fixed). **kinematic-fixed, kinematic-kinematic, fixed-fixed отключены** | Триггер-зоны и CharacterBody (kinematic) требуют явного `ActiveCollisionTypes` → §2.4, §5, `edge-cases.md` |
| Sensor (`setSensor(true)`) + intersection events — **единственный** механизм триггеров; отдельного «Area» примитива нет | `PhysicsArea` и `Collider.isTrigger` = один backend-путь, различие только в ECS-авторинге → §2.4 |
| Trimesh на dynamic **разрешён, но не рекомендован** («нет объёма», застревание, инерция≈0); совет — convex decomposition (V-HACD) + compound | «Hard error» — это **политика @haku**, не ограничение Rapier → §2.1, D-F2 |
| Density по умолчанию 1.0; mass properties задаются только при создании колайдера; инерция считается из формы | Политика explicit-массы не должна занулять density для compound/convex → §2.2 (M3) |
| `collider.userData` доступен | Хранить `EntityId` в userData для роутинга событий, включая static-тела → §5 |
| `world.debugRender()` отдаёт буферы vertices/colors всех форм | Debug draw рисует буфер backend, не реконструирует формы вручную → §9 |
| Rapier **не** делает рендер-интерполяцию; `step(dt)` принимает произвольный dt | Fixed-timestep и интерполяция — движковая ответственность → §10.5, не backend-capability |
| `enhanced-determinism` — отдельная фича, cross-platform не гарантируется | Детерминизм — явное решение D-DET1 (§13), сейчас out-of-scope |

**Журнал изменений ревизии 2:** §2.1 (layer, aabbFallback), §2.2 (mass policy, useGravity→gravityScale,
kinematicMode), §2.4 (единый sensor-путь + ActiveCollisionTypes), §2.7 (16 слоёв, Unity-матрица),
§3 (coarse capabilities, maxCollisionLayers, debugRender), §4–§5 (userData, ActiveCollisionTypes),
§6 (nested RigidBody, compound mass), §9 (debugRender, three.js bake), §10 (Animation order),
§10.5 (fixed timestep), §10.6 (runtime reconciliation), §13 (D-DET1/D-LAYER1/D-KIN1), §14/§16.

---

## 1. Целевая философия (сравнение с Unity / Godot)

### Unity

- `Collider` — форма; `Rigidbody` — симуляция (опционально).
- Без `Rigidbody` — static collider (участвует в контактах, не двигается от сил).
- `Collider.isTrigger` + события `OnTrigger*`.
- **Physics Material** — отдельный asset.
- **Layers + collision matrix**.
- Несколько collider на одном `Rigidbody`; child colliders входят в parent body.
- `CharacterController` — отдельно от `Rigidbody`.

### Godot 4

- Тип тела = тип ноды (`StaticBody3D`, `RigidBody3D`, `CharacterBody3D`, `Area3D`).
- `CollisionShape3D` — всегда отдельный child, только форма.
- `Area3D` — overlap без физического отклика.
- **collision_layer / collision_mask** (битовые маски).
- **PhysicsMaterial** resource.
- Concave mesh — только static; convex — dynamic OK.
- Сигналы `body_entered`, `area_entered`.

### Unreal Engine (для полноты референса)

- Форма — `Shape/Body Setup`; симуляция — `Simulate Physics` на `PrimitiveComponent`.
- **Collision Channels** (не 32 слоя): trace + object channels + матрица **responses**
  (Ignore/Overlap/Block) — богаче булевой матрицы Unity/Godot (три состояния вместо двух).
- `Overlap` events ⟺ Godot Area / Unity trigger; `Hit` events ⟺ contact.
- **Substepping** физики (`bSubstepping`, `Max Substep Delta Time`) — прямой аналог §10.5.
- Continuous collision, mass override, `PhysicalMaterial` (friction/restitution/density).
- **Вывод для @haku:** трёхзначные responses (Ignore/Overlap/Block) — интересное расширение
  матрицы (P5+), но на Rapier-группах напрямую не выражается (только Block/Ignore). Пока —
  булева матрица (§2.7); Overlap-семантику даёт sensor-путь (§2.4).

### @haku (целевая модель)

Компонентная модель (ближе к Unity), не node-archetype Godot:

```
Entity
├── Transform
├── Collider(s)          — только форма (+ material ref, layers, trigger)
├── RigidBody            — опционально: участие в симуляции
├── PhysicsArea          — опционально: overlap-мониторинг (Godot Area3D)
├── AnimatableBody       — опционально: kinematic-by-animation, толкает dynamic
└── PhysicsController    — tier-3 поведение (vehicle, pointer, …)
```

**Правила разрешения при Play:**

| Collider | RigidBody | PhysicsArea | Результат |
|----------|-----------|-------------|-----------|
| — | — | — | Вне физики |
| ✓ | — | — | Fixed body + shape (стена, пол) |
| ✓ | static | — | Fixed body + shape |
| ✓ | dynamic | — | Dynamic simulation |
| ✓ | kinematic | — | Kinematic body |
| — | ✓ | — | Warning: body без формы — skip |
| ✓ | disabled | — | Вне физики (явное исключение) |
| — | — | ✓ | Area overlap (без contact response) |
| ✓ + isTrigger | * | — | Sensor collider на body; события trigger |
| implicit (controller) | override | — | Как сейчас, но `controller.enabled === false` → skip |

**Capability-gating (уникальная сила @haku):** схема сцены может описывать любую форму;
инспектор и runtime гейтятся `world.capabilities()`. Backend без convex → warning + AABB fallback
или skip (политика в `edge-cases.md`).

---

## 2. Компоненты схемы

### 2.1 `Collider` — только форма

Убрать: `isStatic`, `physicsBodyHandle`.

```ts
ColliderBase {
  enabled: boolean = true           // runtime-toggle через collider.setEnabled (§10.6)
  offset: Vec3
  rotation: Quat
  isTrigger: boolean = false        // → Rapier sensor + intersection events (§2.4, §5)
  materialId: string = ''           // ссылка на PhysicsMaterial asset
  layer: number = 0                 // ИНДЕКС слоя 0..15 (Unity-модель; НЕ битовая маска)
                                     // фильтрация — из project matrix (§2.7), своей mask у объекта нет
  // Политика при форме, не поддержанной активным backend (см. D-F1):
  unsupportedShapePolicy?: 'skip' | 'aabbFallback' = 'skip'  // default: skip + громкая ошибка
  // fallback если materialId пуст:
  friction?: number
  restitution?: number
}

// Формы (discriminated union по shape):
box, sphere, capsule, cylinder,
convexHull, trimesh, heightfield,
worldBoundary   // Godot WorldBoundaryShape3D / infinite plane segment
```

**Convex hull:**

```ts
convexHull {
  points: number[]              // flat [x,y,z,…] local space, baked
  bakeSource?: {
    kind: 'meshRenderer' | 'manual'
    geometryType?: string
    modelAsset?: string
    meshRevision?: string       // для invalidation при смене модели
  }
}
```

**Trimesh:**

```ts
trimesh {
  vertices: number[]
  indices: number[]             // Uint32
  bakeSource?: { ... }
}
```

**Heightfield:** для terrain (позже playground).

**Validation (schema refine + editor):**

- `trimesh` + `RigidBody.type === 'dynamic'` → **ошибка** в редакторе. Это **политика @haku**
  (совпадает с Godot concave=static-only), а не ограничение Rapier: Rapier технически допускает
  trimesh на dynamic, но «у меша нет объёма» → застревание, инерция≈0. Рекомендуемый путь для
  dynamic-меша — **convex decomposition (V-HACD) → compound из convexHull** (официальный совет
  Rapier). Кнопка bake в P4 предлагает decomposition при попытке dynamic+mesh.
- `convexHull.points.length` > `capabilities.maxConvexHullVertices` → warning
- non-uniform `Transform.scale` на collider → editor warning (как Unity). Rapier баит scale в
  размеры формы при спавне; **рантайм-изменение non-uniform scale не поддерживается** (§10.6,
  `edge-cases.md`) — форма не перестраивается пофреймово.
- `worldBoundary` (Rapier `ColliderDesc.halfspace`) валиден **только для static** тел → ошибка при
  dynamic/kinematic RigidBody.
- dynamic RigidBody, у которого **все** колайдеры — `isTrigger` (sensor) → warning: тело без
  contact-response (см. §2.4).

### 2.2 `RigidBody` — участие в симуляции

```ts
RigidBody {
  enabled: boolean = true
  type: 'static' | 'dynamic' | 'kinematic' = 'dynamic'
  // kinematic: position-based (transform authoritative, для AnimatableBody) vs
  // velocity-based (скрипт задаёт скорость). Rapier различает эти два тела.
  kinematicMode: 'position' | 'velocity' = 'position'
  massMode: 'explicit' | 'autoFromColliders' = 'explicit'
  mass: number = 1                // при explicit
  angularDamping: number = 0
  linearDamping: number = 0
  gravityScale: number = 1        // useGravity УДАЛЁН: gravityScale = 0 ⟺ Unity useGravity=false.
                                  // UI-чекбокс «Use Gravity» — пресет над gravityScale, не поле схемы.
  canSleep: boolean = true
  // CCD
  ccdEnabled: boolean = false
  // Constraints (Unity freeze / Godot axis lock)
  lockPosition: [boolean, boolean, boolean] = [false,false,false]
  lockRotation: [boolean, boolean, boolean] = [false,false,false]
  // Center of mass override (local space)
  centerOfMass?: Vec3
  // Presentation-only (Unity Rigidbody interpolation). Реализуется ДВИЖКОМ в RenderSync
  // (prev+current transform, лерп по остатку accumulator, §10.5), НЕ backend'ом — Rapier
  // интерполяцию не делает. Поэтому это НЕ capability (§3).
  interpolation: 'none' | 'interpolate' = 'none'
  // Runtime-only:
  physicsBodyHandle?: string
}
```

**Политика массы (пробел #10) — исправлено для compound/convex (M3):**

| massMode | Поведение |
|----------|-----------|
| `explicit` | целевая **total mass** — на RigidBody |
| `autoFromColliders` | mass+инерция из Σ(density × volume) колайдеров; explicit mass игнор |

**Важно:** «explicit → collider density = 0» работает **только** для одиночных примитивов
(box/sphere/capsule), где инерцию можно посчитать аналитически (текущий
`applyExplicitMassProperties`). Для **compound / convexHull / trimesh** занулять density **нельзя** —
иначе обнулится и тензор инерции (тело будет крутиться неправильно / вырожденно).

Правильный путь Rapier для explicit-массы на произвольной форме:

1. Дать колайдерам посчитать mass+инерцию из density (форма и распределение корректны).
2. Прочитать `computedMass` тела.
3. Скорректировать **только скаляр массы** до целевого: либо `RigidBodyDesc.setAdditionalMass(target − computedMass)`,
   либо взять вычисленный тензор инерции и заменить в `setAdditionalMassProperties` лишь массу
   (масштабируя инерцию на `target/computedMass`, т.к. инерция линейна по массе).

Одиночные примитивы сохраняют текущий быстрый путь (density=0 + аналитическая инерция) как
оптимизацию. Правило выбора пути — по числу/типу колайдеров тела. Тест на корректность инерции
explicit-массы на compound — в P2 (§16).

Default density — из `PhysicsMaterial` или 1.0 kg/m³ fallback.

**Collider-only без RigidBody** → implicit `type: 'static'` fixed body (Unity static collider).
Runtime-handle такого implicit-тела хранится в движковом реестре по `EntityId` (у сущности нет
RigidBody-компонента, писать handle некуда) — см. §11.

### 2.3 `PhysicsMaterial` — asset (пробел #4)

Новый тип в `packages/schema` + project assets (как Material):

```ts
PhysicsMaterial {
  friction: number = 0.5
  restitution: number = 0
  density: number = 1.0
  frictionCombine: 'average' | 'multiply' | 'min' | 'max' = 'average'
  restitutionCombine: 'average' | 'multiply' | 'min' | 'max' = 'average'
}
```

Collider: `materialId` → asset; inline friction/restitution — override или fallback.

**Pairwise-резолюция при контакте (M12):** когда встречаются два материала с **разными**
combine-режимами, режим выбирается по приоритету (как в Rapier `CoefficientCombineRule` и Unity):
`max > multiply > min > average`. То есть побеждает более «строгий» режим одного из колайдеров, а не
усредняется. Это детерминированное правило нужно задокументировать для авторов, иначе поведение
кажется случайным. Backend транслирует режим в `frictionCombineRule` / `restitutionCombineRule`
колайдера Rapier.

### 2.4 `PhysicsArea` — overlap без contact response (пробел #3)

Godot `Area3D` / Unity trigger на steroids:

```ts
PhysicsArea {
  enabled: boolean = true
  layer: number                   // индекс слоя 0..15 (Unity-модель, §2.7); фильтр — из matrix
  monitorable: boolean = true     // другие area/body видят эту area
  monitoring: boolean = true      // эта area видит других
  // Форма — через child Collider(s) или встроенную ссылку на sibling Collider
  spaceOverride?: {               // Godot gravity point / directional gravity (P5+)
    gravity?: Vec3
  }
}
```

**Единый backend-механизм (M6):** и `PhysicsArea`, и `Collider.isTrigger` транслируются в **один и
тот же** примитив Rapier — sensor-колайдер (`setSensor(true)`) + intersection events. Отдельного
«Area» примитива в Rapier **нет**. Различие — только на уровне ECS/авторинга:
`PhysicsArea` — Godot-node-стиль (сущность-зона без RigidBody), `Collider.isTrigger` — Unity-стиль
(sensor-колайдер на теле). Оба генерируют `TriggerEvent`/`area_*` через **общий** backend-путь
(не «разный path», как было в ревизии 1).

**ActiveCollisionTypes (M5) — критично:** по умолчанию Rapier считает пересечения sensor'а только
для пар с dynamic. Sensor-зона (обычно **fixed** тело) **не увидит kinematic CharacterBody** без
явного `ActiveCollisionTypes.KINEMATIC_FIXED`. Правило: sensor/area получает
`ActiveCollisionTypes`, расширенный под типы тел, которые он должен мониторить (для универсальной
зоны — `DEFAULT | KINEMATIC_FIXED | FIXED_FIXED`). Занести в `edge-cases.md`.

**Вырожденный случай:** dynamic-тело, у которого **единственный** колайдер — sensor, не имеет
contact-response (тело-«призрак»). → schema/editor warning (§2.1). Sensor на теле с ≥1 обычным
колайдером — норма.

### 2.5 `AnimatableBody` (пробел #14)

Godot `AnimatableBody3D`:

```ts
AnimatableBody {
  enabled: boolean = true
  syncMode: 'physics' | 'discrete'  // как двигается с анимацией/transform
}
```

Entity с `AnimatableBody` + `Collider` + без `RigidBody`: kinematic fixed, transform authoritative
из animation/`Transform`; толкает dynamic bodies, сам не получает forces.

### 2.6 `PhysicsJoint` — scene component (пробел #11)

Для authoring joints в редакторе (не только через controllers):

```ts
PhysicsJoint {
  // prismatic = slider (Godot SliderJoint3D / Unreal). Все пять — нативные ImpulseJoint Rapier.
  type: 'fixed' | 'revolute' | 'prismatic' | 'spherical' | 'spring' | 'rope'
  bodyA: EntityId
  bodyB: EntityId
  anchorA: Vec3
  anchorB: Vec3
  axis?: Vec3                     // revolute
  limits?: { min, max }
  motor?: { velocity, maxForce }
  spring?: { stiffness, damping }
  // runtime: physicsJointHandle
}
```

Child entity или component на parent — решение D-J1 в §8.

### 2.7 Project-level collision matrix (пробел #1, #13)

**Модель — Unity (не Godot), потому что Rapier даёт только 16 групп (B1, §0.5).**

Выбор из двух взаимоисключающих моделей:
- **Unity:** у объекта только `layer` (индекс), фильтрация — из глобальной симметричной матрицы.
- **Godot:** у объекта `layer` + `mask` (своя маска), глобальной матрицы нет.

Взято **Unity**, потому что: (1) чище для авторинга (один источник истины); (2) симметричная
матрица точно выражается через Rapier-группы **без** кастомных `PhysicsHooks` (которых
rapier3d-compat почти не даёт). Смешивать обе модели (как в ревизии 1: per-object mask **и** matrix)
— дубль и неоднозначность при спавне; отвергнуто.

```ts
// scene document или project settings
const MAX_LAYERS = 16             // жёсткий лимит Rapier (16 групп), НЕ 32 как в Unity/Godot
PhysicsProjectSettings {
  layers: string[16]              // имена: "Default", "Player", "Ground", … (индексы 0..15)
  layerCollisionMatrix: boolean[16][16]   // симметричная; UI редактирует верхний треугольник
}
```

**Бейк слоёв в группы Rapier при спавне** (полностью выражается группами, без hooks):

```
membership = 1 << collider.layer
filter     = Σ over j: layerCollisionMatrix[collider.layer][j] ? (1 << j) : 0
```

Правило Rapier `(memberA ∈ filterB) ∧ (memberB ∈ filterA)` при single-bit membership даёт ровно
`matrix[A][B] ∧ matrix[B][A]` = `matrix[A][B]` (матрица симметрична). Editor обязан держать матрицу
симметричной. `collision_groups` (не `solver_groups`) — предпочтительно (§0.5).

Editor: панель **Physics → Layer Matrix** (16×16 чекбоксов, симметрия автоматическая).

**Ограничение модели:** нет per-object mask (Godot-фича) — area/collider не может мониторить набор
слоёв в обход матрицы. Если понадобится — вводить через `solver_groups`/кастомный filter отдельным
решением (P5+), не смешивая с матрицей.

---

## 3. Capabilities API (пробел: UI только по backend)

Расширение `PHASE3_P5` § «Способности»:

```ts
export type ColliderShapeKind =
  | 'box' | 'sphere' | 'capsule' | 'cylinder'
  | 'convexHull' | 'trimesh' | 'heightfield' | 'worldBoundary'

export interface ColliderShapeCapabilities {
  shapes: ReadonlySet<ColliderShapeKind>
  maxConvexHullVertices?: number
  maxTrimeshVertices?: number
  trimeshRequiresStatic: boolean
}

export interface RigidBodyCapabilities {
  types: ReadonlySet<'static' | 'dynamic' | 'kinematic'>
  // Огрублено (M9): mass/linearDamping/angularDamping/gravityScale/canSleep — одна группа.
  // Любой реальный backend (Rapier) поддерживает их все; порознь гейтить — комбинаторный шум в UI.
  basicDynamics: boolean
  massAutoFromColliders: boolean
  // Реально опциональные фичи (stub их не даёт):
  ccd: boolean
  axisLock: boolean
  centerOfMass: boolean
  kinematicVelocityBased: boolean   // §2.2 kinematicMode='velocity'; Rapier да, stub нет
  // interpolation УДАЛЁН — движковая презентация (§10.5), не backend-capability (M2).
}

export interface MaterialCapabilities {
  friction: boolean
  restitution: boolean
  density: boolean
  combineModes: boolean
}

export interface QueryCapabilities {
  raycastLayerMask: boolean
  shapecast: boolean
  overlapTest: boolean
}

export interface DebugCapabilities {
  debugRender: boolean            // Rapier world.debugRender() → буферы vertices/colors (§9)
}

export interface EventCapabilities {
  collisionEvents: boolean
  triggerEvents: boolean
  contactManifolds: boolean
  maxContactsPerPair: number
}

export interface PhysicsCapabilities {
  shapes: ColliderShapeCapabilities
  rigidBody: RigidBodyCapabilities
  material: MaterialCapabilities
  query: QueryCapabilities
  events: EventCapabilities
  debug: DebugCapabilities
  areas: boolean
  animatableBody: boolean
  joints: ReadonlySet<PhysicsJoint['type']>
  maxCollisionLayers: number      // Rapier = 16 (§0.5, §2.7); stub может быть меньше.
                                  // Editor гейтит число слоёв в Layer Matrix по этому значению.
  multipleWorlds: boolean
  characterController?: CharacterControllerFactory
  dynamicRaycastVehicle?: DynamicRaycastVehicleFactory
}

export interface IPhysicsWorld {
  capabilities(): PhysicsCapabilities
  // …примитивы уровня 1…
}
```

**Stub backend:** box/sphere/capsule, basic rigidbody, no convex/trimesh/events.
**Rapier backend:** полный набор по таблице Rapier 0.19.

Инспектор: `PhysicsCapabilityContext` из active backend в Play + declared capabilities в Edit
(показывать поля с badge «Rapier only» или скрывать).

---

## 4. Collision layers & queries (пробелы #1, #15)

### 4.1 Layers на spawn (Unity-модель, §2.7)

При `attachShape` / `createCollider` бейк слоя в Rapier `collision_groups`:

- `membership = 1 << collider.layer`
- `filter = Σ (matrix[collider.layer][j] ? 1<<j : 0)`  — строка симметричной матрицы
- backend вызывает `colliderDesc.setCollisionGroups((membership << 16) | filter)`

**Только 16 слоёв** (§0.5). Editor запрещает layer ≥ `capabilities.maxCollisionLayers`. Своей
per-object mask нет — фильтр целиком из матрицы.

**ActiveCollisionTypes на spawn (M5):** для sensor/area и kinematic (CharacterBody, AnimatableBody)
backend выставляет расширенный `ActiveCollisionTypes` (иначе kinematic-fixed/fixed-fixed пары
молчат). Обычный dynamic-колайдер — `DEFAULT`.

### 4.2 RaycastQuery расширение

```ts
RaycastQuery {
  origin, direction, maxDistance
  excludeBody?: PhysicsBodyHandle
  layerMask?: number              // NEW — 16-битный filter (Rapier InteractionGroups),
                                  // membership запроса = все слои; попадает в колайдеры,
                                  // чьи слои есть в mask. НЕ индекс, а битовая маска слоёв.
  includeTriggers?: boolean       // NEW, default false — по умолчанию луч игнорирует sensor'ы
}
```

Vehicle wheel raycasts: mask = `1<<Ground | 1<<Vehicle` и т.д. Backend передаёт mask в
`QueryFilter.groups` Rapier-каста.

### 4.3 Shapecast / overlap (P4)

```ts
world.shapecast(shape, transform, direction, maxDistance, filter?)
world.overlap(shape, transform, filter?) → EntityId[]
```

Для pointer-pick, spawn placement.

---

## 5. Collision & trigger events (пробел #2)

### 5.1 Event buffer за fixed step

`PhysicsContactSystem` (order 51, после `PhysicsWorldSystem`):

```ts
interface CollisionEvent {
  kind: 'collision' | 'trigger' | 'area'
  phase: 'enter' | 'exit'         // Rapier collision/intersection event несёт `started: boolean`
  entityA: EntityId
  entityB: EntityId
  contacts?: ContactPoint[]       // если capabilities.contactManifolds (только collision, не sensor)
}

interface ContactPoint {
  point: Vec3
  normal: Vec3
  depth: number
}
```

Backend: Rapier `EventQueue` (`drainCollisionEvents` + `drainContactForceEvents`) / contact pair
iteration; Stub: пустой buffer. Колайдеры с событиями создаются с `ActiveEvents.COLLISION_EVENTS`
(и `CONTACT_FORCE_EVENTS` при `contactMonitor`).

**Event → EntityId роутинг (M4) — критично для static-тел.** Rapier-события дают `colliderHandle`.
Обратный маппинг в `EntityId` держим через **`collider.userData = EntityId`** (Rapier хранит
userData на колайдере), а НЕ через движковый реестр — реестр `PhysicsWorldSystem` регистрирует
только **не-static** тела, а столкновения почти всегда включают статику (пол, стены). userData
покрывает все тела единообразно и не требует доп. map. Драйн читает userData обоих колайдеров пары.

### 5.2 Потребители

- Будущий scripting (`onCollisionEnter`)
- Gameplay systems через `world.drainCollisionEvents()`
- `PhysicsArea` monitoring → `{ kind: 'area', phase: 'enter' | 'exit' }`

### 5.3 Contact monitoring (Godot)

`RigidBody` / `PhysicsArea`:

```ts
contactMonitor: boolean = false
maxReportedContacts: number = 0   // 0 = не мониторить
```

---

## 6. Compound colliders & hierarchy (пробел #6)

### 6.1 Модель (как Unity)

- **Parent** entity: `RigidBody` (один на compound)
- **Children** (и/или parent): `Collider` — каждый child shape
- `PhysicsColliderSystem.bootstrap()`:
  1. Найти root с `RigidBody` (или self)
  2. Собрать все `Collider` в subtree (enabled), **останавливая обход на дочерней сущности с
     собственным `RigidBody`** (M14): вложенный RigidBody = **отдельное тело**, не входит в parent
     compound (как Unity — child rigidbody не сливается с родителем). Иначе `bootstrap()`
     неоднозначен. Editor может показать warning про вложенные тела.
  3. Один `createBody` + N × `attachShape` с local transform = child world → parent local

### 6.2 Альтернатива (фаза позже)

`Colliders` component = `z.array(ColliderSchema)` на одной entity.

**Решение D-C1:** hierarchy model в P2; array component — P4 если нужно.

### 6.3 Mass / COM для compound

- `massMode: autoFromColliders` — сумма по всем shapes (Rapier делает это из density сам)
- `massMode: explicit` на compound — **не занулять density** (M3, §2.2): дать Rapier посчитать
  тензор из форм, затем скорректировать только скаляр массы. Аналитический быстрый путь (density=0)
  — только для одиночного примитива.
- `centerOfMass` override на RigidBody — после auto-compute

---

## 7. Character body vs kinematic rigidbody (пробел #5)

| Концепт | Где | Не путать с |
|---------|-----|-------------|
| `RigidBody.kinematic` | Transform/script driven | CharacterBody |
| `PhysicsController: kinematic-character` | Tier-3 + capability `characterController` | простой kinematic |
| **CharacterBody** (новый tier-3, P3) | `move_and_slide`, floor, slope, snap | Rapier KCC wrapper |

**CharacterBody** (целевой API, backend-agnostic intent):

```ts
CharacterBodyController {
  type: 'character-body'
  capsuleRadius, capsuleHalfHeight
  floorMaxAngle, floorSnapLength, stepHeight
  // implicit capsule Collider + kinematic RigidBody под капотом
}
```

Гейт: `capabilities().characterController` ИЛИ pure kinematic fallback с warning.

---

## 8. Множественные physics worlds (пробел #12)

```ts
PhysicsWorldSystem {
  primaryWorld: IPhysicsWorld
  createWorld(options): PhysicsWorldHandle   // P5
  setEntityWorld(entityId, handle)          // P5
}
```

Playground / editor: один world. Документируем API заранее, реализация P5.

---

## 9. Editor UX (пробел #13)

| Фича | Фаза | Описание |
|------|------|----------|
| `RigidBodyFields` | P3 | Capability-gated поля |
| `ColliderFields` v2 | P3 | Shape picker по capabilities; material picker |
| **Bake convex from mesh** | P4 | Кнопка на Collider → viewport geometry → points |
| **Bake trimesh (static)** | P4 | С warning static-only |
| **Show all colliders** | P3 | Viewport toggle (не только selection) |
| **Collider resize gizmo** | P4 | Box/sphere handles в viewport |
| **Physics Layer Matrix** | P3 | Project/scene settings panel |
| **Layer names dropdown** | P3 | На Collider / Area |
| **Re-bake invalidation** | P4 | Warning если `meshRevision` устарел |
| **Collision LOD mesh** | P5 | Отдельный collision mesh asset vs render |
| **Physics debug draw** | P3 | Через `world.debugRender()` Rapier (M13), не ручная реконструкция |
| **Non-uniform scale warning** | P3 | На Transform + Collider |
| Remove entity-header Static shortcut | P3 | Заменить на RigidBody type=static или docs |

**Debug draw (M13):** рисовать буфер `world.debugRender()` (Rapier отдаёт `vertices: Float32Array`,
`colors: Float32Array` для всех форм — convex/trimesh/heightfield/joints) как `LineSegments` в
three.js. Не реконструировать формы вручную — это рассинхрон и лишняя работа. Contact-нормали —
поверх, из drained-событий.

**Mesh bake (Three.js, официальный путь) — P4:**
- **Источник:** `BufferGeometry.position` в **non-indexed** виде × `mesh.matrixWorld` (мировые точки),
  затем перевод в parent-local.
- **Convex:** `ConvexHull`/`ConvexGeometry` из `three/examples` (аддоны) + dedupe точек;
  результат → `convexHull.points` (проверить против `capabilities.maxConvexHullVertices`).
- **Trimesh:** `mergeVertices()` → `vertices`+`indices` (Uint32); static-only guard.
- **Три.js только в editor viewport** для bake — движок/схема остаются без three (§15).
- `bakeSource.meshRevision` фиксируется при бейке; stale-warning при расхождении с моделью.

---

## 10. Engine systems (новая карта)

| Order | System | Назначение |
|-------|--------|------------|
| 45 | `PhysicsColliderSystem` | **Reconcile** bodies+shapes из ECS (не bootstrap-once, §10.6) |
| 47 | `InputBindingSystem` | без изменений |
| 48 | `PhysicsControllerSystem` | tier-3; implicit collider через registry |
| 49 | `RespawnSystem` | без изменений |
| **~49.5** | **`AnimationSystem`** | **M10:** пишет Transform kinematic/AnimatableBody **до** физики |
| 50 | `PhysicsWorldSystem` | fixed step (§10.5), transform sync |
| 51 | `PhysicsContactSystem` | **NEW** — drain events (userData→EntityId, §5) |
| 52 | `PhysicsJointSystem` | **NEW** — spawn/sync scene joints |
| 90 | `VehicleVisualSyncSystem` | без изменений |
| … | `RenderSyncSystem` | presentation resolver + **render-интерполяция** (§10.5, M2) |

**M10 — порядок Animation < Physics:** kinematic/AnimatableBody-тела authoritative по Transform.
Анимация обязана записать Transform **до** `PhysicsWorldSystem` (order 50), который читает его в
`setNextKinematicTranslation`. Иначе kinematic-тела отстают на кадр. Если система анимации ещё не
существует — зафиксировать этот инвариант порядка на будущее.

**Render-интерполяция (M2)** переехала в `RenderSyncSystem` (не backend, не `PhysicsWorldSystem`):
хранит prev+current transform тела, лерпит по остатку accumulator (§10.5).

`PhysicsColliderSystem` changes:

- Уважать `Collider.enabled`, `RigidBody.enabled`, `PhysicsController.enabled` — **в рантайме**
  (`collider.setEnabled`), не только на входе в Play (§10.6)
- Не использовать `Collider.isStatic`
- Compound subtree aggregation (с остановкой на вложенном RigidBody, §6.1)
- Layer/mask + `ActiveCollisionTypes` на spawn
- `collider.userData = EntityId` для роутинга событий (§5)

---

## 10.5 Fixed timestep, substepping и интерполяция (M1 — фундамент, был пропущен)

Любой «industrial» движок разделяет частоту симуляции и частоту кадров (Unity `FixedUpdate` /
`Time.fixedDeltaTime`, Godot `physics_ticks_per_second`, Gaffer «Fix Your Timestep»). В ревизии 1
этого контракта не было — `step(dt)` принимал произвольный dt. Backend `step(dt)` остаётся
низкоуровневым; **политика шага живёт в `PhysicsWorldSystem`**:

```
FIXED_DT = 1/60                    // фиксированный шаг симуляции (конфигурируемо)
MAX_SUBSTEPS = 5                   // потолок против «spiral of death»
accumulator += frameDelta
substeps = 0
while accumulator >= FIXED_DT and substeps < MAX_SUBSTEPS:
    savePrevTransforms()          // для интерполяции (§ниже)
    world.step(FIXED_DT)          // ВСЕГДА фиксированный dt, не frameDelta
    accumulator -= FIXED_DT
    substeps++
if substeps == MAX_SUBSTEPS: accumulator = 0   // отставание — сбрасываем, не копим
alpha = accumulator / FIXED_DT     // остаток для рендер-интерполяции
```

- **Детерминизм шага:** `world.step` только с `FIXED_DT`; передавать frameDelta в Rapier запрещено.
- **Spiral of death:** `MAX_SUBSTEPS` + сброс accumulator при потолке — иначе при лаге сим отстаёт
  всё сильнее.
- **Render-интерполяция:** `RenderSyncSystem` лерпит `lerp(prevTransform, currentTransform, alpha)`
  для тел с `interpolation: 'interpolate'`. Это **движковая** ответственность (Rapier интерполяцию
  не делает, M2), поэтому `interpolation` — поле презентации, не capability.
- Тесты детерминизма fixed-step — P2 (§16).

## 10.6 Runtime reconciliation — spawn/despawn/enable в Play (B2 — было статично)

Ревизия 1 делала `PhysicsColliderSystem.bootstrap()` **один раз** (флаг `bootstrapped`), без
пофреймовой синхронизации. Это **не паритет с Unity/Godot**, где спавн снаряда, разрушение объекта,
включение триггера в рантайме — базовые механики, а не опция. Rapier поддерживает всё это дёшево
(`world.removeRigidBody`, `body.setEnabled`, `collider.setEnabled`).

**Решение:** `PhysicsColliderSystem` — не bootstrap-once, а **diff-реконсиляция** ECS ↔ backend по
`EntityId`:

| ECS-изменение | Действие backend |
|---------------|------------------|
| Появилась entity с Collider/RigidBody | `createBody` + `attachShape`, регистрация в реестре |
| Удалена entity | `destroyBody` (+ отвязка джоинтов/контроллеров) |
| `Collider.enabled` toggled | `collider.setEnabled(bool)` — без пересоздания |
| `RigidBody.enabled` toggled | `body.setEnabled(bool)` |
| Сменился тип тела / форма | пересоздать тело (редкий путь) |

- Хранить `tracked: Map<EntityId, TrackedBody>` с ревизией компонента для дешёвого diff.
- Реконсиляция каждый кадр в начале физической фазы (order 45).
- **Приоритет фаз:** базовый add/remove/enable — **P2/P3** (не P5). В P5 остаётся лишь
  «hot-reload формы без пересоздания тела» как оптимизация.
- Non-uniform runtime-scale формы не поддержан (§2.1) — при смене scale форма НЕ перестраивается
  пофреймово; это осознанное ограничение (`edge-cases.md`).

---

## 11. Миграция существующих сцен

| Старое | Новое |
|--------|-------|
| `Collider { isStatic: true }` | `Collider` only (implicit static body) |
| `Collider { isStatic: false }` | `Collider` + `RigidBody { type: 'dynamic' }` |
| `StaticComponent` + Collider | `RigidBody { type: 'static' }` или collider-only |
| `physicsBodyHandle` на Collider | `physicsBodyHandle` на RigidBody |
| Vehicle chassis mass | `RigidBody.mass` или chassis (deprecation path) |

Миграция: `packages/serializer` load-time transform + тесты round-trip. Миграция dynamic-колайдера
(`isStatic: false`) **синтезирует** новый `RigidBody`-компонент — это добавление ECS-компонента при
загрузке, покрыть round-trip тестом.

**Runtime-handle implicit-static тел:** у collider-only сущности (implicit static, §2.2) нет
RigidBody-компонента → `physicsBodyHandle` писать некуда. Handle таких тел хранит **движковый
реестр** по `EntityId` (`tracked` из §10.6), не сериализуется. Это единственный путь хранения для
тел без RigidBody.

---

## 12. Интеграция с PHASE3_P5 (контроллеры)

- `ControllerPlugin.implicitCollider()` — без изменений контракта, но spawn идёт через общий
  `resolveBodyPlan()` с учётом RigidBody на entity.
- Vehicle chassis: рекомендация — explicit `RigidBody` + implicit box collider от controller
  **или** explicit Collider (arcade).
- `capabilities().dynamicRaycastVehicle` — без изменений.

---

## 13. Открытые решения (зафиксировать до P1)

| ID | Вопрос | Рекомендация |
|----|--------|--------------|
| D-C1 | Compound: hierarchy vs array | Hierarchy P2 |
| D-J1 | Joint: component vs child entity | Component на parent entity |
| D-A1 | Area: отдельный component vs только isTrigger | Оба; **один backend-путь** (sensor), §2.4 |
| D-F1 | Unsupported shape на backend | **Skip + громкая ошибка** (default); AABB — явный opt-in `unsupportedShapePolicy` (§2.1). Не молчаливая подмена |
| D-F2 | Trimesh на dynamic | Hard error в editor (политика @haku, не Rapier); рекомендовать convex decomposition (§2.1) |
| D-M1 | PhysicsMaterial: scene asset vs project asset | Project asset (как Material) |
| **D-LAYER1** | Слои: Unity vs Godot модель, сколько | **Unity-модель, 16 слоёв** (лимит Rapier), симметричная матрица (§2.7, B1) |
| **D-KIN1** | Kinematic: position vs velocity | Поле `kinematicMode`, default `position`; velocity гейтится capability (§2.2) |
| **D-DET1** | Детерминизм симуляции (реплеи/неткод) | **Out-of-scope сейчас**; при необходимости — Rapier `enhanced-determinism`, cross-platform не гарантируется (§0.5) |

---

## 14. Фазы реализации (полный backlog)

### P1 — Foundation (schema + core + serializer + migration)

- [ ] `RigidBody` schema + component
- [ ] `Collider` v2 (убрать isStatic; +enabled, isTrigger, layers, materialId)
- [ ] `PhysicsProjectSettings` (layers + matrix) в scene document
- [ ] `PhysicsMaterial` schema (asset type)
- [ ] Serializer migration + tests
- [ ] `PhysicsCapabilities` types в `@haku/physics` (без полной Rapier реализации)
- [ ] Validation: trimesh + dynamic → error
- [ ] Mass policy types (`massMode`)
- [ ] `edge-cases.md` entries для migration

**Done:** старые сцены грузятся; новые компоненты в schema; тесты green.

### P2 — Runtime spawn refactor

- [ ] `PhysicsColliderSystem` v2: **diff-реконсиляция** (§10.6), не bootstrap-once; RigidBody resolution
- [ ] Runtime spawn/despawn/enable тел и колайдеров (`setEnabled`, `removeRigidBody`) — B2
- [ ] **Fixed-timestep accumulator + MAX_SUBSTEPS** в `PhysicsWorldSystem` (§10.5, M1)
- [ ] `resolveBodyPlan()` вместо `resolveBodyType(collider.isStatic)`
- [ ] `capabilities()` на Stub + Rapier (shapes, rigidBody subset, `maxCollisionLayers`)
- [ ] Rapier: cylinder, convexHull, trimesh, worldBoundary(halfspace) в `createColliderDesc`
- [ ] Collision groups (Unity-матрица → membership/filter, 16 слоёв) в Rapier spawn — B1
- [ ] `ActiveCollisionTypes` на spawn для sensor/kinematic (M5)
- [ ] `collider.userData = EntityId` (роутинг событий, M4)
- [ ] `RaycastQuery.layerMask` (16-бит filter)
- [ ] Compound colliders (hierarchy subtree, остановка на вложенном RigidBody — M14)
- [ ] `PhysicsController.enabled === false` → no spawn
- [ ] Mass explicit vs autoFromColliders (**не занулять density на compound/convex** — M3)
- [ ] `kinematicMode` position/velocity (M11)
- [ ] `IPhysicsWorld.wakeBody()` + `clearForces()` (Simon M17/M18)
- [ ] Gameplay control modes documented in API (§10.7 M16)
- [ ] `RaycastQuery.includeSensors` / solid filter (M20)
- [ ] Frame order: scene queries before physics step (M22)

**Done:** Play mode с новой моделью на Rapier; static walls + dynamic boxes; спавн/удаление в рантайме;
детерминированный fixed-step.

### P3 — Events, areas, editor core

- [x] `PhysicsContactSystem` + event buffer
- [x] **EventQueue** batch lifecycle per update (M15)
- [x] Trigger vs collision event kinds
- [x] `PhysicsArea` component + overlap path
- [x] `Collider.enabled`, `RigidBody.enabled` в инспекторе
- [x] `RigidBodyFields`, `ColliderFields` v2 (capability-gated)
- [x] `PhysicsMaterial` asset picker + defaults
- [x] Layer dropdown (0..15) + **Physics Layer Matrix** panel (16×16, симметричная)
- [x] Viewport: show all colliders toggle
- [x] Physics debug draw через `world.debugRender()` (M13)
- [x] Render-интерполяция в `RenderSyncSystem` (prev+current, alpha из §10.5, M2)
- [x] CCD, axis lock, centerOfMass (если capabilities)
- [x] `AnimatableBody` component + spawn path (kinematic position-based)
- [x] Убрать/переназначить entity-header Static checkbox

**Done:** можно настроить collider + rigidbody; layers; видеть все colliders; события в API.

### P4 — Mesh baking & viewport authoring

- [x] **Bake convex hull from mesh** (editor viewport → Collider.points; Simon merge+matrixWorld path §9)
- [x] **Bake trimesh** (static-only guard)
- [x] Bake dialog: Convex (dynamic) vs Trimesh (static) (M23)
- [x] UX copy «render mesh ≠ physics shape» при bake (M21)
- [x] **Convex hull gap warning** — hull не повторяет впадины mesh; trimesh для точной статики (M24, Simon VTT demo)
- [x] `bakeSource.meshRevision` + stale warning
- [x] Collider resize gizmo (box/sphere/capsule)
- [x] Non-uniform scale warning
- [x] Collision mesh LOD field (schema only + manual assign)

**Done:** ModelGeometry → convex collider в один клик.

### P5 — Advanced

- [x] `PhysicsJoint` scene component + `PhysicsJointSystem`
- [x] `CharacterBody` tier-3 controller (`move_and_slide` abstraction)
- [x] Multiple physics worlds API
- [x] Shapecast / overlap queries
- [x] `PhysicsArea` gravity override
- [x] Contact manifolds в events (full)
- [x] `Colliders` array component (если hierarchy недостаточно)
- [x] Hot-reload **формы** без пересоздания тела (оптимизация; базовый add/remove/enable уже в P2)

**Done:** паритет с Unity/Godot для типового 3D gameplay.

---

## 15. Пакеты и границы

| Пакет | Изменения |
|-------|-----------|
| `@haku/schema` | collider v2, rigid-body, physics-material, physics-area, animatable-body, physics-joint, project settings |
| `@haku/core` | новые ComponentType |
| `@haku/serializer` | migration, strip runtime handles с RigidBody |
| `@haku/physics` | capabilities, shape union, events API, query extensions |
| `@haku/physics-rapier` | shapes, groups, events, capabilities impl |
| `@haku/engine` | systems v2, contact system, joint system |
| `@haku/editor` | fields, matrix panel, bake, gizmos |
| `@haku/vehicle` | implicit collider через новый resolve (PHASE3) |

**Запрещено:** Rapier types в engine/core/schema. Three.js только в editor viewport для bake.

---

## 16. Тесты (минимум per phase)

| Phase | Tests |
|-------|-------|
| P1 | schema parse, migration round-trip (**синтез RigidBody**), validation trimesh+dynamic, layer ≤ 15 |
| P2 | spawn static/dynamic/kinematic, compound, layers filter (**16-слой граница + матрица**), enabled flags, **runtime spawn/despawn/enable**, **fixed-step детерминизм** (одинаковый результат при разном frameDelta), **explicit-mass инерция на compound** (M3), kinematicMode velocity |
| P3 | event buffer drain (**userData→EntityId, включая static**, M4), **enter/exit phase**, area overlap, **kinematic-fixed триггер** (ActiveCollisionTypes, M5), material combine pairwise (M12), capability gating unit |
| P4 | convex bake reduces vertices, hull contains mesh AABB |
| P5 | joint spawn (incl. prismatic), multi-world isolation |

---

## 17. Чеклист пробелов Unity/Godot (все закрыты планом)

| # | Пробел | Секция / фаза |
|---|--------|----------------|
| 1 | Collision layers / masks | §4, §2.7 — P1 schema, P2 runtime, P3 matrix UI |
| 2 | Collision / trigger events | §5 — P3 |
| 3 | Area vs trigger | §2.4 — P3 |
| 4 | PhysicsMaterial resource | §2.3 — P1 schema, P3 UI |
| 5 | CharacterBody vs kinematic | §7 — P5 |
| 6 | Compound + hierarchy | §6 — P2 |
| 7 | Trimesh static-only validation | §2.1 — P1 validation, P4 bake |
| 8 | CCD, axis lock, COM | §2.2 — P2/P3 capabilities |
| 9 | Collider.enabled | §2.1 — P1 schema, P3 UI |
| 10 | Mass / density policy | §2.2 — P1/P2 |
| 11 | Joint scene components | §2.6 — P5 |
| 12 | Multiple physics worlds | §8 — P5 |
| 13 | Editor matrix, debug, gizmo | §9 — P3/P4 |
| 14 | AnimatableBody | §2.5 — P3 |
| 15 | Raycast layer mask | §4.2 — P2 |
| 16 | Fixed timestep / substepping / spiral-of-death | §10.5 — P2 (M1) |
| 17 | Runtime spawn/despawn/enable в Play | §10.6 — P2/P3 (B2) |
| 18 | 16-слоёв лимит Rapier + Unity-матрица | §2.7, §0.5 — P1/P2 (B1) |
| 19 | ActiveCollisionTypes (kinematic-триггеры) | §2.4, §4.1 — P2/P3 (M5) |
| 20 | Event→EntityId через userData (incl. static) | §5 — P3 (M4) |
| 21 | Render-интерполяция (движковая, не backend) | §10.5 — P3 (M2) |

---

## 19. Кросс-чек: Simon Dev Gamedev 02-11 Physics (Rapier + Three.js)

_Источники:_
- **Theory** (~18 min): `02-11-physics-theory.vtt` → [`simon-02-11-physics-theory-transcript.txt`](../reference/simon-02-11-physics-theory-transcript.txt)
- **Code** (~1:49): `02-11-physics-code.vtt` → [`simon-02-11-physics-transcript.txt`](../reference/simon-02-11-physics-transcript.txt)
- финальный код `/Users/pavel/Downloads/02-11-physics-final/src/main.js`
- Mux HLS (signed URLs не коммитить — токены истекают)

### 19.0a Theory video (~18 min) — концепции до кода

| Тема | Цитата / смысл | План |
|------|----------------|------|
| Renderer vs engine | Three.js рисует; симуляцию делает physics engine | ✓ §1 |
| Классы движков | JS (Oimo, Cannon) vs WASM/C++ (Ammo, PhysX, Havok, Jolt, **Rapier**) | `docs/links.md` |
| Почему Rapier | docs, perf «middle ground», feature set | выбор `@haku/physics-rapier` |
| **Два представления сцены** | graphics Scene+meshes vs physics + rigid bodies (pos, shape, velocity, mass) | ✓ ECS + spawn |
| Graphics authoritative | «you set position» на mesh | Edit / kinematic |
| Physics authoritative | `step()` двигает объекты | ✓ `PhysicsWorldSystem` |
| **Sync после step** | mapping physics → graphics (pos + rot) | ✓ §10 |
| **Fixed timestep universal** | physics 1/60; render delta varies | ✓ §10.5 |
| **Accumulator** | fixed physics update, then graphics | ✓ §10.5 |
| **Interpolation optional** | «interpolate graphics depending on physics» (~17:14) | ✓ §10.5 M2 |
| **НЕ 1:1 mapping** | дерево: много mesh → **один** capsule/box; «don't make that assumption» | **M28** |
| Character | set position on «character's collision» | kinematic / CharacterBody |

### 19.0b Code video (~1:49) — ключевые тезисы из VTT

| Тема в уроке | Цитата / смысл | План |
|--------------|----------------|------|
| Three.js ≠ physics | «Three.js is a renderer… for dynamic physics you need a secondary library» | ✓ §1 |
| Два мира | Rapier World отдельно от сцены; sync вручную | ✓ §10 |
| Ground = collider без движения | «creating a collider… because the ground doesn't move» | ✓ collider-only → fixed |
| 4 типа rigid body | dynamic, fixed, kinematic position, kinematic velocity | ✓ §2.2 `kinematicMode` |
| Fixed 60 Hz | default timestep 1/60; physics «independent of frame rate» | ✓ §10.5 |
| Death spiral | max steps + reset accumulator | ✓ §10.5 |
| Convex vs trimesh | convex hull «cheaper»; trimesh для точности; **демо зазоров** convex | **M24** §9 |
| Bake pipeline | `updateMatrixWorld` → merge geometries → hull/trimesh | ✓ §9 |
| Materials | friction, density, restitution + combine (avg/min/max/multiply) | ✓ §2.3 M12 |
| Force vs impulse | force «continuous… hold down»; impulse — разовый | ✓ §10.7 (усилить M26) |
| Arcade control | `setLinearVelocity` + damping | ✓ M16/M19 |
| Sleep/wake | `wakeUp()` если тело уснуло | ✓ M17 |
| Events | `EventQueue` + `ActiveEvents` + drain `started` | ✓ §5 M15 |
| debugRender | vertex/color buffers обязательны при отладке | ✓ M13 |
| Raycast | cast ray из камеры (unproject) | ✓ §4.2 M20 |
| **Не в code-части** | layers, triggers/sensors | план шире Simon |
| **Interpolation** | в **theory** (~17:14) — да; в **code** — snap sync | ✓ M2 из theory |
| **Отложено Simon'ом** | joints, shapecast, character controller — «future sections» | ✓ P4/P5 |

### 19.1 Что Simon явно учит (концептуальный «транскрипт» из кода)

| # | Тема урока | Как в коде Simon | Статус в плане |
|---|------------|------------------|----------------|
| S1 | **Два независимых мира** — Three.js mesh и `RAPIER.RigidBody` отдельно | `#objects_` связывает вручную | ✓ §1, §10 sync |
| S2 | **RigidBody и Collider — разные шаги** | `createRigidBody` → `createCollider` | ✓ §2 Collider + RigidBody |
| S3 | **fixed vs dynamic** | `RigidBodyDesc.fixed()` пол, `dynamic()` коробка | ✓ `RigidBody.type` |
| S4 | **Сложный mesh ≠ collider** — convex hull обёртка | `#createPhysicsMesh_`: merge + `convexHull(vertices)` | ✓ §9 bake; trimesh закомментирован |
| S5 | **mergeGeometries + matrixWorld** перед hull | `applyMatrix4(child.matrixWorld)` | ✓ §9 bake |
| S6 | **Fixed timestep + accumulator** | `physicsTimeAccumulator`, `world.timestep`, loop | ✓ §10.5 |
| S7 | **Spiral of death** | `MAX_STEPS = 5`, сброс accumulator | ✓ §10.5 |
| S8 | **Sync только dynamic** | пол не в `#objects_`, только dynamic в sync | ✓ `registerBody` skip static |
| S9 | **Collision events** | `setActiveEvents(COLLISION_EVENTS)` | ✓ §5 |
| S10 | **EventQueue за шаг** | `new EventQueue` → `step(evtQueue)` → `drain` → `free` | ✓ §5 (деталь ниже M15) |
| S11 | **debugRender()** | `LineSegments2` из буфера Rapier | ✓ §9 M13 |
| S12 | **Raycast** | `RAPIER.Ray` + `world.castRay(ray, 100, true)` | частично §4.2 |
| S13 | **Density → mass** | `colliderDesc.setDensity(10)` | ✓ §2.2 massMode |
| S14 | **Restitution + combine** | `setRestitution` + `CoefficientCombineRule.Max` | ✓ §2.3 M12 |
| S15 | **Runtime spawn** | `#createPhysicsBox_` по Space | ✓ §10.6 |
| S16 | **Три режима управления** | impulse / force / `setLinvel` + `resetForces` | **пробел → §19.2 M16** |
| S17 | **wakeUp()** перед силами | `rigidBody.wakeUp()` | **пробел → §19.2 M17** |
| S18 | **Сброс сил каждый кадр** | `resetForces()` когда не жмём forward | **пробел → §19.2 M18** |
| S19 | **Damping для arcade velocity** | `setLinearDamping(0)` при setLinvel | **пробел → §19.2 M19** |
| S20 | **Роутинг событий** | по `rigidBody.handle` в `#objects_` | ✓ исправлено: §5 userData (Simon **ошибается** для static-only collider без entry в массиве — у нас лучше) |

### 19.2 Пробелы, найденные по Simon (добавить в план)

| ID | Пробел | Почему важно | Куда / фаза |
|----|--------|--------------|-------------|
| **M15** | **EventQueue lifecycle** — один queue на batch substeps, `step(evtQueue)`, drain после всех substep'ов, `free()` | Без этого события теряются или течёт память | §5 backend contract; P3 `PhysicsContactSystem` |
| **M16** | **Gameplay control modes** — документировать три паттерна: `applyImpulse` (разовый), `applyForce`/`queueSubstepAction` (непрерывный, сброс после step), `setLinvel`/`setAngvel` (arcade, обход интегратора) | Simon учит все три; vehicle/character выбирают режим | §10.7 новый; `docs/architecture.md` ссылка; P2 API |
| **M17** | **`wakeUp()`** перед apply force/impulse на sleeping body | Спящее тело не реагирует | `IPhysicsWorld.wakeBody(handle)`; P2 |
| **M18** | **`resetForces()` / clear accumulators** при отпускании input | Rapier копит force между кадрами; без сброса — «залипание» | §10.7; контракт `applyForce` one-step + explicit `clearForces()` для arcade; P2 |
| **M19** | **Linear/angular damping** как gameplay-параметр (arcade `damping=0` при setLinvel) | Отдельно от `RigidBody.angularDamping` в схеме | §2.2 уже есть; добавить подсказку в editor/tooltip P3 |
| **M20** | **Raycast `solid` / hit filter** — третий аргумент `castRay(ray, maxToi, solid)`; sensor vs solid | Simon `solid=true`; триггеры нужно опционально включать | §4.2 `includeSensors` на query; P2 |
| **M21** | **Принцип «render mesh ≠ physics shape»** — явный UX copy в редакторе при bake | Simon главный педагогический тезис урока | §9 текст кнопки Bake; P4 onboarding |
| **M22** | **Порядок кадра: queries → input → physics → sync → debug** | Simon: raycast → spawn → forces → step → sync → debugRender | §10 таблица: уточнить order ~46 `PhysicsQuerySystem` (raycast pick) до physics; P2 |
| **M23** | **Convex vs trimesh выбор в UI** — Simon показывает оба в комментариях | Автор выбирает: convex+dynamic OK, trimesh для static | §9 bake dialog: «Convex (dynamic)» / «Trimesh (static only)»; P4 |
| **M24** | **Convex hull зазоры** — VTT: ray «между» частями mesh проходит с hull, с trimesh — нет | Hull дешевле, но неточен для level collision | §9 warning при bake; P4 |
| **M25** | **Shapecast** — VTT финал: «ray casting, but with a shape» (future topic) | Thick pick / capsule sweep | §4.3 — P4 |
| **M26** | **Force = continuous while held** — VTT: «has to be continuous… hold down forward» | Без per-frame/substep apply сила не работает | §10.7 — P2 |
| **M27** | **Damping + velocity override** — VTT: damping как «fake air friction» при setLinvel | Arcade feel vs мгновенная остановка | §10.7; editor tooltip P3 |
| **M28** | **Нет 1:1 graphics↔physics** — theory: дерево с множеством mesh → **один** capsule/box в physics; «don't make that assumption» | Архитектурный принцип @haku: N `MeshRenderer` / child meshes → 1 `Collider` или compound | §1 authoring note; editor onboarding P3 |

Simon **откладывает** (наш P4/P5): Rapier **character controller**, **joints**, **shapecast** — «future sections» в конце code-VTT.

- Collision layers / matrix (Simon не учит)
- Render interpolation (Simon sync snap — мы лучше для 60fps render / 60Hz physics)
- Capability-gating UI
- Runtime reconciliation (Simon spawn есть, но без общей ECS-модели)
- V-HACD / compound для сложных dynamic-мешей (Simon — один convex hull)
- CharacterBody, AnimatableBody, joints, areas
- ActiveCollisionTypes для kinematic triggers

### 19.4 §10.7 Gameplay control & force contract (новый)

Контракт для систем и будущего scripting — **не смешивать режимы на одном теле в одном кадре**:

```
1. Impulse mode     — applyImpulse once; подходит для прыжка, удара.
2. Force mode       — applyForce **каждый кадр/субстеп пока удерживается input**
                      (Simon: «continuous… hold down the forward button»);
                      queueSubstepAction перед fixed substep;
                      backend сбрасывает после step (§architecture.md).
3. Velocity mode    — setLinvel/setAngvel; для arcade-персонажа/машины;
                      рекомендуется wakeUp() + resetForces() + при необходимости
                      setLinearDamping (Simon: «fake air friction») на время override.
```

`PhysicsController` plugins объявляют preferred mode в registry metadata (PHASE3_P5).

### 19.5 Обновлённый чеклист (Simon)

| # | Пробел | Секция / фаза |
|---|--------|----------------|
| 22 | EventQueue lifecycle | §5, §19.2 M15 — P3 |
| 23 | Gameplay control modes | §10.7 M16 — P2 |
| 24 | wakeUp API | §19.2 M17 — P2 |
| 25 | resetForces / clear accumulators | §10.7 M18 — P2 |
| 26 | Raycast solid/sensor filter | §4.2 M20 — P2 |
| 27 | Render≠physics UX copy | §9 M21 — P4 |
| 28 | Frame order queries before physics | §10 M22 — P2 |
| 29 | Convex vs trimesh bake dialog | §9 M23 — P4 |
| 30 | Convex hull gap warning | §9 M24 — P4 |
| 31 | Force continuous while held | §10.7 M26 — P2 |
| 32 | Damping + velocity override | §10.7 M27 — P3 |
| 33 | Shapecast (Simon defer) | §4.3 M25 — P4 |
| 34 | No 1:1 mesh↔physics (theory) | §19.2 M28 — P3 docs |

---

## 20. Следующий шаг

1. Ревью этого документа → зафиксировать решения D-C1…D-M1.
2. Старт **P1**: `packages/schema/src/rigid-body.ts`, refactor `collider.ts`, migration tests.
3. Параллельно: строка в `IMPLEMENTATION_PLAN.md` § physics (если есть) со ссылкой на этот doc.
4. Референс Simon 02-11: theory + code VTT в `docs/reference/`, код `02-11-physics-final/src/main.js`.

_Конец документа._
