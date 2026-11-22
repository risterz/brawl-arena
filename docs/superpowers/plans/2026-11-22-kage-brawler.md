# Kage (Shadow Assassin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kage (`kage`), a 7th playable Blade Dasher assassin brawler, across `@brawl-arena/shared`, `@brawl-arena/client`, and `@brawl-arena/worker` with full Blender 3D rigged GLB, transparent portrait, blade SFX, slash VFX, Bot AI, and online dash sync.

**Architecture:** All combat, `DashState` substepped movement, wall-piercing lifesteal projectiles, and Bot AI live deterministically in `shared/src/` and are shared unchanged by Solo (`LocalMatchController`) and Online (`RoomDurableObject` at 20 Hz). The client adds 60 fps server-authoritative dash velocity smoothing in `OnlineMatchController`, rigged `kage.glb` + `384x320` transparent `kage.png` rendered from Blender 5.3, sculpted 3D crescent VFX, and retro slash audio.

**Tech Stack:** TypeScript 5.8, Vite 6, Three.js 0.175, Cloudflare Workers + Durable Objects, Vitest 3.1, Playwright 1.52, Blender 5.3 MCP.

**Spec:** [docs/superpowers/specs/2026-11-22-kage-brawler-design.md](../specs/2026-11-22-kage-brawler-design.md)

## Global Constraints

- Deterministic simulation in `shared/src/` has zero DOM or Three.js dependencies.
- `kage` stats: `maxHp: 4200`, `moveSpeed: 4.25`, `radius: 0.39`, `maxAmmo: 3`, `reloadTime: 1.65`, `attackCooldown: 0.28`, `primaryColor: '#1b3b4b'`, `accentColor: '#ff2e63'`.
- `Shadow Dash` primary: `range: 2.7`, `duration: 0.18`, `speed: 15.0`, `radius: 0.72`, `damage: 1080`, `piercing: true`, `isDash: true`, `superChargePerHit: 22`.
- `Phantom Slash` super: `range: 9.2`, `spreadRad: 0.24`, `projectiles: 3`, `speed: 17.5`, `radius: 0.62`, `damage: 1250`, `piercing: true`, `passesWalls: true`, `lifestealRatio: 0.8`, `superChargePerHit: 25`.
- Rigged `client/public/models/kage.glb` faces `+X`, grounded at `Y = 0`, ~1.5 units tall, with 5 clips matching substring lookup (`Idle`, `Run`, `Attack`, `Victory`, `Defeat`), tuned for `applyCartoonColorCorrection` (`gamma 1.45`, `metalness <= 0.28`).
- `client/public/portraits/kage.png` is a `384x320` transparent-background RGBA PNG rendered from `kage.glb` in Blender.
- `client/public/audio/sfx_kage.mp3` decodes cleanly via Web Audio API and is documented accurately in `client/public/audio/CREDITS.md`.

## Review Focus

1. **Diagonal wall-corner & water dash clipping:** Dashing diagonally into a wall corner or water/lava tile must keep Kage on walkable ground and never tunnel across cover (tested in Task 1).
2. **Lifesteal on spawn-invulnerable & low-HP overkill targets:** `Phantom Slash` heals `0` against `invulnTimer > 0` targets and heals `Math.round(actualHpRemoved * 0.8)` on overkill, clamped to `maxHp` (tested in Task 1).
3. **Brawl Ball dash interactions:** Firing while holding the ball kicks normally without dashing; touching a loose ball mid-dash picks it up and cancels `b.dash` immediately (tested in Task 1).
4. **Online dash 60 fps smoothing vs 75 ms interp buffer:** `OnlineMatchController` reads latest server `dash` state immediately (not delayed 75 ms), advances `predX`/`predY` smoothly along dash velocity, and resumes walk prediction immediately once `dash` clears (tested in Task 4).
5. **Asset & UI roster parity for 7 brawlers:** Every brawler in `BRAWLER_LIST` (7 total) has `.glb` (>1 KB), `384x320` `.png`, multi-part primary & super visuals (`children.length >= 2`), `SFX_URLS` entry, and dynamic Home button label `Change Brawler (7)` (tested in Tasks 3, 4 & 5).

---

## File Structure

