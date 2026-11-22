import { BRAWLERS } from './brawlers';
import {
  destroyBreakableWallsInRadius,
  findBlockingWallForCircle,
  isPointInBush,
  resolveCircleGridCollision,
} from './collision';
import {
  AttackSpec,
  BrawlerState,
  MatchEvent,
  MatchState,
  ProjectileState,
  Team,
} from './types';

export const BUSH_DETECT_RADIUS = 2.2;
export const ATTACK_REVEAL_DURATION = 1.2;
export const DAMAGE_REVEAL_DURATION = 0.6;

export function isBrawlerVisibleToTeam(
  state: MatchState,
  target: BrawlerState,
  viewerTeam: Team,
): boolean {
  if (!target.alive) return false;
  if (target.team === viewerTeam) return true;
  if (target.leap) return true;
  if (!isPointInBush(state.grid, target.x, target.y)) return true;
  if (target.revealedTimer > 0) return true;

  const rSq = BUSH_DETECT_RADIUS * BUSH_DETECT_RADIUS;
  for (const viewer of state.brawlers) {
    if (!viewer.alive || viewer.team !== viewerTeam) continue;
    const dx = viewer.x - target.x;
    const dy = viewer.y - target.y;
    if (dx * dx + dy * dy <= rSq) {
      return true;
    }
  }
  return false;
}

export function findAutoAimAngle(
  state: MatchState,
  shooter: BrawlerState,
  maxRange: number,
): number | null {
  const limitSq = (maxRange + 0.6) * (maxRange + 0.6);
  let bestDistSq = Infinity;
  let bestAngle: number | null = null;

  for (const target of state.brawlers) {
    if (target.team === shooter.team || !target.alive) continue;
    if (!isBrawlerVisibleToTeam(state, target, shooter.team)) continue;
    const dx = target.x - shooter.x;
    const dy = target.y - shooter.y;
    const dSq = dx * dx + dy * dy;
    if (dSq <= limitSq && dSq < bestDistSq) {
      bestDistSq = dSq;
      bestAngle = Math.atan2(dy, dx);
    }
  }

  return bestAngle;
}

export interface CombatCallbacks {
  applyDamage: (attacker: BrawlerState | null, target: BrawlerState, amount: number) => number;
  applyHeal: (healer: BrawlerState, target: BrawlerState, amount: number) => void;
  onSuperCharge: (shooter: BrawlerState, amount: number) => void;
}

