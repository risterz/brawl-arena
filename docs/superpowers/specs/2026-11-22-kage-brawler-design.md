# Kage (Shadow Assassin) — Brawler Design Specification

**Date:** 2026-11-22  
**Status:** Ready for Approval (builder check completed)  
**Scope:** Project — adds a 7th playable brawler (`kage`) across `@brawl-arena/shared`, `@brawl-arena/client`, and `@brawl-arena/worker`, with full 3D rigged GLB, portrait, audio, VFX, Bot AI, online sync, and test coverage.

---

## 1. Intent & Why

Brawl Arena currently has 6 brawlers covering close shotgun burst (`buck`), long-range sniping (`vex`), rapid strafing DPS (`blaze`), heavy melee tank (`golem`), lobbed area denial (`mort`), and piercing support/healer (`lumi`). The roster lacks a high-mobility **Assassin** who can close gaps, punish backline snipers/throwers, assassinate gem carriers, and create agile plays in Brawl Ball.

**Kage** fills that gap with a **Blade Dasher** kit: his primary attack lunges his body forward while slashing enemies in his path, and his Super fires a wide wall-piercing shadow wave that heals him for damage dealt so he can survive deep dives.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Add `kage` as a fully playable, selectable brawler in Solo vs Bots and Online Custom Rooms across both Gem Grab and Brawl Ball.
- Deliver crisp, responsive `Shadow Dash` primary movement and `Phantom Slash` wall-piercing lifesteal Super in the deterministic `MatchEngine`.
- Achieve visual and animation parity with the existing 6 brawlers: rigged Blender 3D `.glb` with 5 animation clips (`Idle`, `Run`, `Attack`, `Victory`, `Defeat`), procedural Three.js fallback, custom portrait, slash/wave VFX, and blade-whoosh SFX.
- Ensure Bot AI plays Kage competently in both modes without dashing into walls, water, or suicide hazards.
- Preserve smooth online multiplayer synchronization and local prediction reconciliation.

### Non-Goals
- Adding additional brawlers (e.g., Rime or Spark) in this change.
- Rebalancing the existing 6 brawlers or altering Gem Grab / Brawl Ball win rules.
- Reintroducing cosmetic skins or shop infrastructure.

### Anti-Goals
- **Wall/water clipping or corner tunneling**: Kage must never dash into or across solid walls, breakable walls, gem mine, or water/lava tiles.
- **Unfair double-hits**: A single `Shadow Dash` or `Phantom Slash` cast must hit each enemy at most once.
- **Broken Brawl Ball interaction**: Attacking while holding the Brawl Ball must still kick the ball normally rather than dashing with the ball.
- **Visual downgrade**: Kage must not ship as an unrigged placeholder box next to 6 rigged Blender models.

---

## 3. Constraints

- **Shared deterministic engine**: All combat, dash physics, collision, and Bot AI logic must live in `shared/src/` with zero DOM or Three.js dependencies so both `client` (Solo) and `worker` (`RoomDurableObject` at 20 Hz) execute identically.
- **Existing tests & asset contracts**:
  - `client/tests/projectile-meshes.test.ts` iterates `BRAWLER_LIST` for both `isSuper: false` and `isSuper: true` and asserts `visual.children.length >= 2` and `visual.name.includes(b.id)`.
  - `MODEL_MANIFEST` entries must exist on disk in `client/public/models/` (>1 KB each).
  - `SfxEngine.playEvent` dispatches `this.playSfx(event.brawlerId, ...)`, so `'kage'` must be a valid `SfxKey` backed by `client/public/audio/sfx_kage.mp3`.
- **Cartoon color correction**: `modelBank.ts` applies gamma `1.45` and caps `metalness <= 0.28` on loaded GLBs; Blender materials must be tuned to look vibrant after this transform.
- **Blender MCP available**: Blender 5.3.0 is connected with `execute_code` and `get_viewport_screenshot` for modeling, rigging, animation, and visual inspection.

---

