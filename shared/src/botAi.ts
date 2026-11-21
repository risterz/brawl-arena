import { BRAWLERS } from './brawlers';
import { getTile, isTileBlockingMovement, isTileBlockingProjectile } from './collision';
import { isBrawlerVisibleToTeam } from './combat';
import { MAPS } from './maps';
import { findNextWaypoint } from './pathfinding';
import { BrawlerState, MatchState, PlayerInput, Team, TileType, Vec2 } from './types';

interface BotMemory {
  waypoint: Vec2;
  pathTimer: number;
  strafeSign: number;
  strafeTimer: number;
  lastCheckPos: Vec2;
  stuckTimer: number;
  unstuckDir: Vec2;
  unstuckTimer: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hasLineOfSight(grid: Uint8Array, from: Vec2, to: Vec2): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.42));
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

function hasBreakableWallBetween(grid: Uint8Array, from: Vec2, to: Vec2): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.45));
  let sawBreakable = false;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor(from.x + dx * t);
    const ty = Math.floor(from.y + dy * t);
    const tile = getTile(grid, tx, ty);
    if (tile === TileType.WALL_SOLID) return false;
    if (tile === TileType.WALL_BREAKABLE) sawBreakable = true;
  }
  return sawBreakable;
}

function isWalkablePoint(grid: Uint8Array, x: number, y: number): boolean {
  const tile = getTile(grid, Math.floor(x), Math.floor(y));
  return !isTileBlockingMovement(tile);
}

/**
 * Computes steering vector to dodge incoming enemy projectiles, enemy toxic puddles,
 * and enemy ticking bombs while respecting arena walls/water.
 */
function computeHazardAvoidance(state: MatchState, bot: BrawlerState): Vec2 {
  let ax = 0;
  let ay = 0;

  // 1. Avoid enemy toxic acid puddles & ticking bombs (e.g. Mort flasks, Vex Sky Drop)
  for (const h of state.hazards) {
    if (h.team === bot.team) continue;
    const dx = bot.x - h.x;
    const dy = bot.y - h.y;
    const dist = Math.hypot(dx, dy);
    const margin = h.kind === 'bomb' ? 1.35 : 1.15;
    const dangerR = h.radius + margin;
    if (dist < dangerR) {
      const weight = h.kind === 'bomb' ? 2.6 : 2.4;
      const strength = ((dangerR - dist) / dangerR) * weight;
      const nx = dist > 0.05 ? dx / dist : 1;
      const ny = dist > 0.05 ? dy / dist : 0;
      ax += nx * strength;
      ay += ny * strength;
    }
  }

  // 3. Actively sidestep fast incoming enemy projectiles
  const botRadius = BRAWLERS[bot.brawlerId].radius;
  for (const proj of state.projectiles) {
    if (proj.team === bot.team || proj.isHeal || proj.lobbed) continue;
    const speedSq = proj.vx * proj.vx + proj.vy * proj.vy;
    if (speedSq < 9) continue;

    const toBotX = bot.x - proj.x;
    const toBotY = bot.y - proj.y;
    const tClosest = (toBotX * proj.vx + toBotY * proj.vy) / speedSq;
    if (tClosest <= 0.01 || tClosest > 0.52) continue;

    const closestX = proj.x + proj.vx * tClosest;
    const closestY = proj.y + proj.vy * tClosest;
    const offX = bot.x - closestX;
    const offY = bot.y - closestY;
    const missDist = Math.hypot(offX, offY);
    const threatWidth = botRadius + proj.radius + 0.62;

    if (missDist < threatWidth) {
      const pSpeed = Math.sqrt(speedSq);
      const dirX = proj.vx / pSpeed;
      const dirY = proj.vy / pSpeed;
      // Pick perpendicular side away from projectile line (or walkable side if dead-center)
      let perpX = -dirY;
      let perpY = dirX;
      const sideDot = offX * perpX + offY * perpY;
      if (sideDot < -0.02) {
        perpX = -perpX;
        perpY = -perpY;
      } else if (Math.abs(sideDot) <= 0.02) {
        const leftOk = isWalkablePoint(state.grid, bot.x + perpX * 1.1, bot.y + perpY * 1.1);
        const rightOk = isWalkablePoint(state.grid, bot.x - perpX * 1.1, bot.y - perpY * 1.1);
        if (!leftOk && rightOk) {
          perpX = -perpX;
          perpY = -perpY;
        }
      }
      const urgency = (1 - tClosest / 0.52) * (1 - missDist / threatWidth) * 2.1;
      ax += perpX * urgency;
      ay += perpY * urgency;
    }
  }

  return { x: ax, y: ay };
}