export function fireSingleVolley(
  state: MatchState,
  shooter: BrawlerState,
  spec: AttackSpec,
  angle: number,
  isSuper: boolean,
  events: MatchEvent[],
  callbacks: CombatCallbacks,
  sharedHitSlots?: number[],
): void {
  const count = Math.max(1, spec.projectiles);

  // Lumi Super heals self immediately too
  if (spec.isHeal && spec.healAmount) {
    callbacks.applyHeal(shooter, shooter, spec.healAmount);
  }

  const shared =
    sharedHitSlots ??
    (shooter.brawlerId === 'lumi' || shooter.brawlerId === 'kage' ? [] : undefined);

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const shotAngle = angle + t * spec.spreadRad;
    const cos = Math.cos(shotAngle);
    const sin = Math.sin(shotAngle);

    if (spec.lobbed) {
      const distFactor = count === 1 ? 0.78 : 0.62 + (i % 3) * 0.14;
      const targetDist = Math.max(1.8, Math.min(spec.range, spec.range * distFactor));
      const tx = Math.max(1.3, Math.min(state.width - 1.3, shooter.x + cos * targetDist));
      const ty = Math.max(1.3, Math.min(state.height - 1.3, shooter.y + sin * targetDist));
      const dist = Math.hypot(tx - shooter.x, ty - shooter.y);
      const flightDuration = Math.max(0.32, dist / Math.max(1, spec.speed));

      const proj: ProjectileState = {
        id: state.nextEntityId++,
        ownerSlot: shooter.slotIndex,
        team: shooter.team,
        brawlerId: shooter.brawlerId,
        isSuper,
        x: shooter.x,
        y: shooter.y,
        startX: shooter.x,
        startY: shooter.y,
        vx: (tx - shooter.x) / flightDuration,
        vy: (ty - shooter.y) / flightDuration,
        radius: spec.radius,
        maxRange: dist,
        traveled: 0,
        damage: spec.damage,
        minDamage: spec.minDamage ?? spec.damage,
        piercing: true,
        lobbed: true,
        targetX: tx,
        targetY: ty,
        flightDuration,
        elapsed: 0,
        puddleDuration: spec.puddleDuration ?? 2.0,
        puddleRadius: spec.puddleRadius ?? 1.5,
        puddleDps: spec.puddleDps ?? 500,
        knockback: spec.knockback ?? 0,
        breaksWalls: Boolean(spec.breaksWalls),
        passesWalls: Boolean(spec.passesWalls),
        lifestealRatio: spec.lifestealRatio ?? 0,
        isHeal: false,
        healAmount: 0,
        superChargePerHit: spec.superChargePerHit,
        hitSlots: [],
      };
      state.projectiles.push(proj);
      continue;
    }

    const proj: ProjectileState = {
      id: state.nextEntityId++,
      ownerSlot: shooter.slotIndex,
      team: shooter.team,
      brawlerId: shooter.brawlerId,
      isSuper,
      x: shooter.x + cos * 0.35,
      y: shooter.y + sin * 0.35,
      startX: shooter.x,
      startY: shooter.y,
      vx: cos * spec.speed,
      vy: sin * spec.speed,
      radius: spec.radius,
      maxRange: spec.range,
      traveled: 0,
      damage: spec.damage,
      minDamage: spec.minDamage ?? spec.damage,
      piercing: Boolean(spec.piercing),
      lobbed: false,
      targetX: shooter.x + cos * spec.range,
      targetY: shooter.y + sin * spec.range,
      flightDuration: spec.range / Math.max(1, spec.speed),
      elapsed: 0,
      puddleDuration: 0,
      puddleRadius: 0,
      puddleDps: 0,
      knockback: spec.knockback ?? 0,
      breaksWalls: Boolean(spec.breaksWalls),
      passesWalls: Boolean(spec.passesWalls),
      lifestealRatio: spec.lifestealRatio ?? 0,
      isHeal: Boolean(spec.isHeal),
      healAmount: spec.healAmount ?? 0,
      superChargePerHit: spec.superChargePerHit,
      hitSlots: shared ?? [],
    };
    state.projectiles.push(proj);
  }
}

export function triggerAttack(
  state: MatchState,
  shooter: BrawlerState,
  angle: number,
  isSuper: boolean,
  events: MatchEvent[],
  callbacks: CombatCallbacks,
): void {
  const cfg = BRAWLERS[shooter.brawlerId];
  const spec = isSuper ? cfg.superAttack : cfg.attack;

  shooter.facing = angle;
  shooter.outOfCombatTimer = 0;
  shooter.revealedTimer = Math.max(shooter.revealedTimer, ATTACK_REVEAL_DURATION);
  shooter.recoilTimer = 0.22;

  events.push({
    type: 'attack',
    slotIndex: shooter.slotIndex,
    brawlerId: shooter.brawlerId,
    isSuper,
    x: shooter.x,
    y: shooter.y,
    angle,
  });

  if (spec.isDash) {
    shooter.dash = {
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      speed: spec.speed,
      elapsed: 0,
      duration: spec.dashDuration ?? 0.18,
      hitRadius: spec.radius,
      damage: spec.damage,
      superChargePerHit: spec.superChargePerHit,
      hitSlots: [],
    };
    return;
  }

  if (spec.isLeap) {
    // Drop bombs at takeoff if Vex
    if (spec.dropBombs && spec.dropBombs > 0) {
      for (let i = 0; i < spec.dropBombs; i++) {
        const ba = (i / spec.dropBombs) * Math.PI * 2;
        state.hazards.push({
          id: state.nextEntityId++,
          ownerSlot: shooter.slotIndex,
          team: shooter.team,
          brawlerId: shooter.brawlerId,
          kind: 'bomb',
          x: Math.max(1.4, Math.min(state.width - 1.4, shooter.x + Math.cos(ba) * 0.9)),
          y: Math.max(1.4, Math.min(state.height - 1.4, shooter.y + Math.sin(ba) * 0.9)),
          radius: spec.radius,
          remaining: 0.75,
          duration: 0.75,
          dps: 0,
          explodeDamage: spec.damage,
          breaksWalls: Boolean(spec.breaksWalls),
          superChargePerHit: spec.superChargePerHit,
          tickAccum: 0,
        });
      }
    }

    const dir = spec.leapBackwards ? angle + Math.PI : angle;
    const rawTx = shooter.x + Math.cos(dir) * spec.range * 0.85;
    const rawTy = shooter.y + Math.sin(dir) * spec.range * 0.85;
    const landed = resolveCircleGridCollision(state.grid, { x: rawTx, y: rawTy }, cfg.radius, false);

    shooter.leap = {
      startX: shooter.x,
      startY: shooter.y,
      targetX: landed.x,
      targetY: landed.y,
      elapsed: 0,
      duration: 0.65,
      height: 3.4,
      onLandDamage: spec.dropBombs ? 0 : spec.damage,
      onLandRadius: spec.dropBombs ? 0 : spec.radius,
      onLandKnockback: spec.knockback ?? 0,
      breaksWalls: !spec.dropBombs && Boolean(spec.breaksWalls),
      superChargePerHit: spec.superChargePerHit,
    };
    return;
  }

  if (spec.burstCount && spec.burstCount > 1) {
    fireSingleVolley(state, shooter, spec, angle, isSuper, events, callbacks);
    shooter.burst = {
      remaining: spec.burstCount - 1,
      timer: spec.burstInterval ?? 0.07,
      interval: spec.burstInterval ?? 0.07,
      angle,
      isSuper,
    };
    return;
  }

  fireSingleVolley(state, shooter, spec, angle, isSuper, events, callbacks);
}