- **Create:**
  - `shared/tests/kage.test.ts` — Unit tests for `Shadow Dash`, `Phantom Slash`, lifesteal, wall-piercing, CC/separation, and Brawl Ball interactions.
  - `client/public/models/kage.glb` — Rigged Blender 3D shinobi model with 5 animation clips.
  - `client/public/portraits/kage.png` — `384x320` transparent RGBA Blender studio render.
  - `client/public/audio/sfx_kage.mp3` — Crisp retro blade-slash sound effect.
- **Modify:**
  - `shared/src/types.ts` — Add `'kage'` to `BrawlerId`, `DashState` interface, `BrawlerState.dash`, and `AttackSpec` / `ProjectileState` fields (`isDash`, `dashDuration`, `passesWalls`, `lifestealRatio`).
  - `shared/src/brawlers.ts` — Add `BRAWLERS.kage` and append to `BRAWLER_LIST`.
  - `shared/src/combat.ts` — Return `number` from `CombatCallbacks.applyDamage`, handle `spec.isDash` in `triggerAttack`, shared `hitSlots` for `kage` Super in `fireSingleVolley`, `passesWalls` and `lifestealRatio` in `stepProjectiles`, and cancel `target.dash` on knockback.
  - `shared/src/match.ts` — Return `number` from `applyDamage`, step `b.dash` with substeps (`<= 0.14`) and single-hit piercing, skip Step 1b separation during `dash`, cancel `dash` on knockback / death / respawn / kickoff / loose-ball pickup.
  - `shared/src/protocol.ts` — Serialize `dash: b.dash ? { ...b.dash, hitSlots: [] } : null` in `serializeSnapshot`.
  - `shared/src/botAi.ts` — Add Kage spacing (`0.34`), dash path walkability guard, and wall-piercing `Phantom Slash` casting in Gem Grab and Brawl Ball.
  - `worker/src/roomDo.ts` — Include `'kage'` in online bot selection.
  - `client/src/render/modelBank.ts` — Register `'kage': '/models/kage.glb'` in `ModelKey` and `MODEL_MANIFEST`.
  - `client/src/render/brawlerMeshes.ts` — Add procedural fallback shinobi mesh for `'kage'`.
  - `client/src/render/projectileMeshes.ts` — Add multi-part crescent/shadow visuals for `'kage'` (`isSuper: false` and `true`).
  - `client/src/render/vfx.ts` — Exclude `passesWalls` from `clipToWalls` telegraph clipping; add `spawnSlashBurst`.
  - `client/src/render/arenaScene.ts` — Trigger `spawnSlashBurst` on Kage primary attack and forward tilt (`-0.34`) while `b.dash` is active.
  - `client/src/net/onlineController.ts` — Track latest server `localDash` state for 60 fps dash velocity smoothing and immediate post-dash recovery.
  - `client/src/audio/sfx.ts` & `client/public/audio/CREDITS.md` — Register `'kage'` SFX and document audio origin.
  - `client/src/ui/screens.ts` — Dynamic `Change Brawler (${BRAWLER_LIST.length})`.
  - `shared/tests/bot-ai.test.ts`, `worker/tests/room-do.test.ts`, `client/tests/projectile-meshes.test.ts`, `client/tests/controls-net.test.ts`, `e2e/brawl-arena.spec.ts` — Test coverage for Kage.

---

### Task 1: Shared Kage Config, `Shadow Dash`, and `Phantom Slash` Engine Mechanics

**Files:**
- Modify: `shared/src/types.ts:3,25-49,84-180`
- Modify: `shared/src/brawlers.ts:3-260`
- Modify: `shared/src/combat.ts:68-179,181-267,319-413`
- Modify: `shared/src/match.ts:105-146,212-289,344-656,802-830,926-942`
- Modify: `shared/src/protocol.ts:143-157`
- Create: `shared/tests/kage.test.ts`

**Interfaces:**
- Produces:
  - `BrawlerId` union including `'kage'`
  - `DashState` (`dirX`, `dirY`, `speed`, `elapsed`, `duration`, `hitRadius`, `damage`, `superChargePerHit`, `hitSlots`) on `BrawlerState.dash: DashState | null`
  - `AttackSpec` optional fields: `isDash?: boolean`, `dashDuration?: number`, `passesWalls?: boolean`, `lifestealRatio?: number`
  - `ProjectileState` fields: `passesWalls: boolean`, `lifestealRatio: number`
  - `MatchEngine.applyDamage(attacker, target, amount): number` and `CombatCallbacks.applyDamage(...): number`
  - `serializeSnapshot` includes `dash: b.dash ? { ...b.dash, hitSlots: [] } : null`

