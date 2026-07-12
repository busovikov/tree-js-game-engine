# Testing Requirements — raycast-vehicle cycle

**Applies to:** all executable tasks T01.1–T01.41 (not P0/P1 planning).

Every task **📎 Docs** spec must include **Testing** and **Validation** sections per [`NOTION_SYNC.md`](../NOTION_SYNC.md).

---

## By task category

### Platform packages (E01–E08, E07)

| Requirement | Detail |
| ----------- | ------ |
| Unit tests | New/changed behavior in `packages/*/src/*.test.ts` |
| Build | `pnpm build` — no type errors across workspace |
| Package test | `pnpm --filter @haku/<package> test` — **0 failures** |
| Editor manual | If editor UI changed: open `@haku/editor-app`, verify inspector/viewport |

### TARGET_BUILD (E10 — T01.37–T01.41)

| Requirement | Detail |
| ----------- | ------ |
| Scene load | Target project opens in editor without errors |
| Play mode | Acceptance scenario from task AC (drive, HUD, etc.) |
| Playwright | Agent runs applicable tier from `AGENT_EDITOR_WORKFLOW.md` when assembling |
| Target commit | Changes committed in `~/work/tmp-js-game-project` |

### Milestone smoke (orchestrator / user)

| Milestone | Minimum validation |
| --------- | ------------------- |
| **M1** | WASD drive, chase camera, respawn, shadows; manual colliders collide |
| **M2** | M1 + HUD, tuning panel, transporter, tire marks |
| **M3** | M2 + post-FX match reference; collider modes A+C available |

---

## Subagent Review checklist

Before **Review**:

```
- [ ] Unit/integration tests added or updated
- [ ] pnpm test (affected packages) — pass
- [ ] pnpm build — pass
- [ ] Manual steps in spec executed (or noted in Notion comment)
- [ ] Git docs/*.md updated per AC
- [ ] Notion comment lists test commands + result
```