export function stepProjectiles(
  state: MatchState,
  dt: number,
  events: MatchEvent[],
  callbacks: CombatCallbacks,
): void {
  const remaining: ProjectileState[] = [];

  for (const p of state.projectiles) {
    p.elapsed += dt;
    const owner = state.brawlers[p.ownerSlot] ?? null;

    if (p.lobbed) {
      const t = Math.min(1, p.elapsed / p.flightDuration);
      p.x = p.startX + (p.targetX - p.startX) * t;
      p.y = p.startY + (p.targetY - p.startY) * t;

      if (t >= 1) {
        // Impact splash + puddle spawn
        for (const target of state.brawlers) {
          if (!target.alive || target.team === p.team || target.leap) continue;
          const dist = Math.hypot(target.x - p.targetX, target.y - p.targetY);
          if (dist <= p.puddleRadius + BRAWLERS[target.brawlerId].radius) {
            callbacks.applyDamage(owner, target, p.damage);
            if (owner) callbacks.onSuperCharge(owner, p.superChargePerHit);
          }
        }
        state.hazards.push({
          id: state.nextEntityId++,
          ownerSlot: p.ownerSlot,
          team: p.team,
          brawlerId: p.brawlerId,
          kind: 'puddle',
          x: p.targetX,
          y: p.targetY,
          radius: p.puddleRadius,
          remaining: p.puddleDuration,
          duration: p.puddleDuration,
          dps: p.puddleDps,
          explodeDamage: 0,
          breaksWalls: false,
          superChargePerHit: Math.round(p.superChargePerHit * 0.4),
          tickAccum: 0,
        });
      } else {
        remaining.push(p);
      }
      continue;
    }

    // Straight projectile (fine-substepped circle-vs-wall check prevents tunneling or corner-squeezing!)
    const speed = Math.hypot(p.vx, p.vy);
    const stepDist = speed * dt;
    const substeps = Math.max(1, Math.ceil(stepDist / 0.14));
    const subDt = dt / substeps;
    const wallHitRadius = Math.max(0.14, Math.min(0.28, p.radius * 0.72));
    let alive = true;

    for (let s = 0; s < substeps && alive; s++) {
      p.x += p.vx * subDt;
      p.y += p.vy * subDt;
      p.traveled += speed * subDt;

      if (p.traveled >= p.maxRange) {
        alive = false;
        break;
      }

      // Heal waves and wall-piercing supers pass through walls; normal attacks collide cleanly with walls & diagonal corners
      if (!p.isHeal && !p.passesWalls) {
        const hitTile = findBlockingWallForCircle(state.grid, p.x, p.y, wallHitRadius);
        if (hitTile !== null) {
          if (p.breaksWalls) {
            const broken = destroyBreakableWallsInRadius(state.grid, p.x, p.y, p.radius + 0.55);
            if (broken.length > 0) {
              events.push({ type: 'wall_break', tiles: broken });
            }
            // Stop only on indestructible walls/mine
            if (hitTile !== 1) {
              alive = false;
              break;
            }
          } else {
            alive = false;
            break;
          }
        }
      }

      // Check brawler collisions
      for (const target of state.brawlers) {
        if (!target.alive || target.leap) continue;
        if (p.hitSlots.includes(target.slotIndex)) continue;

        if (p.isHeal) {
          if (target.team !== p.team || target.slotIndex === p.ownerSlot) continue;
          const rSum = p.radius + BRAWLERS[target.brawlerId].radius;
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          if (dx * dx + dy * dy <= rSum * rSum) {
            p.hitSlots.push(target.slotIndex);
            if (owner) callbacks.applyHeal(owner, target, p.healAmount);
          }
        } else {
          if (target.team === p.team) continue;
          const rSum = p.radius + BRAWLERS[target.brawlerId].radius;
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          if (dx * dx + dy * dy <= rSum * rSum) {
            p.hitSlots.push(target.slotIndex);
            const ratio = Math.min(1, p.traveled / Math.max(0.1, p.maxRange));
            const dmg = Math.round(p.minDamage + (p.damage - p.minDamage) * ratio);
            const actualDmg = callbacks.applyDamage(owner, target, dmg);
            if (owner) callbacks.onSuperCharge(owner, p.superChargePerHit);
            if (p.lifestealRatio > 0 && actualDmg > 0 && owner && owner.alive) {
              callbacks.applyHeal(owner, owner, Math.round(actualDmg * p.lifestealRatio));
            }

            if (p.knockback > 0 && target.alive && target.invulnTimer <= 0) {
              const len = Math.max(0.001, Math.hypot(p.vx, p.vy));
              const pushed = resolveCircleGridCollision(
                state.grid,
                {
                  x: target.x + (p.vx / len) * p.knockback * 0.45,
                  y: target.y + (p.vy / len) * p.knockback * 0.45,
                },
                BRAWLERS[target.brawlerId].radius,
              );
              target.x = pushed.x;
              target.y = pushed.y;
              target.dash = null;
            }

            if (!p.piercing) {
              alive = false;
              break;
            }
          }
        }
      }
    }

    if (alive) {
      remaining.push(p);
    }
  }

  state.projectiles = remaining;
}