- [ ] **Step 1: Write failing unit tests in `shared/tests/kage.test.ts`**

Cover:
1. `BRAWLERS.kage` exists in `BRAWLER_LIST` (length 7) with exact spec stats (`4200` HP, `4.25` speed, `0.39` radius, `1.65` reload, `0.28` cooldown).
2. `Shadow Dash` advances Kage ~2.7 tiles over `0.18s`, pierces 2 enemies lined up along path dealing `1080` each once (`22` super charge each = `44`), skips body separation while dashing, and clears `dash` on completion.
3. Review Focus #1: `Shadow Dash` aimed straight or diagonally into `WALL_SOLID`, `WALL_BREAKABLE`, and `WATER` stops cleanly outside blocked tiles without tunneling.
4. Knockback (e.g. Buck Super) hitting Kage mid-dash cancels `kage.dash` cleanly.
5. `Phantom Slash` Super passes through `WALL_SOLID` and `WALL_BREAKABLE`, hits a lined-up enemy only once across the 3-projectile wave for `1250` damage, and heals damaged Kage for `1000` HP (`80%` of `1250`), clamped to `maxHp`.
6. Review Focus #2: `Phantom Slash` against a spawn-invulnerable target (`invulnTimer > 0`) deals `0` damage and heals `0` HP; killing a `200` HP enemy heals `160` HP (`Math.round(200 * 0.8)`).
7. Review Focus #3 (Brawl Ball): firing while Kage holds the ball kicks the ball and keeps `kage.dash === null`; dashing into a loose ball picks it up and cancels `kage.dash` immediately.
8. `serializeSnapshot` preserves `dash` with `hitSlots: []` when active and `null` when idle.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/tests/kage.test.ts`
Expected: FAIL (type/export errors for `'kage'`, `dash`, `passesWalls`, `lifestealRatio`).

- [ ] **Step 3: Implement shared types, Kage config, dash & lifesteal combat, and snapshot serialization**

1. `shared/src/types.ts`: Add `'kage'` to `BrawlerId`, add `DashState`, add `dash: DashState | null` to `BrawlerState`, add `isDash?: boolean`, `dashDuration?: number`, `passesWalls?: boolean`, `lifestealRatio?: number` to `AttackSpec`, and `passesWalls: boolean`, `lifestealRatio: number` to `ProjectileState`.
2. `shared/src/brawlers.ts`: Add `BRAWLERS.kage` with exact values from Spec §5.1–§5.3 and append `BRAWLERS.kage` to `BRAWLER_LIST`.
3. `shared/src/combat.ts`:
   - Change `CombatCallbacks.applyDamage` return type to `number`.
   - In `fireSingleVolley`: share `hitSlots` when `shooter.brawlerId === 'lumi' || shooter.brawlerId === 'kage'`, populate `passesWalls: Boolean(spec.passesWalls)` and `lifestealRatio: spec.lifestealRatio ?? 0` on created projectiles.
   - In `triggerAttack`: when `spec.isDash`, set `shooter.dash = { dirX: Math.cos(angle), dirY: Math.sin(angle), speed: spec.speed, elapsed: 0, duration: spec.dashDuration ?? 0.18, hitRadius: spec.radius, damage: spec.damage, superChargePerHit: spec.superChargePerHit, hitSlots: [] }` and return.
   - In `stepProjectiles`: skip wall collision when `p.isHeal || p.passesWalls`; capture `const actualDmg = callbacks.applyDamage(owner, target, dmg);`; when `p.lifestealRatio > 0 && actualDmg > 0 && owner && owner.alive`, call `callbacks.applyHeal(owner, owner, Math.round(actualDmg * p.lifestealRatio))`; when `p.knockback > 0 && target.alive && target.invulnTimer <= 0`, clear `target.dash = null`.
4. `shared/src/match.ts`:
   - Initialize `dash: null` in constructor; clear `dash = null` on death, respawn, and `resetBrawlBallKickoff`.
   - Change `applyDamage` to return `number` (`0` on early exit, `actual` otherwise).
   - In `step(dt)`: right after `if (b.leap)` block, handle `if (b.dash)` with fine substeps (`Math.max(1, Math.ceil((b.dash.speed * dt) / 0.14))`), `resolveCircleGridCollision(this.state.grid, nextPos, cfg.radius, false)`, enemy hit detection (`dist <= b.dash.hitRadius + BRAWLERS[target.brawlerId].radius`) with `b.dash.hitSlots` dedup, `applyDamage` + `onSuperCharge`, and clear `b.dash = null` when `elapsed >= duration`.
   - On leap landing knockback (`leap.onLandKnockback > 0`), also clear `target.dash = null`.
   - In Step 1b brawler separation: skip if `a.dash || b.dash`.
   - In `stepBrawlBall` loose-ball pickup loop: when a brawler picks up the ball, clear `b.dash = null` so Kage grabs the ball cleanly without dash-dribbling.
5. `shared/src/protocol.ts`: Add `dash: b.dash ? { ...b.dash, hitSlots: [] } : null` in `serializeSnapshot`.

- [ ] **Step 4: Run shared test suite to verify all tests pass**

Run: `npx vitest run shared/tests/`
Expected: PASS (all existing shared tests + all new `kage.test.ts` tests).

- [ ] **Step 5: Commit**

```bash
git add shared/src/types.ts shared/src/brawlers.ts shared/src/combat.ts shared/src/match.ts shared/src/protocol.ts shared/tests/kage.test.ts
git commit -m "feat(shared): add Kage brawler with Shadow Dash and wall-piercing lifesteal Phantom Slash"
```

---

### Task 2: Kage Bot AI & Online Room Support

**Files:**
- Modify: `shared/src/botAi.ts:500-520,675-735,925-960`
- Modify: `worker/src/roomDo.ts:57,679-695`
- Test: `shared/tests/bot-ai.test.ts`, `worker/tests/room-do.test.ts`

**Interfaces:**
- Consumes: `BRAWLERS.kage`, `AttackSpec.isDash`, `AttackSpec.passesWalls`, `BrawlerState.dash` from Task 1.
- Produces: Kage-aware `BotController.computeInputs` (Gem Grab & Brawl Ball) and `RoomManager` supporting `'kage'` picks and `dash` snapshots.

- [ ] **Step 1: Write failing tests in `shared/tests/bot-ai.test.ts` and `worker/tests/room-do.test.ts`**

1. `shared/tests/bot-ai.test.ts`:
   - `Kage bot engages enemies in range via Shadow Dash, refuses to dash directly into a blocking wall/water tile, and casts Phantom Slash through solid cover when superCharge === 100`.
   - `Kage bot runs cleanly for 60 ticks in both Gem Grab and Brawl Ball without NaN coordinates`.
2. `worker/tests/room-do.test.ts`:
   - `allows picking kage in lobby, starts match, latches fire input into Shadow Dash, and broadcasts dash state in MatchSnapshot`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/tests/bot-ai.test.ts worker/tests/room-do.test.ts`
