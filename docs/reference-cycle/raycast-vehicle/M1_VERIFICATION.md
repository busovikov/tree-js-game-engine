# M1 Verification — raycast-vehicle (mandatory before Review)

**Applies to:** T01.9, T01.11–T01.21, T01.39 and any M1 rework pass.

Agents **must not** move a task to **Review** until every check below passes in the **target project** (`~/work/tmp-js-game-project`) with Playwright + screenshot review.

---

## Environment

```bash
cd /Users/pavel/work/tree-js-projects
HAKU_TARGET_PATH=~/work/tmp-js-game-project pnpm --filter @haku/editor-app dev
# Browser: open 'http://localhost:5174/?hakuOpenTarget=1'

cd .agents/tools/editor-playwright
HAKU_SKIP_WEB_SERVER=1 HAKU_TARGET_PATH=~/work/tmp-js-game-project \
  HAKU_EDITOR_URL=http://localhost:5174 \
  pnpm exec playwright test tests/m1-vehicle-alignment.spec.ts tests/t01-39-vehicle-smoke.spec.ts
```

---

## Visual acceptance (human + screenshot)

| ID | Condition | Fail if |
| -- | --------- | ------- |
| **V1** | Four wheels touch ground under chassis corners | Wheels floating, stacked at origin, or >0.5 m from body |
| **V2** | Body mesh (`base.glb`) sits above wheels, not floating separately | Body wireframe/gizmo high above wheels on ground |
| **V3** | Vehicle rests on suspension (not box-collider levitation) | Chassis hovers while wheels reach down |
| **V4** | Hold **W** 2.5 s → car moves **forward** (+Z in scene) | Moves backward or sideways only |
| **V5** | Chase camera follows vehicle (T01.19) | Camera static while vehicle drives away |
| **V6** | **R** respawn resets pose (T01.21) | No reset or fall-through |
| **V7** | Ramp/tunnel colliders block vehicle (T01.39) | Drive-through mesh or no collision |

Capture **2–4 PNGs** per task in `review-artifacts/<TASK_ID>/` and attach to Notion.

---

## Playwright metrics (automated — `window.__HAKU_PLAYTEST`)

After ▶ Play + 1 s settle:

| Metric | Threshold |
| ------ | --------- |
| `allWheelsGrounded` | `true` |
| `maxWheelHorizontalOffset` | ≤ `1.85` m (reference halfWidth/halfLength diagonal) |
| `maxWheelVerticalOffset` | ≤ `1.2` m from chassis origin |
| `chassisAboveGround` | `-0.2` … `1.6` m (ground top ≈ 2.15) |
| `forwardDriveDeltaZ` (W × 2.5 s) | `> 2` m |

If any metric fails → **fix in same pass**, re-run Playwright, re-read screenshots. **Do not** post Review.

---

## Spawn height (target scene)

Ground collider top **Y = 2.15**. Vehicle entity **Y** should be:

```
groundTop + wheelRadius + suspensionRestLength - wheelConnectionY
= 2.15 + 0.42 + 0.55 - 0.35 ≈ 2.77
```

Use **Y ≈ 2.77** (not 3.0) in `playground.scene.json` unless playtest metrics prove otherwise.

---

## Agent self-check (every code pass)

```
- [ ] Defined detailed AC (above) before coding
- [ ] Changes only in target repo (AD-09) for scene/assets
- [ ] pnpm test + pnpm build (affected packages)
- [ ] Playwright M1 alignment spec — pass
- [ ] Opened review PNGs — wheels attached, forward drive correct
- [ ] If fail → rework immediately (stay In progress)
- [ ] Only then → Notion Review + screenshots
```
