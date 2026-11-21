import { BRAWLERS } from './brawlers';
import { getTile, isTileBlockingProjectile } from './collision';
import { isBrawlerVisibleToTeam } from './combat';
import { MAPS } from './maps';
import { findNextWaypoint } from './pathfinding';
import { BrawlerState, MatchState, PlayerInput, Team, Vec2 } from './types';

interface BotMemory {
  waypoint: Vec2;
  pathTimer: number;
  strafeSign: number;
  strafeTimer: number;
}

function hasLineOfSight(grid: Uint8Array, from: Vec2, to: Vec2): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.45));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor(from.x + dx * t);
    const ty = Math.floor(from.y + dy * t);
    if (isTileBlockingProjectile(getTile(grid, tx, ty))) {
      return false;
    }
  }
  return true;
}

export class BotController {
  private memory: Map<number, BotMemory> = new Map();
  private carrierByTeam: Record<Team, number> = { blue: -1, red: -1 };
  private roleTimer = 0;

  private getMemory(slotIndex: number): BotMemory {
    let m = this.memory.get(slotIndex);
    if (!m) {
      m = {
        waypoint: { x: 10.5, y: 16.5 },
        pathTimer: 0,
        strafeSign: slotIndex % 2 === 0 ? 1 : -1,
        strafeTimer: 1.0,
      };
      this.memory.set(slotIndex, m);
    }
    return m;
  }

  private updateRoles(state: MatchState): void {
    for (const team of ['blue', 'red'] as Team[]) {
      const members = state.brawlers.filter((b) => b.team === team);
      let bestSlot = -1;
      let bestScore = -Infinity;
      for (const b of members) {
        const roleBonus = b.brawlerId === 'lumi' || b.brawlerId === 'golem' ? 1.5 : 0;
        const score = b.gems * 10 + (b.alive ? 2 : 0) + roleBonus + b.hp / 2500;
        if (score > bestScore) {
          bestScore = score;
          bestSlot = b.slotIndex;
        }
      }
      this.carrierByTeam[team] = bestSlot;
    }
  }