## 4. Approaches Considered

1. **Approach A — Full Production Parity *(Selected)***
   - Model, rig, animate, and export `client/public/models/kage.glb` in Blender (`Idle`, `Run`, `Attack`, `Victory`, `Defeat`), plus procedural fallback in `brawlerMeshes.ts`.
   - Render matching `384x320` transparent portrait (`client/public/portraits/kage.png`) from Blender, sculpted 3D crescent/dash VFX, and `client/public/audio/sfx_kage.mp3`.
   - *Trade-off*: Longer build and visual verification in Blender, but Kage matches all 6 existing brawlers on Home, Arena, and Victory Podium.
2. **Approach B — Procedural 3D Mesh Only**
   - Build Kage solely from Three.js primitives in `brawlerMeshes.ts` (bob/recoil fallback only) plus portrait and SFX.
   - *Trade-off*: Faster, lower risk, but visibly simpler with no skeletal animations compared to existing brawlers.
3. **Approach C — Gameplay-First Slice, Visuals Second**
   - Ship mechanics + placeholder first, then do Blender model + portrait in a follow-up pass.
   - *Trade-off*: Faster gameplay balance check, but splits delivery into two passes.

**User Decision:** Approach A.

---

## 5. Character & Gameplay Design

### 5.1 Identity & Base Stats *(User-approved)*
- **ID:** `'kage'` (added to `BrawlerId` union and `BRAWLER_LIST`)
- **Name:** `Kage`
- **Title:** `Shadow Blade` *(builder call)*
- **Role:** `Assassin`
- **Palette:**
  - `primaryColor`: `'#1b3b4b'` (dark slate-teal shinobi cloak/hood)
  - `accentColor`: `'#ff2e63'` (glowing crimson scarf & katana edge)
- **Stats:**
  - `maxHp`: `4200`
  - `moveSpeed`: `4.25` (fastest in roster)
  - `radius`: `0.39`
  - `maxAmmo`: `3`
  - `reloadTime`: `1.65` seconds
  - `attackCooldown`: `0.28` seconds
- **Descriptions:**
  - Primary: `"Dashes forward with a piercing katana slash through enemies."`
  - Super: `"Phantom Slash: Wide shadow wave that pierces walls and enemies, healing Kage for 80% of damage dealt."`

### 5.2 Primary — `Shadow Dash`
- **AttackSpec:**
  - `shape: 'line'`, `range: 2.7`, `spreadRad: 0`, `projectiles: 0` (body dash, not a bullet), `speed: 15.0` (`2.7 / 0.18s`), `radius: 0.72` (slash hit radius around Kage during dash), `damage: 1080`, `piercing: true`, `isDash: true`, `dashDuration: 0.18`, `superChargePerHit: 22`.
- **Engine State (`DashState` on `BrawlerState`):**
  ```ts
  export interface DashState {
    dirX: number;
    dirY: number;
    speed: number;
    elapsed: number;
    duration: number;
    hitRadius: number;
    damage: number;
    superChargePerHit: number;
    hitSlots: number[];
  }
  ```