/**
 * Predicts target intercept coordinates using two-step iterative ballistic lead.
 */
function predictIntercept(shooter: Vec2, target: BrawlerState, projSpeed: number, accuracy = 0.82): Vec2 {
  const speed = Math.max(6, projSpeed);
  let t = Math.min(0.65, Math.hypot(target.x - shooter.x, target.y - shooter.y) / speed);
  let px = target.x + target.vx * t * accuracy;
  let py = target.y + target.vy * t * accuracy;
  t = Math.min(0.65, Math.hypot(px - shooter.x, py - shooter.y) / speed);
  px = target.x + target.vx * t * accuracy;
  py = target.y + target.vy * t * accuracy;
  return { x: px, y: py };
}

/**
 * Finds a nearby bush tile to heal/ambush in safely, or returns null.
 */
function findNearestSafeBush(
  state: MatchState,
  bot: BrawlerState,
  enemies: BrawlerState[],
  maxDist: number,
): Vec2 | null {
  const bx = Math.floor(bot.x);
  const by = Math.floor(bot.y);
  const rad = Math.ceil(maxDist);
  let best: Vec2 | null = null;
  let bestScore = Infinity;

  for (let ty = Math.max(1, by - rad); ty <= Math.min(state.height - 2, by + rad); ty++) {
    for (let tx = Math.max(1, bx - rad); tx <= Math.min(state.width - 2, bx + rad); tx++) {
      if (getTile(state.grid, tx, ty) !== TileType.BUSH) continue;
      const cx = tx + 0.5;
      const cy = ty + 0.5;
      const d = Math.hypot(cx - bot.x, cy - bot.y);
      if (d > maxDist) continue;
      let tooCloseToEnemy = false;
      for (const e of enemies) {
        if (Math.hypot(cx - e.x, cy - e.y) < 3.6) {
          tooCloseToEnemy = true;
          break;
        }
      }
      if (tooCloseToEnemy) continue;
      const homeBias = bot.team === 'blue' ? (state.height - cy) * 0.15 : cy * 0.15;
      const score = d + homeBias;
      if (score < bestScore) {
        bestScore = score;
        best = { x: cx, y: cy };
      }
    }
  }
  return best;
}

export class BotController {
  private memory: Map<number, BotMemory> = new Map();
  private carrierByTeam: Record<Team, number> = { blue: -1, red: -1 };
  private roleTimer = 0;

