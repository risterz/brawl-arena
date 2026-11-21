import * as THREE from 'three';
import { GameMode, MAP_HEIGHT, MAP_WIDTH, MapId } from '@brawl-arena/shared';
import { cloneModel } from './modelBank';
import { getGemCrystalGeo } from './projectileMeshes';

export interface PreviewStageHandle {
  group: THREE.Group;
  update: (clock: number, dt: number) => void;
}

export interface MatchSurroundHandle {
  group: THREE.Group;
  update: (clock: number, dt: number) => void;
}

function createSkyGradientTexture(gameMode: GameMode): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  if (gameMode === 'brawl-ball') {
    // Sunny daytime cartoon soccer stadium sky
    grad.addColorStop(0.0, '#0f6ce6');
    grad.addColorStop(0.35, '#24a3ff');
    grad.addColorStop(0.68, '#7ae0ff');
    grad.addColorStop(0.88, '#ccf7ff');
    grad.addColorStop(1.0, '#fff4bf');
  } else {
    // Rich twilight gem-cavern indigo/purple horizon sky
    grad.addColorStop(0.0, '#1c1258');
    grad.addColorStop(0.32, '#3c1e8e');
    grad.addColorStop(0.62, '#7338c9');
    grad.addColorStop(0.84, '#c26bff');
    grad.addColorStop(1.0, '#ffb86c');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle cartoon halftone dots in upper sky for stylized arcade feel
  ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
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

function createSunburstTexture(gameMode: GameMode): THREE.CanvasTexture {
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
    if (gameMode === 'brawl-ball') {
      rayGrad.addColorStop(0.0, 'rgba(255, 250, 200, 0.62)');
      rayGrad.addColorStop(0.45, 'rgba(130, 238, 255, 0.28)');
      rayGrad.addColorStop(1.0, 'rgba(130, 238, 255, 0.0)');
    } else {
      rayGrad.addColorStop(0.0, 'rgba(255, 180, 255, 0.56)');
      rayGrad.addColorStop(0.45, 'rgba(176, 98, 255, 0.30)');
      rayGrad.addColorStop(1.0, 'rgba(176, 98, 255, 0.0)');
    }
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

function createLobbyFloorTexture(gameMode: GameMode): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (gameMode === 'brawl-ball') {
    // Lush two-tone mowed cartoon stadium soccer pitch turf!
    const stripeH = 64;
    for (let y = 0; y < 512; y += stripeH) {
      ctx.fillStyle = (y / stripeH) % 2 === 0 ? '#37b857' : '#2ea64c';
      ctx.fillRect(0, y, 512, stripeH);
    }

    // Subtle turf blades & sunny radial glow
    const sunGlow = ctx.createRadialGradient(256, 256, 24, 256, 256, 250);
    sunGlow.addColorStop(0.0, 'rgba(182, 255, 160, 0.32)');
    sunGlow.addColorStop(0.6, 'rgba(40, 160, 72, 0.05)');
    sunGlow.addColorStop(1.0, 'rgba(14, 72, 34, 0.36)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, 512, 512);

    // Crisp painted white stadium pitch markings!
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.lineWidth = 8;
    // Halfway line
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(256, 256, 110, 0, Math.PI * 2);
    ctx.stroke();

    // Outer pitch ring & penalty arc accents
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.strokeRect(36, 36, 440, 440);
    ctx.beginPath();
    ctx.arc(256, 62, 64, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(256, 450, 64, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
  } else {
    // Gem Grab: Stylized desert mine sandstone courtyard with glowing purple Gem Mine rings
    ctx.fillStyle = '#c8834a';
    ctx.fillRect(0, 0, 512, 512);

    const step = 64;
    for (let y = 0; y < 512; y += step) {
      for (let x = 0; x < 512; x += step) {
        const even = ((x / step) + (y / step)) % 2 === 0;
        ctx.fillStyle = even ? '#d89358' : '#c27b44';
        ctx.fillRect(x, y, step, step);
        ctx.strokeStyle = 'rgba(72, 32, 18, 0.22)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y + 1.5, step - 3, step - 3);
      }
    }

    // Glowing amethyst Gem Mine plaza aura in center
    const glow = ctx.createRadialGradient(256, 256, 22, 256, 256, 240);
    glow.addColorStop(0.0, 'rgba(220, 110, 255, 0.52)');
    glow.addColorStop(0.42, 'rgba(136, 56, 214, 0.20)');
    glow.addColorStop(1.0, 'rgba(54, 22, 58, 0.44)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);

    // Painted purple crystal energy rings & minecart tracks
    ctx.strokeStyle = 'rgba(232, 130, 255, 0.62)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(256, 256, 118, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 218, 102, 0.36)';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.arc(256, 256, 178, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCartoonSurroundTexture(mapId: MapId): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  if (mapId === 'iron-foundry') {
    // Dark weathered volcanic basalt with glowing flowing molten slag channels!
    ctx.fillStyle = '#2d262b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#382f35';
    for (let y = 0; y < 256; y += 64) {
      for (let x = 0; x < 256; x += 64) {
        if (((x / 64) + (y / 64)) % 2 === 0) {
          ctx.fillRect(x, y, 64, 64);
        }
      }
    }
    // Glowing molten magma rivers threading through foundry floor
    ctx.fillStyle = '#e84810';
    for (let y = 26; y < 256; y += 64) {
      ctx.beginPath();
      ctx.roundRect(0, y, 256, 16, 4);
      ctx.fill();
    }
    ctx.fillStyle = '#ffae24';
    for (let y = 31; y < 256; y += 64) {
      for (let x = (y % 128 === 31 ? 10 : 48); x < 256; x += 82) {
        ctx.beginPath();
        ctx.roundRect(x, y, 36, 6, 3);
        ctx.fill();
      }
    }
  } else if (mapId === 'crystal-cavern') {
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

function createStadiumGoalProp(): THREE.Group {
  const g = new THREE.Group();
  const postMat = new THREE.MeshToonMaterial({ color: 0xf4f8ff });
  const accentMat = new THREE.MeshToonMaterial({ color: 0x29a8ff });
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.45,
  });

  const width = 5.4;
  const height = 2.4;
  const depth = 1.6;
  const postGeo = new THREE.CylinderGeometry(0.11, 0.11, height, 10);
  const leftPost = new THREE.Mesh(postGeo, postMat);
  leftPost.position.set(-width / 2, height / 2, 0);
  g.add(leftPost);

  const rightPost = new THREE.Mesh(postGeo, postMat);
  rightPost.position.set(width / 2, height / 2, 0);
  g.add(rightPost);

  const crossBar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, width + 0.22, 10), accentMat);
  crossBar.rotation.z = Math.PI / 2;
  crossBar.position.set(0, height, 0);
  g.add(crossBar);

  const netBack = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 10, 5), netMat);
  netBack.position.set(0, height / 2, -depth);
  g.add(netBack);

  const netTop = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 10, 3), netMat);
  netTop.rotation.x = Math.PI / 2;
  netTop.position.set(0, height, -depth / 2);
  g.add(netTop);

  const netSideGeo = new THREE.PlaneGeometry(depth, height, 3, 5);
  const netL = new THREE.Mesh(netSideGeo, netMat);
  netL.rotation.y = Math.PI / 2;
  netL.position.set(-width / 2, height / 2, -depth / 2);
  g.add(netL);

  const netR = new THREE.Mesh(netSideGeo, netMat);
  netR.rotation.y = -Math.PI / 2;
  netR.position.set(width / 2, height / 2, -depth / 2);
  g.add(netR);

  return g;
}

function createFloodlightTower(sideSign: number): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshToonMaterial({ color: 0x3b4d6b });
  const headMat = new THREE.MeshToonMaterial({ color: 0x1d2940 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff8c9 });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.30, 7.6, 8), poleMat);
  pole.position.y = 3.8;
  g.add(pole);

  const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.15, 0.45), headMat);
  head.position.set(0, 7.7, 0.1);
  head.rotation.x = 0.28;
  head.rotation.y = -sideSign * 0.35;
  g.add(head);

  const lampPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.85), lampMat);
  lampPanel.position.set(0, 0, 0.24);
  head.add(lampPanel);

  return g;
}

