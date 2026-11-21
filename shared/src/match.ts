import { BRAWLERS } from './brawlers';
import {
  destroyBreakableWallsInRadius,
  getTile,
  isTileBlockingProjectile,
  resolveCircleGridCollision,
  setTile,
} from './collision';
import {
  DAMAGE_REVEAL_DURATION,
  findAutoAimAngle,
  fireSingleVolley,
  stepHazards,
  stepProjectiles,
  triggerAttack,
} from './combat';
import {
  BRAWL_BALL_GOAL_MAX_X,
  BRAWL_BALL_GOAL_MIN_X,
  createGridCopy,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAPS,
  prepareBrawlBallGrid,
} from './maps';
import {
  BallState,
  BrawlerState,
  GameMode,
  MatchConfig,
  MatchEvent,
  MatchState,
  PlayerInput,
  Team,
  TileType,
} from './types';

export const GEM_FIRST_SPAWN = 3.0;
export const GEM_SPAWN_INTERVAL = 7.0;
export const GEM_MAX_TOTAL = 29;
export const GEM_PICKUP_RADIUS = 0.85;
export const GEM_WIN_THRESHOLD = 10;
export const GEM_COUNTDOWN_DURATION = 15.0;
export const MATCH_MAX_DURATION = 210.0;
export const BRAWL_BALL_MAX_DURATION = 150.0;
export const BRAWL_BALL_OVERTIME_DURATION = 60.0;
export const BRAWL_BALL_GOALS_TO_WIN = 2;
export const BRAWL_BALL_RESET_DURATION = 2.0;
export const BALL_RADIUS = 0.38;
export const BALL_KICK_SPEED = 15.0;
export const BALL_SUPER_KICK_SPEED = 23.0;
export const TACKLE_COOLDOWN = 3.2;
export const TACKLE_DURATION = 0.22;
export const TACKLE_SPEED = 11.2;
export const TACKLE_HIT_RADIUS = 1.25;
export const TACKLE_DAMAGE = 200;
export const TACKLE_KNOCKBACK = 1.25;
export const TACKLE_STEAL_LOCKOUT = 0.75;
export const SUDDEN_DEATH_DURATION = 30.0;
export const RESPAWN_DURATION = 4.0;
export const SPAWN_INVULN_DURATION = 2.5;
export const AUTO_HEAL_DELAY = 3.0;
export const AUTO_HEAL_RATIO = 0.13;

function createEmptyInput(): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    fire: false,
    superFire: false,
    autoAim: false,
  };
}

export class MatchEngine {
  public state: MatchState;
  private inputs: Map<number, PlayerInput> = new Map();
  private rngState: number;
  private pendingEvents: MatchEvent[] = [];

  constructor(config: MatchConfig) {
    const map = MAPS[config.mapId];
    const mode: GameMode = config.mode ?? 'gem-grab';
    this.rngState = (config.seed ?? 1337) >>> 0;

    const grid = createGridCopy(config.mapId);
    if (mode === 'brawl-ball') {
      prepareBrawlBallGrid(grid);
    }

    const getKickoffSpawn = (team: Team, idx: number) => {
      if (mode === 'brawl-ball') {
        const xs = [10.5, 6.5, 14.5];
        const y = team === 'blue' ? 23.5 : 9.5;
        return resolveCircleGridCollision(grid, { x: xs[idx % xs.length], y }, 0.45);
      }
      return team === 'blue'
        ? map.spawns.blue[idx % map.spawns.blue.length]
        : map.spawns.red[idx % map.spawns.red.length];
    };

    let blueIdx = 0;
    let redIdx = 0;
    const brawlers: BrawlerState[] = config.slots.map((slot) => {
      const cfg = BRAWLERS[slot.brawlerId];
      const spawn = getKickoffSpawn(slot.team, slot.team === 'blue' ? blueIdx++ : redIdx++);
      return {
        slotIndex: slot.slotIndex,
        team: slot.team,
        name: slot.name,
        isBot: slot.isBot,
        brawlerId: slot.brawlerId,
        skinId: slot.skinId ?? null,
        ringId: slot.ringId ?? null,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        facing: slot.team === 'blue' ? -Math.PI / 2 : Math.PI / 2,
        hp: cfg.maxHp,
        maxHp: cfg.maxHp,
        ammo: cfg.maxAmmo,
        attackCooldown: 0,
        superCharge: 0,
        gems: 0,
        alive: true,
        respawnTimer: 0,
        invulnTimer: 0,
        outOfCombatTimer: 0,
        healTickTimer: 0,
        revealedTimer: 0,
        recoilTimer: 0,
        tackleCooldown: 0,
        tackleTimer: 0,
        tackleDirX: 0,
        tackleDirY: 0,
        leap: null,
        burst: null,
        stats: {
          kills: 0,
          deaths: 0,
          damageDealt: 0,
          healingDone: 0,
          gemsCollected: 0,
        },
      };
    });

    const initialBall: BallState | null =
      mode === 'brawl-ball'
        ? {
            x: MAP_WIDTH / 2,
            y: MAP_HEIGHT / 2,
            vx: 0,
            vy: 0,
            holderSlot: null,
            lastTouchTeam: null,
            lastTouchSlot: null,
            isSuperKick: false,
            pickupCooldown: 0,
            kickCooldownSlot: null,
          }
        : null;

    this.state = {
      mapId: config.mapId,
      mode,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      grid,
      phase: 'playing',
      elapsed: 0,
      maxDuration: mode === 'brawl-ball' ? BRAWL_BALL_MAX_DURATION : MATCH_MAX_DURATION,
      suddenDeathRemaining: mode === 'brawl-ball' ? BRAWL_BALL_OVERTIME_DURATION : SUDDEN_DEATH_DURATION,
      gemSpawnTimer: GEM_FIRST_SPAWN,
      gemsSpawnedTotal: 0,
      maxGemsTotal: GEM_MAX_TOTAL,
      countdownTeam: null,
      countdownTimer: GEM_COUNTDOWN_DURATION,
      goalResetTimer: 0,
      lastGoalTeam: null,
      winner: null,
      starPlayerSlot: 0,
      brawlers,
      projectiles: [],
      hazards: [],
      gems: [],
      ball: initialBall,
      blueGems: 0,
      redGems: 0,
      nextEntityId: 1,
    };

    for (const b of brawlers) {
      this.inputs.set(b.slotIndex, createEmptyInput());
    }
  }