  private getMemory(slotIndex: number, bot: BrawlerState): BotMemory {
    let m = this.memory.get(slotIndex);
    if (!m) {
      m = {
        waypoint: { x: 10.5, y: 16.5 },
        pathTimer: 0,
        strafeSign: slotIndex % 2 === 0 ? 1 : -1,
        strafeTimer: 1.0,
        lastCheckPos: { x: bot.x, y: bot.y },
        stuckTimer: 0,
        unstuckDir: { x: 0, y: 0 },
        unstuckTimer: 0,
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
        const roleBonus =
          b.brawlerId === 'lumi' ? 2.2 : b.brawlerId === 'golem' ? 1.4 : b.brawlerId === 'mort' ? 1.0 : 0;
        const score = b.gems * 10 + (b.alive ? 3 : 0) + roleBonus + (b.hp / b.maxHp) * 2.0;
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
      this.roleTimer = 0.8;
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

      const mem = this.getMemory(bot.slotIndex, bot);
      mem.pathTimer -= dt;
      mem.strafeTimer -= dt;
      if (mem.strafeTimer <= 0) {
        mem.strafeSign *= -1;
        mem.strafeTimer = 0.65 + ((bot.slotIndex * 17 + Math.floor(state.elapsed * 3)) % 7) * 0.14;
      }

      const cfg = BRAWLERS[bot.brawlerId];
      const hpRatio = bot.hp / bot.maxHp;
      const homeY = bot.team === 'blue' ? 28.0 : 5.0;
      const midHoldY = bot.team === 'blue' ? 19.2 : 13.8;
      const isCarrier = this.carrierByTeam[bot.team] === bot.slotIndex;
      const teamCarrier = state.brawlers.find(
        (a) => a.slotIndex === this.carrierByTeam[bot.team] && a.alive,
      );
      const allyCountdown = state.countdownTeam === bot.team;
      const enemyCountdown = Boolean(state.countdownTeam && state.countdownTeam !== bot.team);

      // Visible enemies only (strictly respects stealth bushes — zero cheating!)
      const visibleEnemies = state.brawlers.filter(
        (e) => e.team !== bot.team && e.alive && isBrawlerVisibleToTeam(state, e, bot.team),
      );

      // Rank combat targets: prioritize enemy gem carriers (especially in countdown), low HP finishers, and close threats
      let targetEnemy: BrawlerState | null = null;
      let bestTargetScore = -Infinity;
      let nearestEnemy: BrawlerState | null = null;
      let nearestEnemyDist = Infinity;

      for (const e of visibleEnemies) {
        const dist = Math.hypot(e.x - bot.x, e.y - bot.y);
        if (dist < nearestEnemyDist) {
          nearestEnemyDist = dist;
          nearestEnemy = e;
        }
        const gemWeight = enemyCountdown ? e.gems * 7.5 : e.gems * 2.4;
        const lowHpBonus = (1 - e.hp / e.maxHp) * 6.5;
        const killableBonus = e.hp <= cfg.attack.damage * 1.45 ? 5.5 : 0;
        const losBonus = cfg.attack.lobbed || hasLineOfSight(state.grid, bot, e) ? 2.8 : -2.5;
        // Prefer enemies threatening our gem carrier!
        const carrierThreatBonus =
          !isCarrier && teamCarrier && teamCarrier.gems >= 4 && Math.hypot(e.x - teamCarrier.x, e.y - teamCarrier.y) < 6.5
            ? 5.0
            : 0;
        const score = gemWeight + lowHpBonus + killableBonus + losBonus + carrierThreatBonus - dist * 1.05;
        if (score > bestTargetScore) {
          bestTargetScore = score;
          targetEnemy = e;
        }
      }

      // Retreat decision: protect gems or trigger passive 3s HP regen
      const urgentCountdownDefense = enemyCountdown && (!isCarrier || bot.gems < 4);
      const shouldRetreat =
        !urgentCountdownDefense &&
        ((isCarrier && (bot.gems >= 5 || allyCountdown || hpRatio < 0.42)) ||
          (bot.gems >= 6 && hpRatio < 0.58) ||
          hpRatio < 0.30);

      // Decide strategic destination
      let goal: Vec2;
      if (shouldRetreat) {
        const safeBush =
          hpRatio < 0.42 && !allyCountdown ? findNearestSafeBush(state, bot, visibleEnemies, 5.5) : null;
        if (safeBush && (bot.team === 'blue' ? safeBush.y > bot.y - 1.5 : safeBush.y < bot.y + 1.5)) {
          goal = safeBush;
        } else {
          const homeX = bot.slotIndex % 3 === 0 ? 10.5 : bot.slotIndex % 3 === 1 ? 7.2 : 13.8;
          goal = { x: homeX, y: homeY };
        }
      } else {
        // Evaluate loose gems on ground with threat awareness (skip suicide grabs!)
        let bestGem: Vec2 | null = null;
        let bestGemScore = isCarrier ? 17.5 : 6.8;
        for (const g of state.gems) {
          const d = Math.hypot(g.x - bot.x, g.y - bot.y);
          if (d > bestGemScore) continue;
          let threatPenalty = 0;
          for (const e of visibleEnemies) {
            const ed = Math.hypot(e.x - g.x, e.y - g.y);
            if (ed < 4.5) threatPenalty += (4.5 - ed) * (hpRatio < 0.55 ? 2.4 : 1.1);
          }
          // Ignore threat penalty slightly if grabbing stops enemy countdown!
          if (enemyCountdown) threatPenalty *= 0.35;
          const gScore = d + threatPenalty;
          if (gScore < bestGemScore) {
            bestGemScore = gScore;
            bestGem = { x: g.x, y: g.y };
          }
        }

        if (bestGem) {
          goal = bestGem;
        } else if (enemyCountdown && targetEnemy) {
          // Aggressive all-in hunt on enemy gem carrier during their countdown
          goal = { x: targetEnemy.x, y: targetEnemy.y };
        } else if (!isCarrier && teamCarrier && (allyCountdown || teamCarrier.gems >= 5)) {
          // Bodyguard / Escort positioning between our carrier and threats (or mid!)
          const guardTarget = nearestEnemy ?? { x: map.minePos.x, y: map.minePos.y };
          const gx = guardTarget.x - teamCarrier.x;
          const gy = guardTarget.y - teamCarrier.y;
          const gd = Math.max(0.1, Math.hypot(gx, gy));
          const offset = bot.brawlerId === 'lumi' ? 2.4 : 3.2;
          goal = {
            x: clamp(teamCarrier.x + (gx / gd) * offset, 2, state.width - 2),
            y: clamp(teamCarrier.y + (gy / gd) * offset, 2, state.height - 2),
          };
        } else if (bot.brawlerId === 'lumi' && !isCarrier && teamCarrier) {
          // Lumi shadows carrier / injured ally for team heals
          const hurtAlly = state.brawlers.find(
            (a) => a.team === bot.team && a.alive && a.slotIndex !== bot.slotIndex && a.hp / a.maxHp < 0.65,
          );
          const anchor = hurtAlly ?? teamCarrier;
          const backY = bot.team === 'blue' ? 2.2 : -2.2;
          goal = {
            x: clamp(anchor.x, 2, state.width - 2),
            y: clamp(anchor.y + backY, 2, state.height - 2),
          };
        } else if (isCarrier) {
          goal = { x: map.minePos.x, y: midHoldY };
        } else if (targetEnemy) {
          // Role-tuned ideal engagement spacing (snipers kite far, throwers keep safe arc, tanks rush in)
          const idealFactor =
            bot.brawlerId === 'golem'
              ? 0.42
              : bot.brawlerId === 'buck'
                ? 0.58
                : bot.brawlerId === 'vex'
                  ? 0.90
                  : bot.brawlerId === 'mort'
                    ? 0.82
                    : 0.75;
          const idealDist = cfg.attack.range * idealFactor;
          const dx = bot.x - targetEnemy.x;
          const dy = bot.y - targetEnemy.y;
          const d = Math.max(0.1, Math.hypot(dx, dy));
          goal = {
            x: clamp(targetEnemy.x + (dx / d) * idealDist, 2, state.width - 2),
            y: clamp(targetEnemy.y + (dy / d) * idealDist, 2, state.height - 2),
          };
        } else {
          // Spread across 3 tactical lanes
          const laneX = bot.slotIndex % 3 === 1 ? 5.2 : bot.slotIndex % 3 === 2 ? 15.8 : 10.5;
          goal = { x: laneX, y: midHoldY };
        }
      }

      // Compute BFS path waypoint
      if (mem.pathTimer <= 0 || Math.hypot(mem.waypoint.x - bot.x, mem.waypoint.y - bot.y) < 0.55) {
        mem.waypoint = findNextWaypoint(state.grid, { x: bot.x, y: bot.y }, goal);
        mem.pathTimer = 0.22;
      }

      let moveX = mem.waypoint.x - bot.x;
      let moveY = mem.waypoint.y - bot.y;
      const mLen = Math.hypot(moveX, moveY);
      if (mLen > 0.14) {
        moveX /= mLen;
        moveY /= mLen;
      } else {
        moveX = 0;
        moveY = 0;
      }

      // Active kiting for long-range squishes (Vex / Mort / Blaze) when rushed up close!
      if (!shouldRetreat && nearestEnemy) {
        const kiteTrigger =
          bot.brawlerId === 'vex' ? 6.2 : bot.brawlerId === 'mort' ? 4.4 : bot.brawlerId === 'blaze' ? 3.8 : 0;
        if (kiteTrigger > 0 && nearestEnemyDist < kiteTrigger) {
          const kx = bot.x - nearestEnemy.x;
          const ky = bot.y - nearestEnemy.y;
          const kd = Math.max(0.1, Math.hypot(kx, ky));
          const kiteWeight = bot.brawlerId === 'vex' ? 1.45 : 1.05;
          moveX = moveX * 0.35 + (kx / kd) * kiteWeight;
          moveY = moveY * 0.35 + (ky / kd) * kiteWeight;
        }
      }

      // Ally separation (prevents teammates clumping up and taking splash damage together)
      for (const ally of state.brawlers) {
        if (ally.team !== bot.team || ally.slotIndex === bot.slotIndex || !ally.alive) continue;
        const ax = bot.x - ally.x;
        const ay = bot.y - ally.y;
        const ad = Math.hypot(ax, ay);
        if (ad > 0.05 && ad < 2.2) {
          const push = ((2.2 - ad) / 2.2) * 0.55;
          moveX += (ax / ad) * push;
          moveY += (ay / ad) * push;
        }
      }

      // Active hazard avoidance (dodge enemy projectiles, acid puddles, and bombs!)
      const avoid = computeHazardAvoidance(state, bot);
      moveX += avoid.x;
      moveY += avoid.y;

      // Anti-stuck detector (if trying to move but blocked on corner, steer cleanly around)
      if (mem.unstuckTimer > 0) {
        mem.unstuckTimer -= dt;
        moveX += mem.unstuckDir.x * 1.1;
        moveY += mem.unstuckDir.y * 1.1;
      } else if (mLen > 0.35) {
        mem.stuckTimer += dt;
        if (mem.stuckTimer >= 0.55) {
          const moved = Math.hypot(bot.x - mem.lastCheckPos.x, bot.y - mem.lastCheckPos.y);
          mem.lastCheckPos = { x: bot.x, y: bot.y };
          mem.stuckTimer = 0;
          if (moved < 0.25) {
            mem.unstuckDir = { x: -moveY * mem.strafeSign, y: moveX * mem.strafeSign };
            mem.unstuckTimer = 0.38;
            mem.pathTimer = 0;
          }
        }
      } else {
        mem.stuckTimer = 0;
      }

      let aimAngle = mLen > 0.15 ? Math.atan2(moveY, moveX) : bot.facing;
      let fire = false;
      let superFire = false;

      // Lumi intelligent healing Super: save hurt carrier, self, or 2+ injured allies
      if (bot.brawlerId === 'lumi' && bot.superCharge >= 100) {
        const hurtAllies = state.brawlers.filter(
          (a) =>
            a.team === bot.team &&
            a.alive &&
            a.hp / a.maxHp < 0.68 &&
            Math.hypot(a.x - bot.x, a.y - bot.y) <= cfg.superAttack.range,
        );
        const criticalAlly = hurtAllies.find(
          (a) =>
            a.hp / a.maxHp < 0.50 ||
            (a.slotIndex === this.carrierByTeam[bot.team] && a.gems >= 4 && a.hp / a.maxHp < 0.65),
        );
        const chosen = criticalAlly ?? (hurtAllies.length >= 2 ? hurtAllies[0] : null);
        if (chosen) {
          aimAngle =
            chosen.slotIndex === bot.slotIndex
              ? bot.facing
              : Math.atan2(chosen.y - bot.y, chosen.x - bot.x);
          superFire = true;
        }
      }

      if (!superFire && targetEnemy) {
        const dist = Math.hypot(targetEnemy.x - bot.x, targetEnemy.y - bot.y);
        const leadAcc = bot.brawlerId === 'vex' || bot.brawlerId === 'blaze' ? 0.88 : 0.72;
        const leadPt = predictIntercept(bot, targetEnemy, cfg.attack.speed, leadAcc);
        aimAngle = Math.atan2(leadPt.y - bot.y, leadPt.x - bot.x);

        // Combat strafing perpendicular to enemy when engaging (not fleeing)
        if (!shouldRetreat && dist <= cfg.attack.range * 1.15) {
          const sx = -Math.sin(aimAngle) * mem.strafeSign * 0.52;
          const sy = Math.cos(aimAngle) * mem.strafeSign * 0.52;
          // Only strafe toward walkable tile
          if (isWalkablePoint(state.grid, bot.x + sx * 1.2, bot.y + sy * 1.2)) {
            moveX += sx;
            moveY += sy;
          } else {
            mem.strafeSign *= -1;
          }
        }

        const hasLos = hasLineOfSight(state.grid, bot, targetEnemy);
        const canShoot = Boolean(cfg.attack.lobbed) || hasLos;
        const canBreakWallAtEnemy = Boolean(cfg.superAttack.breaksWalls) && hasBreakableWallBetween(state.grid, bot, targetEnemy);

        // Smart Brawler-Specific Super Casting!
        if (bot.superCharge >= 100) {
          if (bot.brawlerId === 'vex') {
            // Vex Sky Drop: leap backwards toward home safety when threatened up close or low HP!
            if (nearestEnemyDist < 4.6 || (hpRatio < 0.44 && nearestEnemyDist < 7.5)) {
              // Note: Vex leaps BACKWARDS from aimAngle, so aim toward threat/opposite of home!
              const awayX = 10.5 - bot.x;
              const awayY = homeY - bot.y;
              aimAngle = Math.atan2(-awayY, -awayX);
              superFire = true;
            }
          } else if (bot.brawlerId === 'golem') {
            // Golem Meteor Slam: leap onto enemy carrier, clustered enemies, or low-HP target within range!
            if (dist <= cfg.superAttack.range * 0.94 && (dist >= 2.2 || targetEnemy.gems >= 3 || targetEnemy.hp < 2200)) {
              superFire = true;
            }
          } else if (bot.brawlerId === 'mort') {
            // Mort Acid Rain: blanket target enemy / carrier / cluster within lob range
            if (dist <= cfg.superAttack.range * 0.94) {
              superFire = true;
            }
          } else if (dist <= cfg.superAttack.range * 0.92 && (hasLos || canBreakWallAtEnemy)) {
            // Buck / Blaze: blast clear targets OR smash cover walls hiding enemies!
            if (bot.brawlerId === 'buck') {
              if (dist <= 5.2 || canBreakWallAtEnemy || targetEnemy.gems >= 4) {
                superFire = true;
              }
            } else {
              superFire = true;
            }
          }
        }

        // Smart Firing & Regen Conservation:
        // Hold fire while retreating at low HP so passive 3s HP regen triggers,
        // EXCEPT when an enemy is an immediate finisher or right in our face!
        const isFinisher = targetEnemy.hp <= cfg.attack.damage * 1.4;
        const selfDefenseClose = dist < 3.6;
        const holdForRegen = shouldRetreat && hpRatio < 0.38 && !isFinisher && !selfDefenseClose;

        // Ammo discipline: avoid spamming the last shot at low-percentage extreme range
        const sweetSpotRange = cfg.attack.range * (bot.brawlerId === 'buck' ? 0.78 : 0.86);
        const worthSpendingLastAmmo = dist <= sweetSpotRange || isFinisher || targetEnemy.gems >= 3 || enemyCountdown;
        const hasEnoughAmmo = bot.ammo >= (worthSpendingLastAmmo ? 1.0 : 1.75);

        if (!superFire && !holdForRegen && hasEnoughAmmo && dist <= cfg.attack.range * 0.97 && canShoot) {
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
