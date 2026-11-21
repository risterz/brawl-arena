import * as THREE from 'three';
import { MAP_HEIGHT, MAP_WIDTH, MapId } from '@brawl-arena/shared';
import { getGemCrystalGeo } from './projectileMeshes';

export interface PreviewStageHandle {
  group: THREE.Group;
  update: (clock: number, dt: number) => void;
}

export interface MatchSurroundHandle {
  group: THREE.Group;
  update: (clock: number, dt: number) => void;
}

function createSkyGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#1259d4');
  grad.addColorStop(0.32, '#1f84f7');
  grad.addColorStop(0.62, '#4cc4ff');
  grad.addColorStop(0.84, '#9eeeff');
  grad.addColorStop(1.0, '#ffe8a8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle cartoon halftone dots in upper sky for stylized arcade feel
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let y = 24; y < 260; y += 22) {
    const r = Math.max(1.5, 4.2 - y / 75);
    for (let x = (y % 44 === 0 ? 11 : 0); x < 512; x += 22) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSunburstTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;
  const rays = 16;

  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / (rays * 2);
    const rayGrad = ctx.createRadialGradient(cx, cy, 24, cx, cy, 252);
    rayGrad.addColorStop(0.0, 'rgba(255, 244, 180, 0.55)');
    rayGrad.addColorStop(0.45, 'rgba(138, 228, 255, 0.28)');
    rayGrad.addColorStop(1.0, 'rgba(138, 228, 255, 0.0)');
    ctx.fillStyle = rayGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 252, a0, a1);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLobbyFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Warm stylized cartoon arena courtyard paving
  ctx.fillStyle = '#3b82d6';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle checkerboard cartoon tiles
  const step = 64;
  for (let y = 0; y < 512; y += step) {
    for (let x = 0; x < 512; x += step) {
      const even = ((x / step) + (y / step)) % 2 === 0;
      ctx.fillStyle = even ? '#4b97eb' : '#3d86dc';
      ctx.fillRect(x, y, step, step);
      ctx.strokeStyle = 'rgba(16, 46, 102, 0.16)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, step - 3, step - 3);
    }
  }

  // Soft sunlit center plaza glow
  const glow = ctx.createRadialGradient(256, 256, 20, 256, 256, 240);
  glow.addColorStop(0.0, 'rgba(148, 232, 255, 0.42)');
  glow.addColorStop(0.55, 'rgba(72, 165, 255, 0.12)');
  glow.addColorStop(1.0, 'rgba(18, 56, 128, 0.38)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 512);

  // Painted cartoon arena rings on floor
  ctx.strokeStyle = 'rgba(255, 220, 96, 0.42)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(256, 256, 118, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.arc(256, 256, 178, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCartoonSurroundTexture(mapId: MapId): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (mapId === 'crystal-cavern') {
    // Warm stylized terracotta canyon floor outside the desert cavern arena
    ctx.fillStyle = '#b96942';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#a85b37';
    for (let y = 0; y < 256; y += 64) {
      for (let x = 0; x < 256; x += 64) {
        if (((x / 64) + (y / 64)) % 2 === 0) {
          ctx.fillRect(x, y, 64, 64);
        }
      }
    }
    // Cartoon stone cracks & pebbles
    ctx.fillStyle = 'rgba(72, 30, 18, 0.18)';
    for (let i = 0; i < 18; i++) {
      const px = (i * 53 + 19) % 240;
      const py = (i * 89 + 31) % 240;
      ctx.beginPath();
      ctx.ellipse(px, py, 10 + (i % 8), 6 + (i % 5), (i % 5) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Vibrant animated turquoise cartoon river water surrounding Twin Bridges!
    ctx.fillStyle = '#25a7e8';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#40c2ff';
    for (let y = 12; y < 256; y += 32) {
      for (let x = (y % 64 === 12 ? 8 : 40); x < 256; x += 72) {
        ctx.beginPath();
        ctx.roundRect(x, y, 42, 10, 5);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    for (let y = 24; y < 256; y += 48) {
      for (let x = (y % 96 === 24 ? 22 : 58); x < 256; x += 84) {
        ctx.beginPath();
        ctx.roundRect(x, y, 22, 4, 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 18);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStarGeo(outerR = 0.26, innerR = 0.12, depth = 0.08): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function createCartoonCloud(scale = 1): THREE.Group {
  const cloud = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2a5488, emissiveIntensity: 0.22 });
  const puffs: Array<[number, number, number, number]> = [
    [0, 0.18, 0, 0.62],
    [-0.58, 0.02, 0.05, 0.46],
    [0.56, 0.04, -0.04, 0.48],
    [-0.26, 0.34, 0.08, 0.44],
    [0.26, 0.30, -0.06, 0.40],
  ];
  for (const [x, y, z, r] of puffs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
    m.position.set(x, y, z);
    m.scale.set(1.15, 0.85, 0.85);
    cloud.add(m);
  }
  cloud.scale.setScalar(scale);
  return cloud;
}

function createCartoonBushProp(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const dark = new THREE.MeshToonMaterial({ color: 0x1ea355 });
  const light = new THREE.MeshToonMaterial({ color: 0x4ee07e });
  const puffs: Array<[number, number, number, number, boolean]> = [
    [0, 0.38, 0, 0.48, true],
    [-0.36, 0.28, 0.12, 0.36, false],
    [0.36, 0.28, -0.08, 0.38, false],
    [0.08, 0.56, 0.08, 0.32, true],
  ];
  for (const [x, y, z, r, isLight] of puffs) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), isLight ? light : dark);
    m.position.set(x, y, z);
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

function createCrystalCluster(colorHex: number, emissiveHex: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color: colorHex, emissive: emissiveHex });
  const gemGeo = getGemCrystalGeo();
  const shards: Array<[number, number, number, number, number, number]> = [
    [0, 0.48, 0, 1.35, 0.05, 0.04],
    [-0.26, 0.30, 0.14, 0.88, 0.34, 0.18],
    [0.24, 0.34, -0.10, 0.96, -0.30, -0.16],
    [0.06, 0.22, 0.26, 0.68, -0.14, 0.36],
  ];
  for (const [x, y, z, sc, rz, rx] of shards) {
    const m = new THREE.Mesh(gemGeo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(sc);
    m.rotation.set(rx, x * 2, rz);
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

/**
 * Builds the lively Brawl Stars-style animated cartoon lobby stage:
 * sky dome, spinning comic sunburst, stylized courtyard floor, multi-tier hero podium,
 * desert canyon mesas, drifting clouds, swaying bushes, and floating gems/stars.
 */
export function buildAnimatedPreviewStage(): PreviewStageHandle {
  const group = new THREE.Group();

  // 1. Vibrant cartoon sky dome
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(48, 24, 16),
    new THREE.MeshBasicMaterial({ map: createSkyGradientTexture(), side: THREE.BackSide, depthWrite: false }),
  );
  group.add(skyDome);

  // 2. Rotating comic sunburst disc behind the brawler
  const sunburst = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshBasicMaterial({
      map: createSunburstTexture(),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sunburst.position.set(0, 2.5, -16);
  group.add(sunburst);

  // 3. Stylized cartoon arena courtyard floor beneath podium
  const floorY = -0.46;
  const courtyard = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48),
    new THREE.MeshLambertMaterial({ map: createLobbyFloorTexture() }),
  );
  courtyard.rotation.x = -Math.PI / 2;
  courtyard.position.y = floorY;
  group.add(courtyard);

  // Outer cartoon grass/canyon turf apron around courtyard edge
  const turfRing = new THREE.Mesh(
    new THREE.RingGeometry(11.5, 44, 48),
    new THREE.MeshLambertMaterial({ color: 0x3ec66b }),
  );
  turfRing.rotation.x = -Math.PI / 2;
  turfRing.position.y = floorY - 0.02;
  group.add(turfRing);

  // 4. Upgraded Multi-Tier Hero Podium + Counter-Rotating Energy Rings + Stage Glow
  const baseTier = new THREE.Mesh(
    new THREE.CylinderGeometry(2.15, 2.48, 0.24, 32),
    new THREE.MeshToonMaterial({ color: 0x19366e }),
  );
  baseTier.position.y = -0.35;
  group.add(baseTier);

  const mainPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.62, 1.88, 0.34, 32),
    new THREE.MeshToonMaterial({ color: 0x2656a8 }),
  );
  mainPedestal.position.y = -0.17;
  group.add(mainPedestal);

  const goldRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.64, 0.085, 10, 36),
    new THREE.MeshBasicMaterial({ color: 0xffd43b }),
  );
  goldRim.rotation.x = Math.PI / 2;
  goldRim.position.y = 0.01;
  group.add(goldRim);

  const outerHoloRing = new THREE.Mesh(
    new THREE.RingGeometry(2.38, 2.54, 40),
    new THREE.MeshBasicMaterial({
      color: 0x56ecff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  outerHoloRing.rotation.x = -Math.PI / 2;
  outerHoloRing.position.y = floorY + 0.02;
  group.add(outerHoloRing);

  // 8 glowing golden stage bumper studs around podium base
  const studMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const stud = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), studMat);
    stud.position.set(Math.cos(ang) * 2.15, -0.22, Math.sin(ang) * 2.15);
    group.add(stud);
  }

  // Soft stage spotlight beam cone shining gently onto the brawler
  const spotCone = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 7.2, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9be8ff,
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  spotCone.position.set(0, 3.4, 0);
  group.add(spotCone);

  // 5. Stylized Cartoon Canyon Mesas / Rolling Hills framing the horizon
  const mesaColors = [0xd98048, 0xc86b3a, 0xe89b5a, 0x3eb868, 0x2ea059];
  const mesaSpecs: Array<[number, number, number, number, number, number]> = [
    [-11.5, -13.0, 2.8, 3.6, 4.4, 0],
    [-6.8, -14.8, 2.2, 2.9, 3.4, 2],
    [7.2, -14.5, 2.5, 3.2, 3.9, 1],
    [11.8, -12.6, 3.0, 3.8, 4.8, 0],
    [-9.2, -9.8, 1.5, 2.1, 1.8, 3],
    [9.4, -9.6, 1.6, 2.2, 2.0, 4],
  ];
  for (const [x, z, rTop, rBot, h, ci] of mesaSpecs) {
    const mesa = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, h, 8),
      new THREE.MeshToonMaterial({ color: mesaColors[ci] }),
    );
    mesa.position.set(x, floorY + h / 2 - 0.1, z);
    mesa.rotation.y = x * 0.3;
    group.add(mesa);
    // Warm sunlit cap on desert mesas
    if (ci <= 2) {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop * 0.96, rTop * 1.03, 0.32, 8),
        new THREE.MeshToonMaterial({ color: 0xf4bc72 }),
      );
      cap.position.set(x, floorY + h - 0.08, z);
      cap.rotation.y = x * 0.3;
      group.add(cap);
    }
  }

  // 6. Flanking cartoon crystal clusters & swaying bushes (cleanly framing brawler)
  const swayBushes: Array<{ obj: THREE.Object3D; phase: number }> = [];
  const bushPositions: Array<[number, number, number]> = [
    [-4.4, -3.4, 1.05],
    [-5.6, -5.2, 1.35],
    [4.6, -3.6, 1.08],
    [5.8, -5.4, 1.3],
    [-3.1, -6.8, 0.95],
    [3.3, -6.9, 0.98],
  ];
  for (let i = 0; i < bushPositions.length; i++) {
    const [bx, bz, sc] = bushPositions[i];
    const bush = createCartoonBushProp(sc);
    bush.position.set(bx, floorY, bz);
    group.add(bush);
    swayBushes.push({ obj: bush, phase: i * 1.1 });
  }

  const crystalLeft = createCrystalCluster(0xd654ff, 0x5c0ea8, 1.25);
  crystalLeft.position.set(-4.0, floorY, -5.0);
  group.add(crystalLeft);

  const crystalRight = createCrystalCluster(0x3ce8ff, 0x0b6699, 1.15);
  crystalRight.position.set(4.1, floorY, -5.2);
  group.add(crystalRight);

  // 7. Animated Drifting Cartoon Clouds across sky
  const clouds: Array<{ obj: THREE.Group; speed: number; baseY: number; phase: number }> = [];
  const cloudSpecs: Array<[number, number, number, number, number]> = [
    [-9.5, 5.2, -13.5, 1.35, 0.42],
    [-2.5, 6.2, -15.0, 1.55, 0.32],
    [5.8, 5.5, -14.2, 1.25, 0.38],
    [12.0, 4.6, -12.8, 1.15, 0.46],
    [-14.0, 4.3, -12.0, 1.10, 0.50],
  ];
  for (let i = 0; i < cloudSpecs.length; i++) {
    const [cx, cy, cz, sc, speed] = cloudSpecs[i];
    const cloud = createCartoonCloud(sc);
    cloud.position.set(cx, cy, cz);
    group.add(cloud);
    clouds.push({ obj: cloud, speed, baseY: cy, phase: i * 1.4 });
  }

  // 8. Floating bobbing cartoon Gems & Golden Stars orbiting softly behind stage!
  const floaters: Array<{ obj: THREE.Mesh; baseY: number; amp: number; speed: number; phase: number }> = [];
  const starGeo = createStarGeo(0.24, 0.11, 0.08);
  const gemGeo = getGemCrystalGeo();
  const starMat = new THREE.MeshToonMaterial({ color: 0xffdf42, emissive: 0x6b4700 });
  const gemMat = new THREE.MeshToonMaterial({ color: 0xe66bff, emissive: 0x6e00bd });

  const floaterSpecs: Array<[number, number, number, boolean, number]> = [
    [-3.1, 1.9, -2.8, false, 1.0],
    [3.2, 2.2, -3.0, true, 0.95],
    [-4.8, 3.0, -5.8, true, 1.15],
    [4.9, 2.7, -5.6, false, 1.1],
    [-2.0, 3.5, -6.5, true, 0.85],
    [2.3, 3.4, -6.8, false, 0.9],
  ];
  for (let i = 0; i < floaterSpecs.length; i++) {
    const [fx, fy, fz, isStar, sc] = floaterSpecs[i];
    const m = new THREE.Mesh(isStar ? starGeo : gemGeo, isStar ? starMat : gemMat);
    m.position.set(fx, fy, fz);
    m.scale.setScalar(sc);
    group.add(m);
    floaters.push({ obj: m, baseY: fy, amp: 0.22, speed: 1.6 + (i % 3) * 0.35, phase: i * 1.15 });
  }

  return {
    group,
    update(clock: number, dt: number) {
      sunburst.rotation.z = clock * 0.14;
      outerHoloRing.scale.setScalar(1 + Math.sin(clock * 2.4) * 0.035);
      spotCone.rotation.y = clock * 0.35;

      for (const c of clouds) {
        c.obj.position.x += c.speed * dt;
        if (c.obj.position.x > 16) c.obj.position.x = -16;
        c.obj.position.y = c.baseY + Math.sin(clock * 0.9 + c.phase) * 0.12;
      }
      for (const b of swayBushes) {
        b.obj.rotation.z = Math.sin(clock * 2.2 + b.phase) * 0.045;
      }
      for (const f of floaters) {
        f.obj.position.y = f.baseY + Math.sin(clock * f.speed + f.phase) * f.amp;
        f.obj.rotation.y = clock * 1.5 + f.phase;
        f.obj.rotation.z = Math.sin(clock * 1.2 + f.phase) * 0.18;
      }
    },
  };
}