Expected: FAIL on new Kage Bot AI / wall-piercing super / dash guard assertions.

- [ ] **Step 3: Implement Kage Bot AI logic and worker room support**

1. `shared/src/botAi.ts`:
   - Add helper `isDashPathClear(grid: Uint8Array, from: Vec2, angle: number, checkDist = 1.8): boolean` checking walkability (`isWalkablePoint`) and `findBlockingWallForCircle(grid, px, py, 0.32) === null` at steps `0.45, 0.9, 1.35, 1.8`.
   - In Gem Grab:
     - Skip inputs when `bot.dash` is active (same as `bot.leap`).
     - Set `idealFactor` for `'kage'` to `0.34` (and `rushFactor` to `0.28`).
     - Super casting: when `bot.brawlerId === 'kage'` and `bot.superCharge >= 100`, cast `Phantom Slash` if `dist <= cfg.superAttack.range * 0.94` (no LOS required since `passesWalls: true`), prioritizing when `hpRatio < 0.78 || targetEnemy.gems >= 2 || targetEnemy.hp <= cfg.superAttack.damage * 1.1 || enemyLeadingHeavily`.
     - Primary firing: when `cfg.attack.isDash`, require `isDashPathClear(state.grid, bot, aimAngle, Math.min(1.8, dist))` before setting `fire = true`.
   - In Brawl Ball (`computeBrawlBallInput`):
     - Allow Super when `cfg.superAttack.passesWalls` (`canShoot || cfg.superAttack.breaksWalls || cfg.superAttack.passesWalls`).
     - When `cfg.attack.isDash`, require `isDashPathClear(state.grid, bot, aimAngle, Math.min(1.8, dist))` before firing.
