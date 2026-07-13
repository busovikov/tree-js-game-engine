# Проверка архитектурных границ (dependency-cruiser)

Автоматическая защита слоёв из `docs/ARCHITECTURE_AUDIT.md`. Конфиг:
`.dependency-cruiser.cjs`.

## Целевые правила (severity `error`)

- `no-circular` — запрет циклов между модулями/пакетами.
- `engine-not-to-editor` — рантайм-движок не зависит от редактора (обратная утечка, §3).
- `core-not-to-engine-or-editor`, `schema-is-a-leaf` — нижние слои не тянут верхние.
- `no-three-in-core-schema-physics` — `core`/`schema`/`physics` остаются renderer-agnostic.
- `rapier-impl-restricted` — конкретный rapier-бэкенд только в `editor`/`playground`/тестах.
- `no-react-in-engine-core` — React не протекает в рантайм-слои.

`no-orphan-dead-modules` — `warn` (кандидаты в мёртвый код).

## Первый запуск: зафиксировать baseline

Сейчас в коде есть известные нарушения (§3 редакторные проходы в `engine`/`core`,
§5 демо-домен Isaac). Чтобы CI падал только на **новых** нарушениях, один раз
зафиксируйте текущее состояние как baseline:

```bash
pnpm install            # подтянет dependency-cruiser (добавлен в devDependencies)
pnpm depcruise:baseline # создаст .dependency-cruiser-known-violations.json — закоммитить
```

По мере выполнения Фаз 2–3 (устранение утечек) удаляйте соответствующие записи из
baseline — тогда правило начнёт защищать уже вычищенную ось.

## В CI

```bash
pnpm depcruise          # падает на любом нарушении, которого нет в baseline
```

Запускать на Linux свежим `pnpm install` (см. заметку аудита о расхождении
платформ node_modules).
