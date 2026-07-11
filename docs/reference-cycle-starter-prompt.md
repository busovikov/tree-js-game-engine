# Reference cycle — starter prompt

Copy into a **new chat** to start the orchestrator:

```markdown
Возьми референс и создай по нему проект.

**Референс:** <URL git-репозитория или путь на диске>
**Целевой проект:** ~/work/<имя-игры>
**Платформа:** этот репозиторий, ветка feat/reference-<короткое-имя>

Запусти reference-driven cycle (@reference-driven-cycle):
1. Фаза 0 — анализ референса + уточняющие вопросы
2. Фаза 1 — план + архитектурные вопросы (физика, UI, скрипты)
3. Цикл разработки через Notion board Iterative development

Notion: https://app.notion.com/p/39a1402af56080458673d2afa6c1cdc5
```

After setup, resume with:

```markdown
CONTINUE cycle
```

After reviewing a task on the board:

```markdown
CONTINUE — T02.3 переведена в Done.
```

or

```markdown
REWORK T02.3 — <что исправить>. Вернул в To do.
```