- **Execution Rules:**
  - Triggered via `triggerAttack` when `spec.isDash` is true. Sets `b.dash`, `b.facing = angle`, `b.outOfCombatTimer = 0`, `b.revealedTimer = ATTACK_REVEAL_DURATION`, `b.recoilTimer = 0.22`, and emits the standard `'attack'` `MatchEvent`.
  - While `b.dash` is active in `MatchEngine.step(dt)`:
    - Overrides normal movement, tackle initiation, and new attacks/supers (just like `b.leap` / `b.tackleTimer`).
    - Advances `b.dash.elapsed += dt`. Moves Kage forward in fine substeps (step size `<= 0.14` tiles, matching projectile substepping) using `resolveCircleGridCollision(state.grid, nextPos, cfg.radius, false)` so Kage slides cleanly along walls/water and can never tunnel through cover or enter water/lava.
    - Updates `b.vx` / `b.vy` during dash so facing, animations, and ball/gem interactions stay coherent.
    - At each substep, checks all alive enemy brawlers (not leaping, not in `b.dash.hitSlots`) within `b.dash.hitRadius + BRAWLERS[target.brawlerId].radius`: applies `b.dash.damage`, grants `b.dash.superChargePerHit`, and records `target.slotIndex` in `b.dash.hitSlots`.
    - Clears `b.dash = null` when `elapsed >= duration`, on death, on respawn, or on Brawl Ball kickoff reset.
  - **Brawler separation, CC, and Brawl Ball edge cases** *(builder calls)*:
    - **Body separation (Step 1b):** Skip brawler-to-brawler separation when either brawler has `b.dash !== null` (same as `b.leap`), so Kage pierces cleanly through enemies at both 60 Hz Solo and 20 Hz Online and separates naturally once the dash ends.
    - **Knockback interruption:** Enemy knockback (e.g., Buck Super, Golem Meteor Slam) clears `b.dash = null` when displacing Kage; regular non-knockback damage does not interrupt the dash.
    - **Brawl Ball rules:** Existing `holdingBall` check in `MatchEngine.step` runs before `triggerAttack`, so firing while holding the ball kicks normally and never initiates a dash. If Kage touches a loose Brawl Ball mid-dash (`stepBrawlBall`), he picks it up and `b.dash` is immediately canceled so he never overshoots or dash-dribbles with the ball.
  - **Auto-aim:** Uses standard `cfg.attack.range` (`2.7`) so auto-aim snaps to enemies within dash reach and falls back to `b.facing` for mobility dashing.

### 5.3 Super — `Phantom Slash`
- **AttackSpec:**
  - `shape: 'line'`, `range: 9.2`, `spreadRad: 0.24`, `projectiles: 3`, `speed: 17.5`, `radius: 0.62`, `damage: 1250`, `piercing: true`, `passesWalls: true`, `lifestealRatio: 0.8`, `superChargePerHit: 25`.
  - All 3 slight-fan crescent sub-projectiles share a single `sharedHitSlots` array (same pattern as `lumi` in `fireSingleVolley`) so an enemy is hit at most once per Super cast while providing a generous, readable wave width (~1.8 tiles across).
- **Engine Mechanics (`shared/src/combat.ts`, `shared/src/match.ts`, `shared/src/types.ts`):**
  - Add optional `isDash?: boolean`, `dashDuration?: number`, `passesWalls?: boolean`, `lifestealRatio?: number` to `AttackSpec`.
  - Add `passesWalls: boolean` and `lifestealRatio: number` to `ProjectileState`.
  - Change `MatchEngine.applyDamage` and `CombatCallbacks.applyDamage` to return `number` (the **actual HP removed**, returning `0` if target is dead or `invulnTimer > 0`).
  - In `stepProjectiles`: skip wall collision check when `p.isHeal || p.passesWalls`.
  - On hitting an enemy when `p.lifestealRatio > 0 && owner && owner.alive`: compute `const actualDmg = callbacks.applyDamage(owner, target, dmg);` and if `actualDmg > 0`, call `callbacks.applyHeal(owner, owner, Math.round(actualDmg * p.lifestealRatio))`. Guarantees zero lifesteal against spawn-invulnerable shields and exact 80% heal on actual damage dealt (clamped to `maxHp`), while recording `healingDone` and emitting `'heal'` events/VFX/SFX.
- **Aim Telegraph (`client/src/render/vfx.ts`):**
  - Update `clipToWalls` condition to exclude `input.spec.passesWalls` so `Phantom Slash`'s golden telegraph renders through walls cleanly.
  - Primary `Shadow Dash` telegraph (`shape: 'line'`) remains wall-clipped so players accurately see where cover stops their lunge.

### 5.4 Networking & Client Prediction
- `shared/src/protocol.ts`:
  - Include `dash: b.dash ? { ...b.dash, hitSlots: [] } : null` in `serializeSnapshot` (matching `leap`).
