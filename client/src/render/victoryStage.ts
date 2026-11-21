import * as THREE from 'three';
import { BrawlerState, MatchState, Team } from '@brawl-arena/shared';
import { BrawlerVisual, createBrawlerMesh } from './brawlerMeshes';
import { getGemCrystalGeo } from './projectileMeshes';

export type MatchOutcome = 'victory' | 'defeat' | 'draw';

export interface PodiumMember {
  brawler: BrawlerState;
  position: 'left' | 'center' | 'right';
  isTeamMvp: boolean;
  isStarPlayer: boolean;
  isLocal: boolean;
}

export interface PodiumLineup {
  myTeam: Team;
  outcome: MatchOutcome;
  members: PodiumMember[];
  overallStarPlayer: BrawlerState | null;
}

export function scoreBrawlerPerformance(b: BrawlerState): number {
  return b.stats.kills * 3 + b.stats.gemsCollected * 2 + b.stats.damageDealt / 1500 - b.stats.deaths * 0.5;
}

/**
 * Computes the Brawl Stars 3-brawler results podium lineup:
 * - Always showcases the local player's 3-brawler team (celebrating on Victory, slumped on Defeat).
 * - Places the team's MVP (or the overall Star Player if on this team) right in the CENTER between
 *   the other two teammates.
 * - Preserves overall Star Player across both teams.
 */
export function computePodiumLineup(state: MatchState, localSlot: number): PodiumLineup {
  const local = state.brawlers[localSlot] ?? state.brawlers[0];
  const myTeam: Team = local ? local.team : 'blue';
  const outcome: MatchOutcome =
    state.winner === 'draw' ? 'draw' : state.winner === myTeam ? 'victory' : 'defeat';

  const overallStarPlayer =
    state.starPlayerSlot !== null
      ? (state.brawlers.find((b) => b.slotIndex === state.starPlayerSlot) ?? null)
      : null;

  const teammates = state.brawlers.filter((b) => b.team === myTeam);
  if (teammates.length === 0) {
    return { myTeam, outcome, members: [], overallStarPlayer };
  }

  // Pick center hero: if overall Star Player is on our team, they take center;
  // otherwise pick the highest-scoring teammate!
  const sorted = [...teammates].sort((a, b) => {
    if (a.slotIndex === state.starPlayerSlot) return -1;
    if (b.slotIndex === state.starPlayerSlot) return 1;
    const diff = scoreBrawlerPerformance(b) - scoreBrawlerPerformance(a);
    if (Math.abs(diff) > 0.0001) return diff;
    return a.slotIndex - b.slotIndex;
  });

  const center = sorted[0];
  const others = sorted.slice(1);
  const left = others[0];
  const right = others[1];

  const ordered: Array<{ brawler: BrawlerState; pos: 'left' | 'center' | 'right' }> = [];
  if (left) ordered.push({ brawler: left, pos: 'left' });
  ordered.push({ brawler: center, pos: 'center' });
  if (right) ordered.push({ brawler: right, pos: 'right' });

  return {
    myTeam,
    outcome,
    overallStarPlayer,
    members: ordered.map(({ brawler, pos }) => ({
      brawler,
      position: pos,
      isTeamMvp: brawler.slotIndex === center.slotIndex,
      isStarPlayer: brawler.slotIndex === state.starPlayerSlot,
      isLocal: brawler.slotIndex === localSlot,
    })),
  };
}

export interface ResultsStageHandle {
  group: THREE.Group;
  backgroundHex: string;
  update: (elapsed: number, dt: number, camera: THREE.PerspectiveCamera) => void;
}