export function stepHazards(
  state: MatchState,
  dt: number,
  events: MatchEvent[],
  callbacks: CombatCallbacks,
): void {
  const remaining = [];

  for (const h of state.hazards) {
    h.remaining -= dt;
    const owner = state.brawlers[h.ownerSlot] ?? null;

    if (h.kind === 'puddle') {
      h.tickAccum += dt;
      while (h.tickAccum >= 0.5) {
        h.tickAccum -= 0.5;
        const tickDmg = Math.round(h.dps * 0.5);
        for (const target of state.brawlers) {
          if (!target.alive || target.team === h.team || target.leap) continue;
          const dist = Math.hypot(target.x - h.x, target.y - h.y);
          if (dist <= h.radius + BRAWLERS[target.brawlerId].radius * 0.7) {
            callbacks.applyDamage(owner, target, tickDmg);
            if (owner) callbacks.onSuperCharge(owner, h.superChargePerHit);
          }
        }
      }
      if (h.remaining > 0) {
        remaining.push(h);
      }
    } else if (h.kind === 'bomb') {
      if (h.remaining <= 0) {
        if (h.breaksWalls) {
          const broken = destroyBreakableWallsInRadius(state.grid, h.x, h.y, h.radius);
          if (broken.length > 0) {
            events.push({ type: 'wall_break', tiles: broken });
          }
        }
        for (const target of state.brawlers) {
          if (!target.alive || target.team === h.team || target.leap) continue;
          const dist = Math.hypot(target.x - h.x, target.y - h.y);
          if (dist <= h.radius + BRAWLERS[target.brawlerId].radius) {
            callbacks.applyDamage(owner, target, h.explodeDamage);
            if (owner) callbacks.onSuperCharge(owner, h.superChargePerHit);
          }
        }
      } else {
        remaining.push(h);
      }
    }
  }

  state.hazards = remaining;
}