- `client/src/net/onlineController.ts` *(builder call)*:
  - Track the latest server snapshot's `srvMe.dash` state directly (not delayed by the 75 ms remote-interpolation buffer) so online dashes feel crisp without the 75 ms post-dash freeze or choppy 20 Hz snaps:
    - While latest server `dash` is active, pause normal WASD walk prediction and advance `predX`/`predY` smoothly at 60 fps along `(dash.dirX, dash.dirY) * dash.speed` through `resolveCircleGridCollision`, reconciling gently toward `srvMe.x`/`srvMe.y` on each incoming 20 Hz snapshot.
    - Immediately resume normal local walk prediction as soon as the latest server snapshot clears `dash`.
- `worker/src/roomDo.ts`:
  - Include `'kage'` in bot brawler selection (`BRAWLER_LIST` rotation) so online bots naturally pick Kage too.

### 5.5 Bot AI (`shared/src/botAi.ts`)
- **Role & Spacing (Gem Grab):**
  - Kage is an aggressive flanker/assassin: ideal spacing factor `0.34` (closes distance like Golem, slightly tighter because of dash).
  - Never initiates `Shadow Dash` when no LOS to target unless dashing along clear ground to close distance; checks `findBlockingWallForCircle` and water walkability along the dash path (~1.8 tiles ahead) before firing so bots don't slam face-first into crates or lava trenches.
  - Holds 1 ammo when retreating at low HP unless finishing a low-HP target (`isFinisher`).
  - **Super (`Phantom Slash`)**: Casts when `superCharge >= 100` and a visible enemy is within `cfg.superAttack.range * 0.94` (even through walls, since `passesWalls: true`), prioritizing when Kage is below `75%` HP or enemy is a gem carrier / low-HP finisher.
- **Brawl Ball:**
  - Uses existing Brawl Ball AI (dribbles, kicks, tackles); when attacking enemies without the ball, respects dash walkability check so he doesn't dash into walls.

---

## 6. Visuals, 3D Model, Portrait & Audio (Approach A)

### 6.1 Blender 3D Model (`client/public/models/kage.glb`)
- Built and rigged in Blender 5.3 via MCP, matching existing brawler conventions (inspect `buck.glb` / `blaze.glb` in Blender first to match exact height, root scale, facing axis `+X`, armature structure, and action names).
- **Character Design:**
  - Stylized chunky Brawl Stars proportions (~1.5 units tall, feet grounded at `Y = 0`, facing `+X`).
  - Dark slate-teal shinobi hood & wrap tunic (`#1b3b4b` adjusted for 1.45 gamma), dark charcoal shin guards/boots, shadowed mask with glowing crimson eyes (`#ff2e63`), trailing crimson scarf tail behind neck, and a curved katana in right hand with subtle glowing crimson edge.
- **Rig & 5 NLA/Action Clips** (matching `brawlerMeshes.ts` substring lookup `idle`, `run`, `attack`, `victory`, `defeat`):
  - `Idle`: Alert shinobi stance with subtle breathing and blade poise.
  - `Run`: Forward ninja lean with pumping arms and katana trailed cleanly.
  - `Attack`: Fast horizontal katana slash arc.
  - `Victory`: Confident blade flourish + proud stance bounce.
  - `Defeat`: Slumped kneeling/defeated posture with blade lowered.
- **Verification:** Capture Blender viewport screenshots from front/side/3/4 angles to verify proportions, materials, and clean shading before exporting `.glb`.
- **Procedural Fallback (`client/src/render/brawlerMeshes.ts`):** Add `brawlerId === 'kage'` branch (hood, glowing crimson visor/eyes, trailing crimson scarf, curved katana) so headless tests and fallback environments render a distinct shinobi silhouette.