2. `worker/src/roomDo.ts`:
   - Ensure `BRAWLER_LIST` rotation includes `'kage'` (already uses `BRAWLER_LIST.find(...)` in `startMatch`; include `'kage'` as a valid pick — already validates via `BRAWLERS[msg.brawlerId]`). Verify `RoomManager` snapshots include `dash`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run shared/tests/bot-ai.test.ts worker/tests/room-do.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/botAi.ts worker/src/roomDo.ts shared/tests/bot-ai.test.ts worker/tests/room-do.test.ts
git commit -m "feat(ai,worker): add Kage Bot AI dash/wall-pierce logic and verify online room sync"
```

---

### Task 3: Blender Rigged 3D Model (`kage.glb`) & Transparent Portrait (`kage.png`)

**Files:**
- Create: `client/public/models/kage.glb`
- Create: `client/public/portraits/kage.png`
- Modify: `client/src/render/modelBank.ts:5-52`
- Modify: `client/tests/projectile-meshes.test.ts:59-68`

**Interfaces:**
- Consumes: `BrawlerId` `'kage'` from Task 1.
- Produces: `'kage'` in `ModelKey` and `MODEL_MANIFEST`, rigged `client/public/models/kage.glb` with clips `Idle`, `Run`, `Attack`, `Victory`, `Defeat`, and `384x320` transparent RGBA `client/public/portraits/kage.png`.

- [ ] **Step 1: Inspect reference model (`buck.glb`) and portrait (`buck.png`) conventions**

Use Blender MCP `execute_code` to inspect `d:\Antigravity\brawl-arena\client\public\models\buck.glb` (bounding box height, root orientation, bone hierarchy, action names, frame ranges) and read `client/public/portraits/buck.png` dimensions/framing so `kage.glb` and `kage.png` match existing assets 1:1.

- [ ] **Step 2: Model, rig, and animate Kage in Blender 5.3 via MCP**

Build stylized chunky Brawl Stars shinobi matching reference height (~1.5 units, feet at `Y = 0` in glTF / `Z = 0` in Blender, facing `+X`):
- Dark slate-teal shinobi hood, cowl, wrap tunic, shin guards, and boots (brightened slightly pre-export so `gamma 1.45` yields rich `#1b3b4b` tones).
- Shadowed face mask with glowing crimson eyes (`#ff2e63` emissive), flowing crimson scarf collar + trailing tail, sash belt, and curved katana in right hand with glowing crimson blade edge.
- Smooth multi-bone armature (`Root`, `Hips`, `Spine`, `Head`, `Scarf`, `ArmL`, `ForearmL`, `ArmR`, `ForearmR`, `Weapon`, `LegL`, `LegR`) with clean weights.
- Author 5 looping/action clips pushed to NLA tracks: `Idle`, `Run`, `Attack`, `Victory`, `Defeat`.
- Inspect via `get_viewport_screenshot` from front 3/4 and side views; fix any clipping, dark materials, or orientation issues.
- Export to `d:\Antigravity\brawl-arena\client\public\models\kage.glb` (glTF Binary with animations, normals, tangents, applied transforms).

- [ ] **Step 3: Render `384x320` transparent RGBA studio portrait to `client/public/portraits/kage.png`**

In Blender, pose Kage in an expressive hero 3/4 stance (`Idle` / `Victory` frame), configure transparent film (`film_transparent = True`, RGBA PNG, `384x320`), bright studio 3-point lighting matching `buck.png`–`lumi.png`, render to `d:\Antigravity\brawl-arena\client\public\portraits\kage.png`, and visually inspect with `read_file`.

- [ ] **Step 4: Register `'kage'` in `client/src/render/modelBank.ts` and update asset test**

1. Add `'kage'` to `ModelKey` and `kage: '/models/kage.glb'` to `MODEL_MANIFEST`.
2. Update `client/tests/projectile-meshes.test.ts` manifest length check from `22` to `23` and add assertion that every brawler in `BRAWLER_LIST` has an existing portrait PNG (`client/public/portraits/${b.id}.png`) > 1 KB.

