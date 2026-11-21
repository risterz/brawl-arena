import { BRAWLERS } from './brawlers';
import {
  destroyBreakableWallsInRadius,
  resolveCircleGridCollision,
} from './collision';
import {
  DAMAGE_REVEAL_DURATION,
  findAutoAimAngle,
  fireSingleVolley,
  stepHazards,
  stepProjectiles,
  triggerAttack,
} from './combat';
import { createGridCopy, MAP_HEIGHT, MAP_WIDTH, MAPS } from './maps';
import {
  BrawlerState,
  MatchConfig,
  MatchEvent,
  MatchState,
  PlayerInput,
  Team,
} from './types';

export const GEM_FIRST_SPAWN = 3.0;
export const GEM_SPAWN_INTERVAL = 7.0;
export const GEM_MAX_TOTAL = 29;
export const GEM_PICKUP_RADIUS = 0.85;
export const GEM_WIN_THRESHOLD = 10;
export const GEM_COUNTDOWN_DURATION = 15.0;
export const MATCH_MAX_DURATION = 210.0;
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
    this.rngState = (config.seed ?? 1337) >>> 0;

    let blueIdx = 0;
    let redIdx = 0;
    const brawlers: BrawlerState[] = config.slots.map((slot) => {
      const cfg = BRAWLERS[slot.brawlerId];
      const spawn =
        slot.team === 'blue'
          ? map.spawns.blue[blueIdx++ % map.spawns.blue.length]
          : map.spawns.red[redIdx++ % map.spawns.red.length];
      return {
        slotIndex: slot.slotIndex,
        team: slot.team,
        name: slot.name,
        isBot: slot.isBot,
        brawlerId: slot.brawlerId,
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

    this.state = {
      mapId: config.mapId,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      grid: createGridCopy(config.mapId),
      phase: 'playing',
      elapsed: 0,
      maxDuration: MATCH_MAX_DURATION,
      suddenDeathRemaining: SUDDEN_DEATH_DURATION,
      gemSpawnTimer: GEM_FIRST_SPAWN,
      gemsSpawnedTotal: 0,
      maxGemsTotal: GEM_MAX_TOTAL,
      countdownTeam: null,
      countdownTimer: GEM_COUNTDOWN_DURATION,
      winner: null,
      starPlayerSlot: 0,
      brawlers,
      projectiles: [],
      hazards: [],
      gems: [],
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

      // Scatter carried gems around death position
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

      if (this.state.phase === 'sudden_death' && attacker) {
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
          b.leap = null;
          b.burst = null;
        }
        continue;
      }

      if (b.invulnTimer > 0) b.invulnTimer = Math.max(0, b.invulnTimer - dt);
      if (b.revealedTimer > 0) b.revealedTimer = Math.max(0, b.revealedTimer - dt);
      if (b.recoilTimer > 0) b.recoilTimer = Math.max(0, b.recoilTimer - dt);
      if (b.attackCooldown > 0) b.attackCooldown = Math.max(0, b.attackCooldown - dt);

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

      // Handle Super or Primary fire (Super input never falls through into primary ammo)
      if (inp.superFire) {
        if (b.superCharge >= 100 && !b.burst) {
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

    // 2. Step projectiles and hazards
    stepProjectiles(this.state, dt, events, this.callbacks);
    stepHazards(this.state, dt, events, this.callbacks);

    // 3. Gem mine spawning
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