### 6.2 VFX & Projectile Visuals
- **`client/src/render/projectileMeshes.ts`:**
  - Handle `spec.brawlerId === 'kage'` for both `isSuper: false` and `isSuper: true` (multi-part `THREE.Group` with >=2 children):
    - `isSuper: true` (`Phantom Slash`): Large glowing crimson-and-indigo shadow crescent blade (`getCrescentBladeGeo()` outer shadow crescent + bright crimson core + trailing energy cone).
    - `isSuper: false` (for test/preview parity): Compact crimson-indigo katana slash crescent + spark trail.
- **`client/src/render/vfx.ts` & `arenaScene.ts`:**
  - On `ev.type === 'attack'` for `kage`:
    - Primary (`!ev.isSuper`): Spawn a crisp forward crimson-shadow slash burst / crescent trail particles along `ev.angle` (`spawnSlashBurst` or directional hit sparks + ring).
    - Super (`ev.isSuper`): Trigger standard super camera shake + shadow burst at cast point.
  - During `b.dash`: Apply forward tilt (`bodyGroup.rotation.z = -0.34`, stronger than tackle's `-0.28`) so the dash lunge reads viscerally in 3D.

### 6.3 Portrait & UI
- **Portrait (`client/public/portraits/kage.png`)** *(project convention)*: Render directly from `kage.glb` in Blender as a **`384x320` transparent-background RGBA PNG** matching `buck.png`–`lumi.png`, so `.brawler-portrait-stage` (`--p1`/`--p2` gradient) and `.brawler-avatar` (`drop-shadow`) in `client/src/styles.css` work out of the box with zero CSS changes.
- **UI (`client/src/ui/screens.ts`):** Replace hardcoded `Change Brawler (6)` with `Change Brawler (${BRAWLER_LIST.length})`. Verify `.brawler-grid` wraps 7 cards cleanly on desktop and mobile landscape.

### 6.4 Audio (`client/public/audio/sfx_kage.mp3` & `client/src/audio/sfx.ts`)
- Add `'kage'` to `SfxKey`, `SFX_URLS` (`/audio/sfx_kage.mp3`), and `SFX_GAIN` (`0.40`).
- Produce a crisp retro blade-slash/whoosh MP3 at `client/public/audio/sfx_kage.mp3` (synthesized cleanly via script + ffmpeg or sourced CC0 — update `client/public/audio/CREDITS.md` accurately to reflect its origin).

---

## 7. Verification Plan (High-Level)

- **Shared unit tests (`shared/tests/`):**
  - `Shadow Dash` advances position, pierces multiple enemies once each, charges Super, stops cleanly at walls and water without tunneling, and does not override Brawl Ball ball-kick.
  - `Phantom Slash` passes through solid and breakable walls, hits each enemy once across the 3-projectile wave, and heals Kage for `80%` of damage dealt (clamped to `maxHp`).
  - `BotController` controls Kage in Gem Grab and Brawl Ball without throwing or dashing into walls.
- **Client & Worker tests:**
  - `client/tests/projectile-meshes.test.ts`: Update manifest count (`22 -> 23`), verify `kage.glb` exists and `createProjectileVisual` passes for `kage` primary + Super.
  - `worker/tests/room-do.test.ts`: Verify `kage` pick, snapshot `dash` serialization, and online match tick cleanly.
- **Build & E2E:**
  - `npm test`, `npm run build`, and Playwright verification selecting Kage in the brawler drawer and running a live match with zero console/page errors.

---

## 8. Left to the Builder

- Exact Blender bone hierarchy, bone weights, and keyframe timing for `kage.glb` (must follow existing GLB root scale, `+X` facing, `Y = 0` ground contact, and clip names `Idle`/`Run`/`Attack`/`Victory`/`Defeat`).
- Exact particle count/timing for `Shadow Dash` slash trail VFX.
- Minor balance tweaks to slash hitbox width (`0.72`) or Super wave spread (`0.24`) if playtesting reveals feel issues.
- Choice of clean audio generation method for `sfx_kage.mp3` (provided it decodes cleanly in Web Audio and is accurately noted in `CREDITS.md`).