- [ ] **Step 5: Verify GLB & portrait tests**

Run: `npx vitest run client/tests/projectile-meshes.test.ts`
Expected: PASS (23 GLB models + 7 portraits verified on disk).

- [ ] **Step 6: Commit**

```bash
git add client/public/models/kage.glb client/public/portraits/kage.png client/src/render/modelBank.ts client/tests/projectile-meshes.test.ts
git commit -m "feat(assets): model, rig, animate Kage GLB and render 384x320 studio portrait"
```

---

### Task 4: Client Visuals, Slash VFX, Online Dash Smoothing, Audio & UI

**Files:**
- Modify: `client/src/render/brawlerMeshes.ts:415-425`
- Modify: `client/src/render/projectileMeshes.ts:535-569`
- Modify: `client/src/render/vfx.ts:90-130,275-325`
- Modify: `client/src/render/arenaScene.ts:911-919,970-986`
- Modify: `client/src/net/onlineController.ts:53-148,260-399`
- Create: `client/public/audio/sfx_kage.mp3`
- Modify: `client/src/audio/sfx.ts:18-86`
- Modify: `client/public/audio/CREDITS.md`
- Modify: `client/src/ui/screens.ts:150-158`
- Test: `client/tests/projectile-meshes.test.ts`, `client/tests/controls-net.test.ts`

**Interfaces:**
- Consumes: `BRAWLERS.kage`, `BrawlerState.dash`, `AttackSpec.passesWalls`, `MODEL_MANIFEST.kage` from Tasks 1 & 3.
- Produces: `VfxManager.spawnSlashBurst(x, y, angle, isSuper)`, Kage procedural fallback & projectile visuals, `OnlineMatchController.ingestSnapshotForTest(snap, nowMs, mySlot?)` + 60 fps online dash velocity smoothing, exported `SFX_URLS` with `'kage'`, and dynamic Home brawler count.

- [ ] **Step 1: Write failing client unit tests in `client/tests/controls-net.test.ts`**

Add tests for:
1. Review Focus #4: Using `OnlineMatchController.ingestSnapshotForTest(snap, nowMs, 0)` + `tick(0.016, idleInput)`, feeding a snapshot with `dash` active for `mySlot` advances local `brawlers[0].x/y` smoothly along `(dash.dirX, dash.dirY) * dash.speed` immediately (without waiting 75 ms), stops cleanly at walls, and resumes WASD walk prediction immediately on the frame a snapshot clears `dash`.
2. `SFX_URLS` contains an entry for every brawler in `BRAWLER_LIST` (including `'kage'`), and `client/public/audio/sfx_kage.mp3` exists on disk (>500 bytes).

- [ ] **Step 2: Run client tests to verify they fail**

Run: `npx vitest run client/tests/`
Expected: FAIL (missing `kage` projectile branch / `sfx_kage.mp3` / online dash helper).

- [ ] **Step 3: Implement client visuals, VFX, online dash smoothing, SFX, and UI**

1. `client/src/render/brawlerMeshes.ts`: Add `else if (brawlerId === 'kage')` procedural fallback (dark slate-teal hood, crimson eye visor, trailing crimson scarf tail, curved katana blade along `+X`).
2. `client/src/render/projectileMeshes.ts`: Add `if (spec.brawlerId === 'kage')` before the Lumi fallback returning a multi-part `THREE.Group` (>=3 children):
   - Outer dark indigo-teal crescent (`getCrescentBladeGeo()`), inner bright crimson core crescent (`#ff2e63`), and crimson-violet tracer cone (`getTracerConeGeo()`), scaled `1.55` for `isSuper: true` (`Phantom Slash`) and `0.9` for `isSuper: false`.
3. `client/src/render/vfx.ts`:
   - Update line 282: `const clipToWalls = Boolean(grid && !input.spec.isHeal && !input.spec.lobbed && !input.spec.isLeap && !input.spec.passesWalls);` so `Phantom Slash` telegraph shines through walls while `Shadow Dash` clips cleanly to walls.
   - Add `spawnSlashBurst(x: number, y: number, angle: number, isSuper: boolean): void`: spawns directional crimson/indigo spark shards and a fast expanding slash ring along `angle`.