/**
 * Builds rich cartoon outer surroundings around the 21x33 battle arena:
 * terracotta canyon cliffs + glowing crystal spires (Crystal Cavern) or
 * animated scrolling turquoise river + grassy rocky banks (Twin Bridges).
 */
export function buildMatchSurround(mapId: MapId): MatchSurroundHandle {
  const group = new THREE.Group();
  const surroundTex = createCartoonSurroundTexture(mapId);

  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_WIDTH + 46, MAP_HEIGHT + 46),
    new THREE.MeshLambertMaterial({ map: surroundTex }),
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(MAP_WIDTH / 2, -0.08, MAP_HEIGHT / 2);
  group.add(surround);

  // Raised stone stadium curb framing the arena walls cleanly
  const curbMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? 0x6e4736 : 0x3b6e52 });
  const curbTop = new THREE.Mesh(new THREE.BoxGeometry(MAP_WIDTH + 2.4, 0.28, 1.2), curbMat);
  curbTop.position.set(MAP_WIDTH / 2, -0.02, -0.6);
  group.add(curbTop);
  const curbBot = curbTop.clone();
  curbBot.position.set(MAP_WIDTH / 2, -0.02, MAP_HEIGHT + 0.6);
  group.add(curbBot);
  const curbLeft = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, MAP_HEIGHT + 2.4), curbMat);
  curbLeft.position.set(-0.6, -0.02, MAP_HEIGHT / 2);
  group.add(curbLeft);
  const curbRight = curbLeft.clone();
  curbRight.position.set(MAP_WIDTH + 0.6, -0.02, MAP_HEIGHT / 2);
  group.add(curbRight);

  // Decorative outer canyon mesas / rocky islands & glowing crystals around perimeter
  const outerSway: Array<{ obj: THREE.Object3D; phase: number }> = [];
  const rockMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? 0xc97343 : 0x4ba859 });
  const rockCapMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? 0xeba564 : 0x70d669 });

  const decorSpots: Array<[number, number, number]> = [
    [-4.5, 4, 1.5], [-5.2, 12, 1.9], [-4.2, 21, 1.6], [-5.0, 29, 1.8],
    [MAP_WIDTH + 4.5, 5, 1.7], [MAP_WIDTH + 5.1, 14, 2.0], [MAP_WIDTH + 4.3, 22, 1.5], [MAP_WIDTH + 4.8, 30, 1.8],
    [4, -4.5, 1.6], [10.5, -5.2, 2.1], [17, -4.5, 1.6],
    [4, MAP_HEIGHT + 4.5, 1.6], [10.5, MAP_HEIGHT + 5.2, 2.0], [17, MAP_HEIGHT + 4.5, 1.6],
  ];

  for (let i = 0; i < decorSpots.length; i++) {
    const [dx, dz, sc] = decorSpots[i];
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.72, sc, sc * 0.85, 7), rockMat);
    mound.position.set(dx, sc * 0.34, dz);
    mound.rotation.y = i * 0.7;
    group.add(mound);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.68, sc * 0.75, 0.22, 7), rockCapMat);
    cap.position.set(dx, sc * 0.78, dz);
    cap.rotation.y = i * 0.7;
    group.add(cap);

    if (i % 2 === 0) {
      const crystal = createCrystalCluster(
        mapId === 'crystal-cavern' ? 0xd956ff : 0x46e6ff,
        mapId === 'crystal-cavern' ? 0x620ea8 : 0x0a6c9e,
        0.95,
      );
      crystal.position.set(dx + (i % 3 === 0 ? 0.4 : -0.4), sc * 0.82, dz);
      group.add(crystal);
    } else {
      const bush = createCartoonBushProp(1.05);
      bush.position.set(dx, sc * 0.82, dz);
      group.add(bush);
      outerSway.push({ obj: bush, phase: i * 0.9 });
    }
  }

  return {
    group,
    update(clock: number, dt: number) {
      // Gently animate flowing cartoon river water on Twin Bridges!
      if (mapId === 'twin-bridges') {
        surroundTex.offset.x = (surroundTex.offset.x + dt * 0.16) % 1;
        surroundTex.offset.y = Math.sin(clock * 0.7) * 0.04;
      }
      for (const b of outerSway) {
        b.obj.rotation.z = Math.sin(clock * 2.0 + b.phase) * 0.035;
      }
    },
  };
}
