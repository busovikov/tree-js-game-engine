# Next-session launcher prompt

Copy the block below into a new Codex session:

```text
Продолжай автономное развитие @haku через Bounce Run на ветке
engine-improvement-based-on-game-creation. Главная цель — развитие универсального движка,
игра служит доказательством. Сначала полностью прочитай AGENTS.md,
docs/autonomous-engine-game-agent.md, docs/engine-game-development-plan.md,
docs/node-graph-architecture.md и docs/stage-handoff.md; current baseline смотри в
docs/engine-game-current-state.md. Выполняй milestones строго по порядку. Каждый отдельный
по смыслу этап запускай в отдельном sub-agent и передавай только нужные документы, узкие
source entrypoints и acceptance criteria. При 80% контекста или раньше подготовь handoff по
docs/stage-handoff.md и продолжи свежим sub-agent. Действуй полностью самостоятельно до
полного MVP, сразу чини все consumers после breaking changes, делай гранулярные локальные
коммиты, не делай push/PR и не меняй историю. Начни с первого незавершённого milestone,
проверив Git status и evidence предыдущего handoff.
```