function createFloatingBallProp(scale = 1): THREE.Object3D {
  const glb = cloneModel('brawl_ball', false);
  if (glb) {
    glb.scale.setScalar(scale * 1.15);
    return glb;
  }
  const fallback = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.36 * scale, 14, 12),
    new THREE.MeshToonMaterial({ color: 0xffffff }),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.36 * scale, 0.045 * scale, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0xffd43b }),
  );
  fallback.add(sphere, ring);
  return fallback;
}

/**
 * Builds the mode-specific Brawl Stars-style animated cartoon lobby stage:
 * - Gem Grab: Twilight canyon sky, desert stone Gem Mine courtyard, crystal clusters, mesas, floating gems.
 * - Brawl Ball: Sunny stadium sky, striped soccer turf pitch with white lines, 3D goalpost & net, floodlight towers, floating 3D Brawl Balls.
 */
export function buildAnimatedPreviewStage(gameMode: GameMode = 'gem-grab'): PreviewStageHandle {
  const group = new THREE.Group();
  const isBall = gameMode === 'brawl-ball';

  // 1. Vibrant mode-themed cartoon sky dome
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(48, 24, 16),
    new THREE.MeshBasicMaterial({ map: createSkyGradientTexture(gameMode), side: THREE.BackSide, depthWrite: false }),
  );
  group.add(skyDome);

  // 2. Rotating comic sunburst disc behind the brawler
  const sunburst = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshBasicMaterial({
      map: createSunburstTexture(gameMode),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sunburst.position.set(0, 2.5, -16);
  group.add(sunburst);

  // 3. Mode-specific stylized floor beneath podium
  const floorY = -0.46;
  const courtyard = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48),
    new THREE.MeshLambertMaterial({ map: createLobbyFloorTexture(gameMode) }),
  );
  courtyard.rotation.x = -Math.PI / 2;
  courtyard.position.y = floorY;
  group.add(courtyard);

  // Outer apron ring matching mode theme
  const turfRing = new THREE.Mesh(
    new THREE.RingGeometry(11.5, 44, 48),
    new THREE.MeshLambertMaterial({ color: isBall ? 0x249644 : 0x995234 }),
  );
  turfRing.rotation.x = -Math.PI / 2;
  turfRing.position.y = floorY - 0.02;
  group.add(turfRing);

  // 4. Multi-Tier Hero Podium themed to mode (Purple/Gold Gem Mine vs Emerald/Gold Stadium)
  const baseTier = new THREE.Mesh(
    new THREE.CylinderGeometry(2.15, 2.48, 0.24, 32),
    new THREE.MeshToonMaterial({ color: isBall ? 0x165e36 : 0x2f185e }),
  );
  baseTier.position.y = -0.35;
  group.add(baseTier);

  const mainPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.62, 1.88, 0.34, 32),
    new THREE.MeshToonMaterial({ color: isBall ? 0x249954 : 0x5d28a8 }),
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
      color: isBall ? 0x7eff9b : 0xe366ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
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
      color: isBall ? 0xc2ffcf : 0xe09eff,
      transparent: true,
      opacity: 0.10,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  spotCone.position.set(0, 3.4, 0);
  group.add(spotCone);

  const swayProps: Array<{ obj: THREE.Object3D; phase: number }> = [];
  const floaters: Array<{ obj: THREE.Object3D; baseY: number; amp: number; speed: number; phase: number }> = [];

  if (isBall) {
    // 5B. Brawl Ball Stadium Scenery: 3D Goalpost & Net, Stadium Stands, Floodlight Towers & Flags!
    const goalProp = createStadiumGoalProp();
    goalProp.position.set(0, floorY, -7.8);
    group.add(goalProp);

    const towerL = createFloodlightTower(-1);
    towerL.position.set(-7.6, floorY, -10.8);
    group.add(towerL);
    const towerR = createFloodlightTower(1);
    towerR.position.set(7.6, floorY, -10.8);
    group.add(towerR);

    // Colorful cartoon stadium bleacher walls framing left & right background
    const standSpecs: Array<[number, number, number, number]> = [
      [-9.8, -12.6, 0.28, 0x29a8ff],
      [9.8, -12.6, -0.28, 0xff4757],
    ];
    for (const [sx, sz, rotY, bannerColor] of standSpecs) {
      const stand = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(7.2, 2.2, 2.0),
        new THREE.MeshToonMaterial({ color: 0x3b4d70 }),
      );
      base.position.y = 1.1;
      stand.add(base);
      const banner = new THREE.Mesh(
        new THREE.BoxGeometry(7.3, 0.55, 2.08),
        new THREE.MeshToonMaterial({ color: bannerColor }),
      );
      banner.position.y = 2.25;
      stand.add(banner);
      stand.position.set(sx, floorY, sz);
      stand.rotation.y = rotY;
      group.add(stand);
    }

    // Swaying corner flags & bushes
    const flagSpecs: Array<[number, number, number]> = [
      [-4.6, -4.4, 0x29a8ff],
      [4.6, -4.4, 0xff4757],
      [-5.9, -7.2, 0xffd43b],
      [5.9, -7.2, 0xffd43b],
    ];
    for (let i = 0; i < flagSpecs.length; i++) {
      const [fx, fz, col] = flagSpecs[i];
      const flagGrp = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6),
        new THREE.MeshToonMaterial({ color: 0xffffff }),
      );
      pole.position.y = 0.9;
      const pennant = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.36, 0.05),
        new THREE.MeshToonMaterial({ color: col }),
      );
      pennant.position.set(0.32, 1.58, 0);
      flagGrp.add(pole, pennant);
      flagGrp.position.set(fx, floorY, fz);
      group.add(flagGrp);
      swayProps.push({ obj: flagGrp, phase: i * 1.3 });
    }

    // Floating spinning 3D Brawl Balls & Gold Stars
    const starGeo = createStarGeo(0.24, 0.11, 0.08);
    const starMat = new THREE.MeshToonMaterial({ color: 0xffdf42, emissive: 0x6b4700 });
    const ballFloats: Array<[number, number, number, boolean, number]> = [
      [-3.3, 1.85, -2.9, true, 0.92],
      [3.4, 2.05, -3.1, true, 0.88],
      [-4.9, 3.1, -5.8, false, 1.05],
      [5.0, 2.8, -5.6, true, 0.95],
      [-2.2, 3.4, -6.5, false, 0.85],
      [2.3, 3.3, -6.6, false, 0.9],
    ];
    for (let i = 0; i < ballFloats.length; i++) {
      const [fx, fy, fz, isBallProp, sc] = ballFloats[i];
      const obj = isBallProp
        ? createFloatingBallProp(sc)
        : new THREE.Mesh(starGeo, starMat);
      if (!isBallProp) obj.scale.setScalar(sc);
      obj.position.set(fx, fy, fz);
      group.add(obj);
      floaters.push({ obj, baseY: fy, amp: 0.24, speed: 1.7 + (i % 3) * 0.35, phase: i * 1.15 });
    }
  } else {
    // 5A. Gem Grab Scenery: Canyon Mesas, Glowing Purple/Cyan Crystal Clusters, Swaying Bushes & Floating Gems
    const mesaColors = [0xd98048, 0xc86b3a, 0xe89b5a, 0x5e349e, 0x452280];
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
      swayProps.push({ obj: bush, phase: i * 1.1 });
    }

    const crystalLeft = createCrystalCluster(0xd654ff, 0x5c0ea8, 1.35);
    crystalLeft.position.set(-4.0, floorY, -5.0);
    group.add(crystalLeft);

    const crystalRight = createCrystalCluster(0x3ce8ff, 0x0b6699, 1.22);
    crystalRight.position.set(4.1, floorY, -5.2);
    group.add(crystalRight);

    const crystalBack = createCrystalCluster(0xe66bff, 0x6e00bd, 1.55);
    crystalBack.position.set(0, floorY, -8.5);
    group.add(crystalBack);

    const starGeo = createStarGeo(0.24, 0.11, 0.08);
    const gemGeo = getGemCrystalGeo();
    const starMat = new THREE.MeshToonMaterial({ color: 0xffdf42, emissive: 0x6b4700 });
    const gemMat = new THREE.MeshToonMaterial({ color: 0xe66bff, emissive: 0x6e00bd });

    const floaterSpecs: Array<[number, number, number, boolean, number]> = [
      [-3.1, 1.9, -2.8, false, 1.05],
      [3.2, 2.2, -3.0, true, 0.95],
      [-4.8, 3.0, -5.8, true, 1.15],
      [4.9, 2.7, -5.6, false, 1.12],
      [-2.0, 3.5, -6.5, true, 0.85],
      [2.3, 3.4, -6.8, false, 0.95],
    ];
    for (let i = 0; i < floaterSpecs.length; i++) {
      const [fx, fy, fz, isStar, sc] = floaterSpecs[i];
      const m = new THREE.Mesh(isStar ? starGeo : gemGeo, isStar ? starMat : gemMat);
      m.position.set(fx, fy, fz);
      m.scale.setScalar(sc);
      group.add(m);
      floaters.push({ obj: m, baseY: fy, amp: 0.22, speed: 1.6 + (i % 3) * 0.35, phase: i * 1.15 });
    }
  }

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
      for (const b of swayProps) {
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

  // Raised stone/steel stadium curb framing the arena walls cleanly
  const curbMat = new THREE.MeshToonMaterial({
    color: mapId === 'crystal-cavern' ? 0x6e4736 : mapId === 'iron-foundry' ? 0x353c48 : 0x3b6e52,
  });
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

  // Decorative outer scenery: mesas/crystals OR industrial foundry smokestacks, furnace vats & rising embers!
  const outerSway: Array<{ obj: THREE.Object3D; phase: number }> = [];
  const embers: Array<{ mesh: THREE.Mesh; speed: number; baseX: number; baseZ: number; phase: number }> = [];

  const decorSpots: Array<[number, number, number]> = [
    [-4.5, 4, 1.5], [-5.2, 12, 1.9], [-4.2, 21, 1.6], [-5.0, 29, 1.8],
    [MAP_WIDTH + 4.5, 5, 1.7], [MAP_WIDTH + 5.1, 14, 2.0], [MAP_WIDTH + 4.3, 22, 1.5], [MAP_WIDTH + 4.8, 30, 1.8],
    [4, -4.5, 1.6], [10.5, -5.2, 2.1], [17, -4.5, 1.6],
    [4, MAP_HEIGHT + 4.5, 1.6], [10.5, MAP_HEIGHT + 5.2, 2.0], [17, MAP_HEIGHT + 4.5, 1.6],
  ];

  if (mapId === 'iron-foundry') {
    const steelDark = new THREE.MeshToonMaterial({ color: 0x2c323d });
    const steelMid = new THREE.MeshToonMaterial({ color: 0x4b5463 });
    const hazardMat = new THREE.MeshToonMaterial({ color: 0xf7b91e });
    const lavaGlow = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xffae2b });
    const emberGeo = new THREE.OctahedronGeometry(0.11, 0);

    for (let i = 0; i < decorSpots.length; i++) {
      const [dx, dz, sc] = decorSpots[i];
      // Industrial concrete & steel foundation pad
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.9, sc * 1.05, 0.75, 8), steelDark);
      pad.position.set(dx, 0.3, dz);
      group.add(pad);

      if (i % 2 === 0) {
        // Tall industrial smokestack chimney with hazard warning ring & glowing furnace mouth
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.36, sc * 0.52, sc * 2.4, 12), steelMid);
        stack.position.set(dx, 0.65 + sc * 1.15, dz);
        group.add(stack);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.44, sc * 0.46, 0.35, 12), hazardMat);
        band.position.set(dx, 0.65 + sc * 1.6, dz);
        group.add(band);
        const furnaceGlow = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.32, sc * 0.32, 0.14, 12), lavaGlow);
        furnaceGlow.position.set(dx, 0.65 + sc * 2.34, dz);
        group.add(furnaceGlow);
      } else {
        // Glowing molten slag smelter vat
        const vat = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.72, sc * 0.78, 1.1, 12), steelMid);
        vat.position.set(dx, 0.9, dz);
        group.add(vat);
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(sc * 0.62, sc * 0.62, 0.12, 12), lavaGlow);
        pool.position.set(dx, 1.44, dz);
        group.add(pool);
      }

      // Spawn 2 rising glowing embers per outer foundry station
      for (let e = 0; e < 2; e++) {
        const em = new THREE.Mesh(emberGeo, emberMat);
        const ex = dx + (e === 0 ? -0.6 : 0.6);
        const ez = dz + (e === 0 ? 0.5 : -0.5);
        em.position.set(ex, 1.2 + ((i * 1.3 + e * 2.1) % 4.5), ez);
        group.add(em);
        embers.push({ mesh: em, speed: 0.9 + ((i + e) % 3) * 0.35, baseX: ex, baseZ: ez, phase: i * 0.8 + e * 1.7 });
      }
    }
  } else {
    const rockMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? 0xc97343 : 0x4ba859 });
    const rockCapMat = new THREE.MeshToonMaterial({ color: mapId === 'crystal-cavern' ? 0xeba564 : 0x70d669 });

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
  }

  return {
    group,
    update(clock: number, dt: number) {
      // Gently animate flowing cartoon river water on Twin Bridges or molten slag on Iron Foundry!
      if (mapId === 'twin-bridges') {
        surroundTex.offset.x = (surroundTex.offset.x + dt * 0.16) % 1;
        surroundTex.offset.y = Math.sin(clock * 0.7) * 0.04;
      } else if (mapId === 'iron-foundry') {
        surroundTex.offset.x = (surroundTex.offset.x + dt * 0.08) % 1;
      }
      for (const b of outerSway) {
        b.obj.rotation.z = Math.sin(clock * 2.0 + b.phase) * 0.035;
      }
      for (const em of embers) {
        em.mesh.position.y += em.speed * dt;
        em.mesh.position.x = em.baseX + Math.sin(clock * 2.2 + em.phase) * 0.35;
        em.mesh.rotation.y = clock * 2.5 + em.phase;
        if (em.mesh.position.y > 5.8) {
          em.mesh.position.y = 1.0;
        }
      }
    },
  };
}