4. `client/src/render/arenaScene.ts`:
   - In `applyEvents`: when `ev.type === 'attack' && ev.brawlerId === 'kage'`, call `this.vfx.spawnSlashBurst(ev.x, ev.y, ev.angle, ev.isSuper)`.
   - In `syncState`: tilt `entry.visual.bodyGroup.rotation.z = b.dash ? -0.34 : b.tackleTimer > 0 ? -0.28 : 0;` and treat `b.dash` like `b.leap` for walk-bob suppression (`!b.leap && !b.dash`).
5. `client/src/net/onlineController.ts`:
   - Add `private latestLocalDash: DashState | null = null;` updated immediately in `buildStateFromSnapshot` and `applySnapshotMetadata` from `snap.brawlers[this.mySlot]?.dash ?? null`.
   - Export/implement clean prediction step in `tick(dt, localInput)`:
     - When `this.latestLocalDash` is non-null (and `me.alive && !me.leap && state.phase !== 'ended'`), advance `predX`/`predY` along `(latestLocalDash.dirX * latestLocalDash.speed * dt, latestLocalDash.dirY * latestLocalDash.speed * dt)` through `resolveCircleGridCollision(this.state.grid, ..., cfg.radius)` and mirror `me.dash = this.latestLocalDash` so the client body tilt plays immediately without 75 ms lag.
     - On incoming server snapshots while `srvMe.dash` is active, blend `predX`/`predY` toward `srvMe.x`/`srvMe.y` (`0.45` blend if `drift > 0.12`, hard snap if `drift > 2.2`).
     - When `latestLocalDash` becomes `null`, immediately resume normal WASD prediction on that frame.
6. `client/public/audio/sfx_kage.mp3`, `client/src/audio/sfx.ts`, `client/public/audio/CREDITS.md`:
   - Generate a crisp ~220ms retro blade-whoosh/slash sound effect and encode cleanly to `client/public/audio/sfx_kage.mp3` (verify with ffmpeg/python/node and Web Audio validity).
   - Export `SFX_URLS` (or keep exported), add `'kage'` to `SfxKey`, `SFX_URLS`, and `SFX_GAIN` (`0.40`).
   - Document `sfx_kage.mp3` accurately in `client/public/audio/CREDITS.md`.
7. `client/src/ui/screens.ts`:
   - Change line 154 from `Change Brawler (6)` to `Change Brawler (${BRAWLER_LIST.length})`.

- [ ] **Step 4: Run all unit tests to verify they pass**

Run: `npm test`
Expected: PASS across `shared/tests`, `worker/tests`, and `client/tests`.

- [ ] **Step 5: Commit**

```bash
git add client/src/render/brawlerMeshes.ts client/src/render/projectileMeshes.ts client/src/render/vfx.ts client/src/render/arenaScene.ts client/src/net/onlineController.ts client/src/audio/sfx.ts client/public/audio/sfx_kage.mp3 client/public/audio/CREDITS.md client/src/ui/screens.ts client/tests/projectile-meshes.test.ts client/tests/controls-net.test.ts
git commit -m "feat(client): add Kage visuals, slash VFX, online dash smoothing, SFX, and dynamic roster UI"
```

---

### Task 5: Full Build & End-to-End Verification

**Files:**
- Modify: `e2e/brawl-arena.spec.ts`

**Interfaces:**
- Consumes: Complete Kage integration from Tasks 1–4.
- Produces: Verified production bundle (`npm run build`), green unit suite (`npm test`), and passing Playwright E2E covering Kage selection & live gameplay.

- [ ] **Step 1: Add Kage E2E test to `e2e/brawl-arena.spec.ts`**

Add a test (or extend desktop solo test) verifying:
- Home button reads `Change Brawler (7)`.
- Opening Brawler Drawer renders 7 `.brawler-card` items, Kage's portrait `<img>` loads with `naturalWidth > 0`.
- Selecting `.brawler-card[data-id="kage"]`, launching Solo vs Bots, moving and firing (`Shadow Dash`) advances the match with `0` console/page errors.

- [ ] **Step 2: Run full build, unit tests, and E2E tests**

Run: `npm test && npm run build && npm run test:e2e`
Expected: All Vitest unit tests PASS, TypeScript + Vite production build succeeds with 0 errors, and all Playwright E2E specs PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/brawl-arena.spec.ts
git commit -m "test(e2e): verify Kage selection, portrait load, and Shadow Dash match flow"
```