  private nextRand(): number {
    // Deterministic xorshift32
    let x = this.rngState || 1;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return (this.rngState % 10000) / 10000;
  }

  public setInput(slotIndex: number, input: PlayerInput): void {
    this.inputs.set(slotIndex, { ...input });
  }

  public applyDamage(attacker: BrawlerState | null, target: BrawlerState, amount: number): void {
    if (!target.alive || target.invulnTimer > 0 || amount <= 0) return;

    const actual = Math.min(target.hp, Math.round(amount));
    target.hp -= actual;
    target.outOfCombatTimer = 0;
    target.healTickTimer = 0;
    target.revealedTimer = Math.max(target.revealedTimer, DAMAGE_REVEAL_DURATION);

    if (attacker) {
      attacker.stats.damageDealt += actual;
    }

    this.pendingEvents.push({
      type: 'hit',
      targetSlot: target.slotIndex,
      attackerSlot: attacker ? attacker.slotIndex : -1,
      amount: actual,
      x: target.x,
      y: target.y,
    });

    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.respawnTimer = RESPAWN_DURATION;
      target.burst = null;
      target.leap = null;
      target.stats.deaths += 1;
      if (attacker) {
        attacker.stats.kills += 1;
      }

      // Drop ball if target was holding it in Brawl Ball
      if (this.state.ball && this.state.ball.holderSlot === target.slotIndex) {
        this.state.ball.holderSlot = null;
        this.state.ball.x = target.x;
        this.state.ball.y = target.y;
        this.state.ball.vx = (this.nextRand() - 0.5) * 3.0;
        this.state.ball.vy = (this.nextRand() - 0.5) * 3.0;
        this.state.ball.isSuperKick = false;
      }

      // Scatter carried gems around death position (Gem Grab)
      const dropCount = target.gems;
      target.gems = 0;
      for (let i = 0; i < dropCount; i++) {
        const ang = (i / Math.max(1, dropCount)) * Math.PI * 2 + this.nextRand() * 0.4;
        const dist = 0.65 + this.nextRand() * 0.9;
        const pos = resolveCircleGridCollision(
          this.state.grid,
          { x: target.x + Math.cos(ang) * dist, y: target.y + Math.sin(ang) * dist },
          0.3,
        );
        this.state.gems.push({
          id: this.state.nextEntityId++,
          x: pos.x,
          y: pos.y,
          startX: target.x,
          startY: target.y,
          popTimer: 0,
          popDuration: 0.35,
        });
      }

      this.pendingEvents.push({
        type: 'kill',
        victimSlot: target.slotIndex,
        killerSlot: attacker ? attacker.slotIndex : -1,
        x: target.x,
        y: target.y,
      });

      if (this.state.mode === 'gem-grab' && this.state.phase === 'sudden_death' && attacker) {
        this.finishMatch(attacker.team);
      }
    }
  }

  public applyHeal(healer: BrawlerState, target: BrawlerState, amount: number): void {
    if (!target.alive || amount <= 0) return;
    const missing = target.maxHp - target.hp;
    if (missing <= 0) return;
    const actual = Math.min(missing, Math.round(amount));
    target.hp += actual;
    healer.stats.healingDone += actual;
    this.pendingEvents.push({
      type: 'heal',
      targetSlot: target.slotIndex,
      amount: actual,
      x: target.x,
      y: target.y,
    });
  }

  private onSuperCharge = (shooter: BrawlerState, amount: number): void => {
    shooter.superCharge = Math.min(100, shooter.superCharge + amount);
  };

  private get callbacks() {
    return {
      applyDamage: (attacker: BrawlerState | null, target: BrawlerState, amount: number) =>
        this.applyDamage(attacker, target, amount),
      applyHeal: (healer: BrawlerState, target: BrawlerState, amount: number) =>
        this.applyHeal(healer, target, amount),
      onSuperCharge: this.onSuperCharge,
    };
  }

  public step(dt: number): MatchEvent[] {
    if (this.state.phase === 'ended') {
      const drained = this.pendingEvents;
      this.pendingEvents = [];
      return drained;
    }

    const events = this.pendingEvents;
    this.pendingEvents = [];

    // Goal celebration freeze before resetting kickoff in Brawl Ball
    if (this.state.mode === 'brawl-ball' && this.state.goalResetTimer > 0) {
      this.state.goalResetTimer = Math.max(0, this.state.goalResetTimer - dt);
      if (this.state.goalResetTimer <= 0) {
        this.resetBrawlBallKickoff();
      }
      return events;
    }

    this.state.elapsed += dt;
    const map = MAPS[this.state.mapId];

    // 1. Update brawlers
    for (const b of this.state.brawlers) {
      const cfg = BRAWLERS[b.brawlerId];
      if (!b.alive) {
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) {
          const teamSlots = this.state.brawlers.filter((x) => x.team === b.team);
          const idx = Math.max(0, teamSlots.findIndex((x) => x.slotIndex === b.slotIndex));
          const sp =
            b.team === 'blue'
              ? map.spawns.blue[idx % map.spawns.blue.length]
              : map.spawns.red[idx % map.spawns.red.length];
          b.x = sp.x;
          b.y = sp.y;
          b.vx = 0;
          b.vy = 0;
          b.hp = b.maxHp;
          b.ammo = cfg.maxAmmo;
          b.alive = true;
          b.respawnTimer = 0;
          b.invulnTimer = SPAWN_INVULN_DURATION;
          b.outOfCombatTimer = 0;
          b.healTickTimer = 0;
          b.revealedTimer = 0;
          b.tackleCooldown = 0;
          b.tackleTimer = 0;
          b.tackleDirX = 0;
          b.tackleDirY = 0;
          b.leap = null;
          b.burst = null;
        }
        continue;
      }

      if (b.invulnTimer > 0) b.invulnTimer = Math.max(0, b.invulnTimer - dt);
      if (b.revealedTimer > 0) b.revealedTimer = Math.max(0, b.revealedTimer - dt);
      if (b.recoilTimer > 0) b.recoilTimer = Math.max(0, b.recoilTimer - dt);
      if (b.attackCooldown > 0) b.attackCooldown = Math.max(0, b.attackCooldown - dt);
      if (b.tackleCooldown > 0) b.tackleCooldown = Math.max(0, b.tackleCooldown - dt);

      // Continuous 3-slot ammo reload
      if (b.ammo < cfg.maxAmmo) {
        b.ammo = Math.min(cfg.maxAmmo, b.ammo + dt / cfg.reloadTime);
      }

      // Out-of-combat auto-heal (13% max HP per second after 3.0s)
      b.outOfCombatTimer += dt;
      if (b.outOfCombatTimer >= AUTO_HEAL_DELAY && b.hp < b.maxHp) {
        b.healTickTimer += dt;
        while (b.healTickTimer >= 1.0 && b.hp < b.maxHp) {
          b.healTickTimer -= 1.0;
          const heal = Math.min(b.maxHp - b.hp, Math.round(b.maxHp * AUTO_HEAL_RATIO));
          b.hp += heal;
          events.push({ type: 'heal', targetSlot: b.slotIndex, amount: heal, x: b.x, y: b.y });
        }
      }

      // Active leap overrides movement/inputs
      if (b.leap) {
        b.leap.elapsed += dt;
        const t = Math.min(1, b.leap.elapsed / b.leap.duration);
        b.x = b.leap.startX + (b.leap.targetX - b.leap.startX) * t;
        b.y = b.leap.startY + (b.leap.targetY - b.leap.startY) * t;
        if (t >= 1) {
          const leap = b.leap;
          b.leap = null;
          if (leap.breaksWalls) {
            const broken = destroyBreakableWallsInRadius(
              this.state.grid,
              b.x,
              b.y,
              leap.onLandRadius,
            );
            if (broken.length > 0) events.push({ type: 'wall_break', tiles: broken });
          }
          if (leap.onLandDamage > 0) {
            for (const target of this.state.brawlers) {
              if (!target.alive || target.team === b.team || target.leap) continue;
              const dist = Math.hypot(target.x - b.x, target.y - b.y);
              if (dist <= leap.onLandRadius + BRAWLERS[target.brawlerId].radius) {
                this.applyDamage(b, target, leap.onLandDamage);
                this.onSuperCharge(b, leap.superChargePerHit);
                if (leap.onLandKnockback > 0 && target.alive && target.invulnTimer <= 0) {
                  const nx = dist > 0.01 ? (target.x - b.x) / dist : 1;
                  const ny = dist > 0.01 ? (target.y - b.y) / dist : 0;
                  const pushed = resolveCircleGridCollision(
                    this.state.grid,
                    {
                      x: target.x + nx * leap.onLandKnockback * 0.55,
                      y: target.y + ny * leap.onLandKnockback * 0.55,
                    },
                    BRAWLERS[target.brawlerId].radius,
                  );
                  target.x = pushed.x;
                  target.y = pushed.y;
                }
              }
            }
          }
        }
        continue;
      }

      // Process burst queue (Blaze rapid rounds / Golem triple punch)
      if (b.burst) {
        b.burst.timer -= dt;
        if (b.burst.timer <= 0) {
          const spec = b.burst.isSuper ? cfg.superAttack : cfg.attack;
          fireSingleVolley(
            this.state,
            b,
            spec,
            b.burst.angle,
            b.burst.isSuper,
            events,
            this.callbacks,
          );
          b.burst.remaining -= 1;
          if (b.burst.remaining <= 0) {
            b.burst = null;
          } else {
            b.burst.timer = b.burst.interval;
          }
        }
      }

      const inp = this.inputs.get(b.slotIndex) ?? createEmptyInput();
      const mLen = Math.hypot(inp.moveX, inp.moveY);
      const mx = mLen > 1 ? inp.moveX / mLen : inp.moveX;
      const my = mLen > 1 ? inp.moveY / mLen : inp.moveY;

      const holdingBall = Boolean(this.state.ball && this.state.ball.holderSlot === b.slotIndex);

      // Brawl Ball Tackle dash initiation (Shift / E on desktop, TACKLE button on touch)
      if (
        this.state.mode === 'brawl-ball' &&
        inp.tackle &&
        !holdingBall &&
        b.tackleCooldown <= 0 &&
        b.tackleTimer <= 0 &&
        !b.burst
      ) {
        const dashAngle = mLen > 0.15 ? Math.atan2(my, mx) : inp.aimAngle;
        b.tackleTimer = TACKLE_DURATION;
        b.tackleCooldown = TACKLE_COOLDOWN;
        b.tackleDirX = Math.cos(dashAngle);
        b.tackleDirY = Math.sin(dashAngle);
        b.facing = dashAngle;
        b.recoilTimer = 0.22;
        b.outOfCombatTimer = 0;
        b.healTickTimer = 0;
        events.push({
          type: 'tackle',
          slotIndex: b.slotIndex,
          targetSlot: null,
          stolen: false,
          x: b.x,
          y: b.y,
          angle: dashAngle,
        });
      }
      inp.tackle = false;

      if (b.tackleTimer > 0) {
        b.tackleTimer = Math.max(0, b.tackleTimer - dt);
        b.vx = b.tackleDirX * TACKLE_SPEED;
        b.vy = b.tackleDirY * TACKLE_SPEED;
        const dashPos = resolveCircleGridCollision(
          this.state.grid,
          { x: b.x + b.vx * dt, y: b.y + b.vy * dt },
          cfg.radius,
        );
        b.x = dashPos.x;
        b.y = dashPos.y;

        // Direct Steal check against enemy ball carrier during Tackle lunge!
        const ball = this.state.ball;
        if (ball && ball.holderSlot !== null) {
          const victim = this.state.brawlers[ball.holderSlot];
          if (victim && victim.alive && victim.team !== b.team && !victim.leap) {
            const distToVictim = Math.hypot(victim.x - b.x, victim.y - b.y);
            if (distToVictim <= TACKLE_HIT_RADIUS) {
              // Direct Steal: snap ball to tackler & knock victim away with pickup lockout
              ball.holderSlot = b.slotIndex;
              ball.lastTouchTeam = b.team;
              ball.lastTouchSlot = b.slotIndex;
              ball.isSuperKick = false;
              ball.kickCooldownSlot = victim.slotIndex;
              ball.pickupCooldown = TACKLE_STEAL_LOCKOUT;

              const kbAngle =
                distToVictim > 0.05
                  ? Math.atan2(victim.y - b.y, victim.x - b.x)
                  : Math.atan2(b.tackleDirY, b.tackleDirX);
              const pushed = resolveCircleGridCollision(
                this.state.grid,
                {
                  x: victim.x + Math.cos(kbAngle) * TACKLE_KNOCKBACK,
                  y: victim.y + Math.sin(kbAngle) * TACKLE_KNOCKBACK,
                },
                BRAWLERS[victim.brawlerId].radius,
              );
              victim.x = pushed.x;
              victim.y = pushed.y;
              victim.tackleTimer = 0;

              this.applyDamage(b, victim, TACKLE_DAMAGE);
              this.onSuperCharge(b, 8);
              b.tackleTimer = 0;
              events.push({
                type: 'tackle',
                slotIndex: b.slotIndex,
                targetSlot: victim.slotIndex,
                stolen: true,
                x: victim.x,
                y: victim.y,
                angle: b.facing,
              });
            }
          }
        }
        continue;
      }

      b.vx = mx * cfg.moveSpeed;
      b.vy = my * cfg.moveSpeed;
      const nextPos = resolveCircleGridCollision(
        this.state.grid,
        { x: b.x + b.vx * dt, y: b.y + b.vy * dt },
        cfg.radius,
      );
      b.x = nextPos.x;
      b.y = nextPos.y;

      if (mLen > 0.15 && !inp.fire && !inp.superFire && !b.burst) {
        b.facing = Math.atan2(my, mx);
      }

      // Handle Super or Primary fire — in Brawl Ball, firing while holding the ball KICKS it!
      if (inp.superFire) {
        if (holdingBall && b.superCharge >= 100 && !b.burst) {
          b.superCharge = 0;
          b.attackCooldown = cfg.attackCooldown;
          const aim = inp.autoAim ? (b.team === 'blue' ? -Math.PI / 2 : Math.PI / 2) : inp.aimAngle;
          this.kickBall(b, aim, true, events);
        } else if (!holdingBall && b.superCharge >= 100 && !b.burst) {
          b.superCharge = 0;
          b.attackCooldown = cfg.attackCooldown;
          const aim = inp.autoAim
            ? findAutoAimAngle(this.state, b, cfg.superAttack.range) ?? inp.aimAngle
            : inp.aimAngle;
          triggerAttack(this.state, b, aim, true, events, this.callbacks);
        }
        inp.superFire = false;
        inp.autoAim = false;
      } else if ((inp.fire || inp.autoAim) && b.ammo >= 1.0 && b.attackCooldown <= 0 && !b.burst) {
        if (holdingBall) {
          const aim = inp.autoAim ? (b.team === 'blue' ? -Math.PI / 2 : Math.PI / 2) : inp.aimAngle;
          b.ammo -= 1.0;
          b.attackCooldown = cfg.attackCooldown;
          this.kickBall(b, aim, false, events);
          inp.autoAim = false;
        } else {
          const autoAngle = inp.autoAim
            ? findAutoAimAngle(this.state, b, cfg.attack.range)
            : null;
          const aim = inp.autoAim ? (autoAngle ?? b.facing) : inp.aimAngle;
          b.ammo -= 1.0;
          b.attackCooldown = cfg.attackCooldown;
          triggerAttack(this.state, b, aim, false, events, this.callbacks);
          inp.autoAim = false;
        }
      }
    }

    // 1b. Soft brawler-to-brawler body separation so characters never overlap or "double hold" the ball
    const holderSlot = this.state.ball?.holderSlot ?? null;
    for (let i = 0; i < this.state.brawlers.length; i++) {
      const a = this.state.brawlers[i];
      if (!a.alive || a.leap) continue;
      const rA = BRAWLERS[a.brawlerId].radius;
      for (let j = i + 1; j < this.state.brawlers.length; j++) {
        const b = this.state.brawlers[j];
        if (!b.alive || b.leap) continue;
        const rB = BRAWLERS[b.brawlerId].radius;
        const minDist = rA + rB + 0.08;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dist > 0.001 ? dx / dist : Math.cos((i + j) * 1.7);
          const ny = dist > 0.001 ? dy / dist : Math.sin((i + j) * 1.7);
          // Give the ball holder priority so bots/teammates slide cleanly around them
          const weightA = a.slotIndex === holderSlot ? 0.15 : b.slotIndex === holderSlot ? 0.85 : 0.5;
          const weightB = 1 - weightA;
          const posA = resolveCircleGridCollision(
            this.state.grid,
            { x: a.x - nx * overlap * weightA, y: a.y - ny * overlap * weightA },
            rA,
          );
          const posB = resolveCircleGridCollision(
            this.state.grid,
            { x: b.x + nx * overlap * weightB, y: b.y + ny * overlap * weightB },
            rB,
          );
          a.x = posA.x;
          a.y = posA.y;
          b.x = posB.x;
          b.y = posB.y;
        }
      }
    }

    // 2. Step projectiles and hazards
    stepProjectiles(this.state, dt, events, this.callbacks);
    stepHazards(this.state, dt, events, this.callbacks);

    if (this.state.mode === 'brawl-ball') {
      this.stepBrawlBall(dt, events);
      return events;
    }

    // 3. Gem mine spawning (Gem Grab mode)
    if (this.state.gemsSpawnedTotal < this.state.maxGemsTotal) {
      this.state.gemSpawnTimer -= dt;
      if (this.state.gemSpawnTimer <= 0) {
        this.state.gemSpawnTimer += GEM_SPAWN_INTERVAL;
        this.state.gemsSpawnedTotal += 1;
        const ang = this.nextRand() * Math.PI * 2;
        const dist = 1.3 + this.nextRand() * 0.85;
        const pos = resolveCircleGridCollision(
          this.state.grid,
          {
            x: map.minePos.x + Math.cos(ang) * dist,
            y: map.minePos.y + Math.sin(ang) * dist,
          },
          0.3,
        );
        this.state.gems.push({
          id: this.state.nextEntityId++,
          x: pos.x,
          y: pos.y,
          startX: map.minePos.x,
          startY: map.minePos.y,
          popTimer: 0,
          popDuration: 0.45,
        });
        events.push({ type: 'gem_spawn', x: pos.x, y: pos.y });
      }
    }

    // 4. Gem pop animation & pickups
    const remainingGems = [];
    for (const g of this.state.gems) {
      if (g.popTimer < g.popDuration) {
        g.popTimer = Math.min(g.popDuration, g.popTimer + dt);
      }
      let pickedBy: BrawlerState | null = null;
      if (g.popTimer >= g.popDuration * 0.5) {
        for (const b of this.state.brawlers) {
          if (!b.alive || b.leap) continue;
          const d = Math.hypot(b.x - g.x, b.y - g.y);
          if (d <= GEM_PICKUP_RADIUS + BRAWLERS[b.brawlerId].radius * 0.4) {
            pickedBy = b;
            break;
          }
        }
      }
      if (pickedBy) {
        pickedBy.gems += 1;
        pickedBy.stats.gemsCollected += 1;
        events.push({ type: 'gem_pickup', slotIndex: pickedBy.slotIndex, x: g.x, y: g.y });
      } else {
        remainingGems.push(g);
      }
    }
    this.state.gems = remainingGems;

    // 5. Team gem tallies, countdown, and match end checks
    let blueGems = 0;
    let redGems = 0;
    for (const b of this.state.brawlers) {
      if (!b.alive) continue;
      if (b.team === 'blue') blueGems += b.gems;
      else redGems += b.gems;
    }
    this.state.blueGems = blueGems;
    this.state.redGems = redGems;

    if (this.state.phase === 'playing') {
      let leader: Team | null = null;
      if (blueGems >= GEM_WIN_THRESHOLD && blueGems > redGems) leader = 'blue';
      else if (redGems >= GEM_WIN_THRESHOLD && redGems > blueGems) leader = 'red';

      if (leader !== null) {
        if (this.state.countdownTeam !== leader) {
          this.state.countdownTeam = leader;
          this.state.countdownTimer = GEM_COUNTDOWN_DURATION;
          events.push({ type: 'countdown_start', team: leader });
        }
        this.state.countdownTimer -= dt;
        if (this.state.countdownTimer <= 0) {
          this.state.countdownTimer = 0;
          this.finishMatch(leader, events);
        }
      } else if (this.state.countdownTeam !== null) {
        this.state.countdownTeam = null;
        this.state.countdownTimer = GEM_COUNTDOWN_DURATION;
        events.push({ type: 'countdown_cancel' });
      }

      if (this.state.phase === 'playing' && this.state.elapsed >= this.state.maxDuration) {
        if (blueGems > redGems) {
          this.finishMatch('blue', events);
        } else if (redGems > blueGems) {
          this.finishMatch('red', events);
        } else {
          this.state.phase = 'sudden_death';
          this.state.suddenDeathRemaining = SUDDEN_DEATH_DURATION;
        }
      }
    } else if (this.state.phase === 'sudden_death') {
      if (blueGems > redGems) {
        this.finishMatch('blue', events);
      } else if (redGems > blueGems) {
        this.finishMatch('red', events);
      } else {
        this.state.suddenDeathRemaining -= dt;
        if (this.state.suddenDeathRemaining <= 0) {
          this.finishMatch('draw', events);
        }
      }
    }

    return events;
  }

  private kickBall(kicker: BrawlerState, angle: number, isSuper: boolean, events: MatchEvent[]): void {
    const ball = this.state.ball;
    if (!ball) return;
    const speed = isSuper ? BALL_SUPER_KICK_SPEED : BALL_KICK_SPEED;
    kicker.facing = angle;
    kicker.recoilTimer = 0.2;
    kicker.outOfCombatTimer = 0;
    kicker.healTickTimer = 0;
    ball.holderSlot = null;
    ball.x = kicker.x + Math.cos(angle) * 0.52;
    ball.y = kicker.y + Math.sin(angle) * 0.52;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    ball.lastTouchTeam = kicker.team;
    ball.lastTouchSlot = kicker.slotIndex;
    ball.isSuperKick = isSuper;
    ball.pickupCooldown = 0.28;
    ball.kickCooldownSlot = kicker.slotIndex;
    events.push({ type: 'ball_kick', slotIndex: kicker.slotIndex, isSuper, x: ball.x, y: ball.y });
  }

  private resetBrawlBallKickoff(): void {
    const xs = [10.5, 6.5, 14.5];
    let blueIdx = 0;
    let redIdx = 0;
    for (const b of this.state.brawlers) {
      const cfg = BRAWLERS[b.brawlerId];
      const idx = b.team === 'blue' ? blueIdx++ : redIdx++;
      const sp = resolveCircleGridCollision(
        this.state.grid,
        { x: xs[idx % xs.length], y: b.team === 'blue' ? 23.5 : 9.5 },
        0.45,
      );
      b.x = sp.x;
      b.y = sp.y;
      b.vx = 0;
      b.vy = 0;
      b.facing = b.team === 'blue' ? -Math.PI / 2 : Math.PI / 2;
      b.hp = b.maxHp;
      b.ammo = cfg.maxAmmo;
      b.alive = true;
      b.respawnTimer = 0;
      b.invulnTimer = 1.0;
      b.tackleCooldown = 0;
      b.tackleTimer = 0;
      b.tackleDirX = 0;
      b.tackleDirY = 0;
      b.leap = null;
      b.burst = null;
    }
    this.state.projectiles = [];
    this.state.hazards = [];
    this.state.lastGoalTeam = null;
    if (this.state.ball) {
      this.state.ball.x = MAP_WIDTH / 2;
      this.state.ball.y = MAP_HEIGHT / 2;
      this.state.ball.vx = 0;
      this.state.ball.vy = 0;
      this.state.ball.holderSlot = null;
      this.state.ball.isSuperKick = false;
      this.state.ball.pickupCooldown = 0;
      this.state.ball.kickCooldownSlot = null;
    }
  }

  private stepBrawlBall(dt: number, events: MatchEvent[]): void {
    const ball = this.state.ball;
    if (!ball) return;

    if (ball.pickupCooldown > 0) {
      ball.pickupCooldown = Math.max(0, ball.pickupCooldown - dt);
      if (ball.pickupCooldown <= 0) ball.kickCooldownSlot = null;
    }

    // 1. Dribbling holder carries the ball in front of facing direction (drops if dead or leaping)
    if (ball.holderSlot !== null) {
      const holder = this.state.brawlers[ball.holderSlot];
      if (!holder || !holder.alive || holder.leap) {
        ball.holderSlot = null;
        ball.isSuperKick = false;
      } else {
        ball.x = holder.x + Math.cos(holder.facing) * 0.56;
        ball.y = holder.y + Math.sin(holder.facing) * 0.56;
        ball.vx = holder.vx;
        ball.vy = holder.vy;
        ball.lastTouchTeam = holder.team;
        ball.lastTouchSlot = holder.slotIndex;
      }
    }

    // 2. Free ball physics (sub-stepped bouncing, Super-Kick wall smashing, ground friction)
    if (ball.holderSlot === null) {
      const subSteps = 3;
      const subDt = dt / subSteps;
      for (let s = 0; s < subSteps; s++) {
        const nextX = ball.x + ball.vx * subDt;
        const nextY = ball.y + ball.vy * subDt;

        // X collision check
        const txX = Math.floor(nextX + Math.sign(ball.vx || 1) * BALL_RADIUS);
        const tyX = Math.floor(ball.y);
        const tileX = getTile(this.state.grid, txX, tyX);
        if (isTileBlockingProjectile(tileX)) {
          if (ball.isSuperKick && tileX === TileType.WALL_BREAKABLE) {
            setTile(this.state.grid, txX, tyX, TileType.EMPTY);
            events.push({ type: 'wall_break', tiles: [{ tx: txX, ty: tyX }] });
            ball.x = nextX;
          } else {
            ball.vx = -ball.vx * 0.72;
          }
        } else {
          ball.x = nextX;
        }

        // Y collision check
        const txY = Math.floor(ball.x);
        const tyY = Math.floor(nextY + Math.sign(ball.vy || 1) * BALL_RADIUS);
        const tileY = getTile(this.state.grid, txY, tyY);
        if (isTileBlockingProjectile(tileY)) {
          if (ball.isSuperKick && tileY === TileType.WALL_BREAKABLE) {
            setTile(this.state.grid, txY, tyY, TileType.EMPTY);
            events.push({ type: 'wall_break', tiles: [{ tx: txY, ty: tyY }] });
            ball.y = nextY;
          } else {
            ball.vy = -ball.vy * 0.72;
          }
        } else {
          ball.y = nextY;
        }

        // Keep ball inside pitch bounds (allowing entry into open goal mouths!)
        ball.x = Math.max(1.0 + BALL_RADIUS, Math.min(MAP_WIDTH - 1.0 - BALL_RADIUS, ball.x));
        const inGoalX = ball.x >= BRAWL_BALL_GOAL_MIN_X && ball.x <= BRAWL_BALL_GOAL_MAX_X;
        if (!inGoalX) {
          if (ball.y < 1.0 + BALL_RADIUS) {
            ball.y = 1.0 + BALL_RADIUS;
            ball.vy = Math.abs(ball.vy) * 0.72;
          } else if (ball.y > MAP_HEIGHT - 1.0 - BALL_RADIUS) {
            ball.y = MAP_HEIGHT - 1.0 - BALL_RADIUS;
            ball.vy = -Math.abs(ball.vy) * 0.72;
          }
        } else {
          ball.y = Math.max(0.35, Math.min(MAP_HEIGHT - 0.35, ball.y));
        }

        // Pickup check by any alive non-leaping brawler
        for (const b of this.state.brawlers) {
          if (!b.alive || b.leap) continue;
          if (ball.kickCooldownSlot === b.slotIndex && ball.pickupCooldown > 0) continue;
          const dist = Math.hypot(b.x - ball.x, b.y - ball.y);
          if (dist <= BRAWLERS[b.brawlerId].radius + BALL_RADIUS + 0.14) {
            ball.holderSlot = b.slotIndex;
            ball.lastTouchTeam = b.team;
            ball.lastTouchSlot = b.slotIndex;
            ball.isSuperKick = false;
            ball.pickupCooldown = 0;
            ball.kickCooldownSlot = null;
            break;
          }
        }
        if (ball.holderSlot !== null) break;
      }

      // Smooth turf rolling friction
      const drag = Math.exp(-2.35 * dt);
      ball.vx *= drag;
      ball.vy *= drag;
      if (Math.hypot(ball.vx, ball.vy) < 4.5) {
        ball.isSuperKick = false;
      }
      if (Math.hypot(ball.vx, ball.vy) < 0.15) {
        ball.vx = 0;
        ball.vy = 0;
      }
    }

    // 3. Goal line detection (with anti-own-goal protection!)
    const inGoalX = ball.x >= BRAWL_BALL_GOAL_MIN_X + 0.15 && ball.x <= BRAWL_BALL_GOAL_MAX_X - 0.15;
    let scoredTeam: Team | null = null;

    if (inGoalX && ball.y <= 1.08) {
      // North (Red) Goal -> Blue scores!
      if (ball.lastTouchTeam === 'blue') {
        scoredTeam = 'blue';
      } else {
        // Prevent accidental Red own-goal: bounce cleanly off Red goal line
        ball.y = 1.25;
        ball.vy = Math.abs(ball.vy) * 0.5 + 1.5;
      }
    } else if (inGoalX && ball.y >= MAP_HEIGHT - 1.08) {
      // South (Blue) Goal -> Red scores!
      if (ball.lastTouchTeam === 'red') {
        scoredTeam = 'red';
      } else {
        // Prevent accidental Blue own-goal
        ball.y = MAP_HEIGHT - 1.25;
        ball.vy = -(Math.abs(ball.vy) * 0.5 + 1.5);
      }
    }

    if (scoredTeam) {
      if (scoredTeam === 'blue') this.state.blueGems += 1;
      else this.state.redGems += 1;

      const scorer =
        ball.lastTouchSlot !== null ? this.state.brawlers[ball.lastTouchSlot] : undefined;
      if (scorer && scorer.team === scoredTeam) {
        scorer.stats.gemsCollected += 1; // Tracks Goals Scored in Brawl Ball!
      }
      this.state.lastGoalTeam = scoredTeam;
      events.push({
        type: 'goal',
        team: scoredTeam,
        scorerSlot: scorer ? scorer.slotIndex : -1,
        blueScore: this.state.blueGems,
        redScore: this.state.redGems,
      });

      if (
        this.state.blueGems >= BRAWL_BALL_GOALS_TO_WIN ||
        this.state.redGems >= BRAWL_BALL_GOALS_TO_WIN ||
        this.state.phase === 'sudden_death'
      ) {
        this.finishMatch(scoredTeam, events);
      } else {
        this.state.goalResetTimer = BRAWL_BALL_RESET_DURATION;
        ball.holderSlot = null;
        ball.vx = 0;
        ball.vy = 0;
      }
      return;
    }

    // 4. Match timer & Overtime (smashes ALL breakable walls on pitch!)
    if (this.state.phase === 'playing' && this.state.elapsed >= this.state.maxDuration) {
      if (this.state.blueGems > this.state.redGems) {
        this.finishMatch('blue', events);
      } else if (this.state.redGems > this.state.blueGems) {
        this.finishMatch('red', events);
      } else {
        this.state.phase = 'sudden_death';
        this.state.suddenDeathRemaining = BRAWL_BALL_OVERTIME_DURATION;
        // Classic Brawl Ball Overtime: smash every breakable cover wall!
        const allBroken: Array<{ tx: number; ty: number }> = [];
        for (let ty = 1; ty < MAP_HEIGHT - 1; ty++) {
          for (let tx = 1; tx < MAP_WIDTH - 1; tx++) {
            if (getTile(this.state.grid, tx, ty) === TileType.WALL_BREAKABLE) {
              setTile(this.state.grid, tx, ty, TileType.EMPTY);
              allBroken.push({ tx, ty });
            }
          }
        }
        if (allBroken.length > 0) {
          events.push({ type: 'wall_break', tiles: allBroken });
        }
      }
    } else if (this.state.phase === 'sudden_death') {
      this.state.suddenDeathRemaining -= dt;
      if (this.state.suddenDeathRemaining <= 0) {
        this.finishMatch('draw', events);
      }
    }
  }

  private finishMatch(winner: Team | 'draw', events?: MatchEvent[]): void {
    this.state.phase = 'ended';
    this.state.winner = winner;
    this.state.starPlayerSlot = this.getStarPlayerSlot();
    const ev: MatchEvent = {
      type: 'match_end',
      winner,
      starPlayerSlot: this.state.starPlayerSlot,
    };
    if (events) events.push(ev);
    else this.pendingEvents.push(ev);
  }

  public getStarPlayerSlot(): number {
    let bestSlot = 0;
    let bestScore = -Infinity;
    for (const b of this.state.brawlers) {
      const winBonus = this.state.winner && this.state.winner === b.team ? 2.5 : 0;
      const score =
        b.stats.damageDealt * 0.002 +
        b.stats.kills * 2.5 +
        b.stats.gemsCollected * 1.2 +
        b.stats.healingDone * 0.0015 -
        b.stats.deaths * 0.8 +
        winBonus;
      if (score > bestScore) {
        bestScore = score;
        bestSlot = b.slotIndex;
      }
    }
    return bestSlot;
  }
}