function createResultsSkyTexture(outcome: MatchOutcome): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);

  if (outcome === 'victory') {
    grad.addColorStop(0.0, '#1458d6');
    grad.addColorStop(0.35, '#2794ff');
    grad.addColorStop(0.68, '#6ad8ff');
    grad.addColorStop(0.90, '#ffe999');
    grad.addColorStop(1.0, '#ffcb47');
  } else if (outcome === 'defeat') {
    grad.addColorStop(0.0, '#12152e');
    grad.addColorStop(0.40, '#22264d');
    grad.addColorStop(0.75, '#3a3261');
    grad.addColorStop(1.0, '#5a3a5c');
  } else {
    grad.addColorStop(0.0, '#28458a');
    grad.addColorStop(0.50, '#5680c9');
    grad.addColorStop(1.0, '#ffd485');
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVictorySunburstTexture(outcome: MatchOutcome): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;
  const rays = 18;
  ctx.clearRect(0, 0, 512, 512);

  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / (rays * 2);
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, 250);
    if (outcome === 'victory') {
      g.addColorStop(0.0, 'rgba(255, 240, 140, 0.72)');
      g.addColorStop(0.5, 'rgba(255, 210, 75, 0.30)');
      g.addColorStop(1.0, 'rgba(255, 210, 75, 0.0)');
    } else if (outcome === 'defeat') {
      g.addColorStop(0.0, 'rgba(130, 96, 196, 0.28)');
      g.addColorStop(0.6, 'rgba(82, 62, 138, 0.10)');
      g.addColorStop(1.0, 'rgba(82, 62, 138, 0.0)');
    } else {
      g.addColorStop(0.0, 'rgba(255, 232, 165, 0.48)');
      g.addColorStop(1.0, 'rgba(255, 232, 165, 0.0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 250, a0, a1);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStageFloorTexture(outcome: MatchOutcome): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const isWin = outcome === 'victory';
  const isDefeat = outcome === 'defeat';

  const c1 = isDefeat ? '#293059' : isWin ? '#4692eb' : '#4379bf';
  const c2 = isDefeat ? '#21274a' : isWin ? '#387fd4' : '#3768a8';
  const step = 64;
  for (let y = 0; y < 512; y += step) {
    for (let x = 0; x < 512; x += step) {
      ctx.fillStyle = ((x / step) + (y / step)) % 2 === 0 ? c1 : c2;
      ctx.fillRect(x, y, step, step);
      ctx.strokeStyle = 'rgba(8, 16, 40, 0.22)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, step - 3, step - 3);
    }
  }

  ctx.strokeStyle = isDefeat ? 'rgba(160, 130, 220, 0.24)' : 'rgba(255, 218, 86, 0.45)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(256, 256, 152, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCrownStarGeo(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.34 : 0.15;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/**
 * Builds the live 3D Brawl Stars-style Match Results Podium Stage with
 * 3 tiered pedestals, custom Victory/Defeat skeletal animations, camera swoop-in,
 * spotlights, golden MVP crown star, and 3D celebratory confetti.
 */
export function buildResultsStage(state: MatchState, localSlot: number): ResultsStageHandle {
  const lineup = computePodiumLineup(state, localSlot);
  const { outcome, members } = lineup;
  const group = new THREE.Group();
  const floorY = -0.35;

  // 1. Sky dome + rotating sunburst
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(48, 24, 16),
    new THREE.MeshBasicMaterial({ map: createResultsSkyTexture(outcome), side: THREE.BackSide, depthWrite: false }),
  );
  group.add(sky);

  const sunburst = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 26),
    new THREE.MeshBasicMaterial({
      map: createVictorySunburstTexture(outcome),
      transparent: true,
      opacity: outcome === 'victory' ? 0.95 : 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sunburst.position.set(0, 2.7, -15);
  group.add(sunburst);

  // 2. Stylized cartoon arena plaza floor
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48),
    new THREE.MeshLambertMaterial({ map: createStageFloorTexture(outcome) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  group.add(floor);

  // 3. Tiered Brawl Stars pedestals (auto-centers cleanly for 1, 2, or 3 players on a team!)
  const slotLayout: Record<'left' | 'center' | 'right', { x: number; y: number; z: number; yaw: number; scale: number; rad: number }> =
    members.length === 2
      ? {
          left:   { x: -1.32, y: 0.02, z: -0.15, yaw: 0.16,  scale: 1.22, rad: 1.20 },
          center: { x:  1.15, y: 0.24, z:  0.32, yaw: -0.14, scale: 1.36, rad: 1.38 },
          right:  { x:  2.25, y: 0.0,  z: -0.45, yaw: -0.24, scale: 1.18, rad: 1.15 },
        }
      : {
          left:   { x: -2.25, y: 0.0,  z: -0.45, yaw: 0.24,  scale: 1.18, rad: 1.15 },
          center: { x:  0.00, y: 0.26, z:  0.48, yaw: 0.0,   scale: 1.38, rad: 1.42 },
          right:  { x:  2.25, y: 0.0,  z: -0.45, yaw: -0.24, scale: 1.18, rad: 1.15 },
        };

  const brawlerEntries: Array<{
    visual: BrawlerVisual;
    baseY: number;
    phase: number;
    isCenter: boolean;
  }> = [];

  let mvpCrownStar: THREE.Mesh | null = null;
  let mvpSpot: THREE.Mesh | null = null;

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const cfg = slotLayout[m.position];
    const isCenter = m.position === 'center';
    const pedHeight = cfg.y - floorY;

    // Pedestal cylinder + glowing rim
    const pedMat = new THREE.MeshToonMaterial({
      color: isCenter ? (outcome === 'defeat' ? 0x3b3d75 : 0x2659b8) : outcome === 'defeat' ? 0x292d54 : 0x1e438a,
    });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(cfg.rad, cfg.rad * 1.16, pedHeight, 28), pedMat);
    ped.position.set(cfg.x, floorY + pedHeight / 2, cfg.z);
    group.add(ped);

    const rimColor = isCenter
      ? outcome === 'defeat'
        ? 0x9b84e8
        : 0xffd43b
      : m.brawler.team === 'blue'
        ? 0x4cc9ff
        : 0xff6b7a;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(cfg.rad + 0.02, isCenter ? 0.075 : 0.055, 10, 32),
      new THREE.MeshBasicMaterial({ color: rimColor }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(cfg.x, cfg.y + 0.01, cfg.z);
    group.add(rim);

    // Spawn animated rigged 3D brawler wearing equipped skin, facing the camera (+Z)
    const visual = createBrawlerMesh(m.brawler.brawlerId, m.brawler.team, m.isLocal, m.brawler.skinId, m.brawler.ringId);
    visual.root.position.set(cfg.x, cfg.y + 0.01, cfg.z);
    visual.root.scale.setScalar(cfg.scale);
    visual.bodyGroup.rotation.y = -Math.PI / 2 + cfg.yaw;
    visual.teamRing.visible = false;
    visual.superRing.visible = isCenter && outcome === 'victory';

    // Play baked Blender Victory / Defeat skeletal animation with staggered offset so team feels alive!
    const emote = outcome === 'victory' ? 'victory' : outcome === 'defeat' ? 'defeat' : 'none';
    visual.setEmote(emote, i * 0.28);
    group.add(visual.root);

    brawlerEntries.push({
      visual,
      baseY: cfg.y + 0.01,
      phase: i * 1.15,
      isCenter,
    });

    // Spotlight + spinning 3D Star Crown above Center MVP!
    if (isCenter) {
      mvpSpot = new THREE.Mesh(
        new THREE.ConeGeometry(2.1, 7.6, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: outcome === 'defeat' ? 0x7b78c9 : 0xffe985,
          transparent: true,
          opacity: outcome === 'victory' ? 0.14 : 0.08,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mvpSpot.position.set(cfg.x, cfg.y + 3.6, cfg.z);
      group.add(mvpSpot);

      if (outcome !== 'defeat') {
        mvpCrownStar = new THREE.Mesh(
          createCrownStarGeo(),
          new THREE.MeshToonMaterial({ color: 0xffdf42, emissive: 0x8a5800 }),
        );
        mvpCrownStar.position.set(cfg.x, cfg.y + 2.55, cfg.z);
        group.add(mvpCrownStar);
      }
    }
  }

  // 4. Celebratory 3D Confetti & Floating Gems (Victory) OR Drifting Gloomy Motes (Defeat)
  interface Particle {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    rx: number;
    ry: number;
  }
  const particles: Particle[] = [];
  const confettiColors = [0xffd43b, 0x38d9ff, 0xff5286, 0x45f07c, 0xc75cff, 0xffffff];
  const confettiGeo = new THREE.BoxGeometry(0.16, 0.025, 0.09);
  const gemGeo = getGemCrystalGeo();
  const count = outcome === 'victory' ? 68 : 26;

  for (let i = 0; i < count; i++) {
    const isGem = outcome === 'victory' && i % 9 === 0;
    const mat =
      outcome === 'victory'
        ? new THREE.MeshBasicMaterial({ color: confettiColors[i % confettiColors.length] })
        : new THREE.MeshBasicMaterial({
            color: i % 2 === 0 ? 0x7b89c4 : 0x525d94,
            transparent: true,
            opacity: 0.6,
          });
    const mesh = new THREE.Mesh(isGem ? gemGeo : confettiGeo, mat);
    if (isGem) mesh.scale.setScalar(0.55);
    mesh.position.set(
      (Math.random() - 0.5) * 10.5,
      Math.random() * 5.8 + 0.3,
      (Math.random() - 0.5) * 5.5 - 0.5,
    );
    group.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random() - 0.5) * (outcome === 'victory' ? 0.55 : 0.18),
      vy: -(outcome === 'victory' ? 0.9 + Math.random() * 1.1 : 0.45 + Math.random() * 0.45),
      vz: (Math.random() - 0.5) * 0.25,
      rx: (Math.random() - 0.5) * 5,
      ry: (Math.random() - 0.5) * 5,
    });
  }

  return {
    group,
    backgroundHex: outcome === 'victory' ? '#2c96ff' : outcome === 'defeat' ? '#1c2042' : '#446db5',
    update(elapsed: number, dt: number, camera: THREE.PerspectiveCamera) {
      sunburst.rotation.z = elapsed * (outcome === 'victory' ? 0.28 : 0.06);
      if (mvpSpot) {
        mvpSpot.rotation.y = elapsed * 0.4;
      }
      if (mvpCrownStar) {
        mvpCrownStar.rotation.y = elapsed * 2.2;
        mvpCrownStar.position.y = 2.82 + Math.sin(elapsed * 3.4) * 0.12;
      }

      // Update all 3 rigged brawlers' baked Victory/Defeat animations
      for (const entry of brawlerEntries) {
        entry.visual.updateAnimation(dt, false, false);
        if (entry.visual.superRing.visible) {
          entry.visual.superRing.rotation.z = elapsed * 2.2;
        }
        // Subtle procedural fallback bounce if a brawler lacks skeletal animations
        if (!entry.visual.hasAnimations) {
          entry.visual.bodyGroup.position.y =
            outcome === 'victory' ? Math.abs(Math.sin(elapsed * 4.2 + entry.phase)) * 0.22 : 0;
        }
      }

      // Animate falling confetti / defeat motes
      for (const p of particles) {
        p.mesh.position.x += (p.vx + Math.sin(elapsed * 2.5 + p.rx) * 0.2) * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.rx * dt;
        p.mesh.rotation.y += p.ry * dt;
        if (p.mesh.position.y < floorY) {
          p.mesh.position.y = 5.6 + Math.random() * 1.4;
          p.mesh.position.x = (Math.random() - 0.5) * 10.5;
        }
      }

      // Cinematic Brawl Stars swoop-in camera easing into dramatic hero 3-shot!
      const t = Math.min(1, elapsed / 1.05);
      const ease = 1 - Math.pow(1 - t, 3);
      const swayX = Math.sin(elapsed * 0.55) * 0.22 * ease;
      const camY = THREE.MathUtils.lerp(4.0, 2.35, ease);
      const camZ = THREE.MathUtils.lerp(11.6, 7.9, ease);
      camera.position.set(swayX, camY, camZ);
      camera.lookAt(0, 1.08, 0);
    },
  };
}