  public computeInputs(state: MatchState, dt: number): Map<number, PlayerInput> {
    this.roleTimer -= dt;
    if (this.roleTimer <= 0 || this.carrierByTeam.blue === -1) {
      this.roleTimer = 1.0;
      this.updateRoles(state);
    }

    const result = new Map<number, PlayerInput>();
    const map = MAPS[state.mapId];

    for (const bot of state.brawlers) {
      if (!bot.isBot) continue;

      if (!bot.alive || bot.leap) {
        result.set(bot.slotIndex, {
          moveX: 0,
          moveY: 0,
          aimAngle: bot.facing,
          fire: false,
          superFire: false,
          autoAim: false,
        });
        continue;
      }

      const mem = this.getMemory(bot.slotIndex);
      mem.pathTimer -= dt;
      mem.strafeTimer -= dt;
      if (mem.strafeTimer <= 0) {
        mem.strafeSign *= -1;
        mem.strafeTimer = 0.8 + ((bot.slotIndex * 17 + Math.floor(state.elapsed * 3)) % 7) * 0.15;
      }

      const cfg = BRAWLERS[bot.brawlerId];
      const homeY = bot.team === 'blue' ? 27.5 : 5.5;
      const midHoldY = bot.team === 'blue' ? 19.2 : 13.8;
      const isCarrier = this.carrierByTeam[bot.team] === bot.slotIndex;

      // Visible enemies only (strictly respects stealth bushes!)
      const visibleEnemies = state.brawlers.filter(
        (e) => e.team !== bot.team && e.alive && isBrawlerVisibleToTeam(state, e, bot.team),
      );

      // Pick highest priority combat target
      let targetEnemy: BrawlerState | null = null;
      let bestTargetScore = -Infinity;
      for (const e of visibleEnemies) {
        const dist = Math.hypot(e.x - bot.x, e.y - bot.y);
        const enemyCountdownBonus = state.countdownTeam && state.countdownTeam !== bot.team ? e.gems * 6 : e.gems * 2;
        const lowHpBonus = (1 - e.hp / e.maxHp) * 5;
        const score = enemyCountdownBonus + lowHpBonus - dist * 1.15;
        if (score > bestTargetScore) {
          bestTargetScore = score;
          targetEnemy = e;
        }
      }

      // Decide strategic destination
      const shouldRetreat =
        (isCarrier && (bot.gems >= 5 || state.countdownTeam === bot.team || bot.hp / bot.maxHp < 0.4)) ||
        (bot.gems >= 6 && bot.hp / bot.maxHp < 0.55) ||
        bot.hp / bot.maxHp < 0.25;

      let goal: Vec2;
      if (shouldRetreat) {
        const homeX = bot.slotIndex % 3 === 0 ? 10.5 : bot.slotIndex % 3 === 1 ? 7.5 : 13.5;
        goal = { x: homeX, y: homeY };
      } else {
        // Check loose gems on ground
        let nearestGem: Vec2 | null = null;
        let bestGemDist = isCarrier ? 18 : 5.5;
        for (const g of state.gems) {
          const d = Math.hypot(g.x - bot.x, g.y - bot.y);
          if (d < bestGemDist) {
            bestGemDist = d;
            nearestGem = { x: g.x, y: g.y };
          }
        }

        if (nearestGem) {
          goal = nearestGem;
        } else if (state.countdownTeam && state.countdownTeam !== bot.team && targetEnemy) {
          goal = { x: targetEnemy.x, y: targetEnemy.y };
        } else if (isCarrier) {
          goal = { x: map.minePos.x, y: midHoldY };
        } else if (targetEnemy) {
          // Approach to ideal attack distance
          const idealDist = cfg.attack.range * (bot.brawlerId === 'golem' ? 0.45 : 0.72);
          const dx = bot.x - targetEnemy.x;
          const dy = bot.y - targetEnemy.y;
          const d = Math.max(0.1, Math.hypot(dx, dy));
          goal = {
            x: Math.max(2, Math.min(state.width - 2, targetEnemy.x + (dx / d) * idealDist)),
            y: Math.max(2, Math.min(state.height - 2, targetEnemy.y + (dy / d) * idealDist)),
          };
        } else {
          // Hold flank lane
          const laneX = bot.slotIndex % 3 === 1 ? 5.5 : bot.slotIndex % 3 === 2 ? 15.5 : 10.5;
          goal = { x: laneX, y: midHoldY };
        }
      }

      if (mem.pathTimer <= 0 || Math.hypot(mem.waypoint.x - bot.x, mem.waypoint.y - bot.y) < 0.55) {
        mem.waypoint = findNextWaypoint(state.grid, { x: bot.x, y: bot.y }, goal);
        mem.pathTimer = 0.25;
      }

      let moveX = mem.waypoint.x - bot.x;
      let moveY = mem.waypoint.y - bot.y;
      const mLen = Math.hypot(moveX, moveY);
      if (mLen > 0.15) {
        moveX /= mLen;
        moveY /= mLen;
      } else {
        moveX = 0;
        moveY = 0;
      }

      // Add combat strafing when not retreating
      let aimAngle = mLen > 0.15 ? Math.atan2(moveY, moveX) : bot.facing;
      let fire = false;
      let superFire = false;

      // Lumi support Super: heal low-HP ally or self
      if (bot.brawlerId === 'lumi' && bot.superCharge >= 100) {
        const hurtAlly = state.brawlers.find(
          (a) =>
            a.team === bot.team &&
            a.alive &&
            a.hp / a.maxHp < 0.58 &&
            Math.hypot(a.x - bot.x, a.y - bot.y) <= cfg.superAttack.range,
        );
        if (hurtAlly) {
          aimAngle =
            hurtAlly.slotIndex === bot.slotIndex
              ? bot.facing
              : Math.atan2(hurtAlly.y - bot.y, hurtAlly.x - bot.x);
          superFire = true;
        }
      }

      if (!superFire && targetEnemy) {
        const dist = Math.hypot(targetEnemy.x - bot.x, targetEnemy.y - bot.y);
        // Light projectile lead
        const projSpeed = Math.max(6, cfg.attack.speed);
        const leadTime = Math.min(0.45, dist / projSpeed);
        const leadX = targetEnemy.x + targetEnemy.vx * leadTime * 0.65;
        const leadY = targetEnemy.y + targetEnemy.vy * leadTime * 0.65;
        aimAngle = Math.atan2(leadY - bot.y, leadX - bot.x);

        if (!shouldRetreat && dist <= cfg.attack.range * 1.15) {
          // Strafe perpendicular to enemy
          const sx = -Math.sin(aimAngle) * mem.strafeSign * 0.55;
          const sy = Math.cos(aimAngle) * mem.strafeSign * 0.55;
          moveX += sx;
          moveY += sy;
        }

        const canShootThrough = Boolean(cfg.attack.lobbed) || hasLineOfSight(state.grid, bot, targetEnemy);

        if (bot.superCharge >= 100 && dist <= cfg.superAttack.range * 0.92) {
          if (bot.brawlerId === 'vex') {
            // Vex escapes away from close threat
            if (dist < 4.5 || bot.hp / bot.maxHp < 0.45) {
              aimAngle = Math.atan2(homeY - bot.y, 10.5 - bot.x);
              superFire = true;
            }
          } else if (bot.brawlerId === 'golem' || bot.brawlerId === 'mort' || canShootThrough || cfg.superAttack.breaksWalls) {
            superFire = true;
          }
        }

        if (!superFire && bot.ammo >= 1.0 && dist <= cfg.attack.range * 0.96 && canShootThrough) {
          fire = true;
        }
      }

      const finalLen = Math.hypot(moveX, moveY);
      if (finalLen > 1) {
        moveX /= finalLen;
        moveY /= finalLen;
      }

      result.set(bot.slotIndex, {
        moveX,
        moveY,
        aimAngle,
        fire,
        superFire,
        autoAim: false,
      });
    }

    return result;
  }
}
