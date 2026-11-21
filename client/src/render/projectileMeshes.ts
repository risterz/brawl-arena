import * as THREE from 'three';
import { BrawlerId, BRAWLERS, Team } from '@brawl-arena/shared';
import { cloneModel } from './modelBank';

export interface ProjectileVisualSpec {
  brawlerId: BrawlerId;
  team: Team;
  isSuper: boolean;
  isHeal: boolean;
  radius: number;
}

let cachedFlameGeo: THREE.BufferGeometry | null = null;
let cachedHealCrossGeo: THREE.BufferGeometry | null = null;
let cachedBulletCasingGeo: THREE.BufferGeometry | null = null;
let cachedBulletTipGeo: THREE.BufferGeometry | null = null;
let cachedTracerConeGeo: THREE.BufferGeometry | null = null;
let cachedFlaskGlassGeo: THREE.BufferGeometry | null = null;
let cachedFlaskLiquidGeo: THREE.BufferGeometry | null = null;
let cachedMusicNoteGeo: THREE.BufferGeometry | null = null;
let cachedCrescentBladeGeo: THREE.BufferGeometry | null = null;
let cachedGemCrystalGeo: THREE.BufferGeometry | null = null;
let cachedSparkShardGeo: THREE.BufferGeometry | null = null;
let cachedBombFuseGeo: THREE.BufferGeometry | null = null;

/** Sculpted teardrop flame tongue profile (LatheGeometry along +Y). */
export function createFlameGeometry(): THREE.BufferGeometry {
  if (cachedFlameGeo) return cachedFlameGeo;
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.18, 0.08),
    new THREE.Vector2(0.24, 0.24),
    new THREE.Vector2(0.19, 0.48),
    new THREE.Vector2(0.09, 0.76),
    new THREE.Vector2(0.0, 1.0),
  ];
  cachedFlameGeo = new THREE.LatheGeometry(pts, 10);
  return cachedFlameGeo;
}

/** Crisp 3D extruded '+' cross for healing VFX. */
export function createHealCrossGeometry(): THREE.BufferGeometry {
  if (cachedHealCrossGeo) return cachedHealCrossGeo;
  const arm = 0.22;
  const half = 0.075;
  const shape = new THREE.Shape();
  shape.moveTo(-half, arm);
  shape.lineTo(half, arm);
  shape.lineTo(half, half);
  shape.lineTo(arm, half);
  shape.lineTo(arm, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, -arm);
  shape.lineTo(-half, -arm);
  shape.lineTo(-half, -half);
  shape.lineTo(-arm, -half);
  shape.lineTo(-arm, half);
  shape.lineTo(-half, half);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.018,
    bevelSegments: 2,
  });
  geo.center();
  cachedHealCrossGeo = geo;
  return cachedHealCrossGeo;
}

/** Stretched diamond spark shard oriented along +X. */
export function createSparkShardGeometry(): THREE.BufferGeometry {
  if (cachedSparkShardGeo) return cachedSparkShardGeo;
  const geo = new THREE.OctahedronGeometry(0.12, 0);
  geo.scale(2.4, 0.55, 0.55);
  cachedSparkShardGeo = geo;
  return cachedSparkShardGeo;
}

/** Real cartridge brass casing oriented along +X. */
function getBulletCasingGeo(): THREE.BufferGeometry {
  if (cachedBulletCasingGeo) return cachedBulletCasingGeo;
  const pts = [
    new THREE.Vector2(0.0, -0.34),
    new THREE.Vector2(0.145, -0.34), // rim
    new THREE.Vector2(0.12, -0.28),
    new THREE.Vector2(0.135, -0.22),
    new THREE.Vector2(0.135, 0.08),
    new THREE.Vector2(0.105, 0.16), // bottleneck
    new THREE.Vector2(0.105, 0.22),
  ];
  const geo = new THREE.LatheGeometry(pts, 12);
  geo.rotateZ(-Math.PI / 2); // align +Y lathe axis to +X forward
  cachedBulletCasingGeo = geo;
  return cachedBulletCasingGeo;
}

/** Pointed ogive bullet warhead oriented along +X. */
function getBulletTipGeo(): THREE.BufferGeometry {
  if (cachedBulletTipGeo) return cachedBulletTipGeo;
  const pts = [
    new THREE.Vector2(0.105, 0.2),
    new THREE.Vector2(0.105, 0.34),
    new THREE.Vector2(0.082, 0.46),
    new THREE.Vector2(0.042, 0.56),
    new THREE.Vector2(0.0, 0.64),
  ];
  const geo = new THREE.LatheGeometry(pts, 12);
  geo.rotateZ(-Math.PI / 2);
  cachedBulletTipGeo = geo;
  return cachedBulletTipGeo;
}

/** Tapered fiery tracer cone trailing behind -X. */
function getTracerConeGeo(): THREE.BufferGeometry {
  if (cachedTracerConeGeo) return cachedTracerConeGeo;
  const geo = new THREE.ConeGeometry(0.13, 0.78, 8, 1, true);
  geo.rotateZ(Math.PI / 2); // tip points -X
  geo.translate(-0.7, 0, 0);
  cachedTracerConeGeo = geo;
  return cachedTracerConeGeo;
}

/** Alchemist bulbous glass flask with narrow neck and flared lip. */
function getFlaskGlassGeo(): THREE.BufferGeometry {
  if (cachedFlaskGlassGeo) return cachedFlaskGlassGeo;
  const pts = [
    new THREE.Vector2(0.0, -0.26),
    new THREE.Vector2(0.22, -0.24),
    new THREE.Vector2(0.28, -0.06),
    new THREE.Vector2(0.22, 0.12),
    new THREE.Vector2(0.095, 0.2),
    new THREE.Vector2(0.095, 0.34),
    new THREE.Vector2(0.135, 0.38),
    new THREE.Vector2(0.09, 0.38),
  ];
  cachedFlaskGlassGeo = new THREE.LatheGeometry(pts, 12);
  return cachedFlaskGlassGeo;
}

function getFlaskLiquidGeo(): THREE.BufferGeometry {
  if (cachedFlaskLiquidGeo) return cachedFlaskLiquidGeo;
  const pts = [
    new THREE.Vector2(0.0, -0.22),
    new THREE.Vector2(0.19, -0.2),
    new THREE.Vector2(0.23, -0.05),
    new THREE.Vector2(0.17, 0.08),
    new THREE.Vector2(0.0, 0.08),
  ];
  cachedFlaskLiquidGeo = new THREE.LatheGeometry(pts, 10);
  return cachedFlaskLiquidGeo;
}

/** Extruded 3D musical eighth note (♪). */
function getMusicNoteGeo(): THREE.BufferGeometry {
  if (cachedMusicNoteGeo) return cachedMusicNoteGeo;
  const shape = new THREE.Shape();
  // Oval note head + stem + curved flag
  shape.absellipse(-0.1, -0.18, 0.14, 0.1, 0, Math.PI * 2, false, 0.25);
  const stem = new THREE.Shape();
  stem.moveTo(0.0, -0.18);
  stem.lineTo(0.08, -0.18);
  stem.lineTo(0.08, 0.28);
  stem.lineTo(0.28, 0.16);
  stem.lineTo(0.24, 0.06);
  stem.lineTo(0.08, 0.16);
  stem.lineTo(0.0, 0.34);
  stem.closePath();

  const geo = new THREE.ExtrudeGeometry([shape, stem], {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  geo.center();
  geo.rotateX(-Math.PI / 2);
  cachedMusicNoteGeo = geo;
  return cachedMusicNoteGeo;
}

/** Curved fiery shockwave crescent blade facing +X. */
function getCrescentBladeGeo(): THREE.BufferGeometry {
  if (cachedCrescentBladeGeo) return cachedCrescentBladeGeo;
  const shape = new THREE.Shape();
  shape.moveTo(0.26, 0);
  shape.quadraticCurveTo(0.08, 0.42, -0.24, 0.52);
  shape.quadraticCurveTo(0.02, 0.2, 0.04, 0);
  shape.quadraticCurveTo(0.02, -0.2, -0.24, -0.52);
  shape.quadraticCurveTo(0.08, -0.42, 0.26, 0);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  geo.center();
  geo.rotateX(-Math.PI / 2);
  cachedCrescentBladeGeo = geo;
  return cachedCrescentBladeGeo;
}

/** Multi-faceted pointed hexagonal gem crystal. */
export function getGemCrystalGeo(): THREE.BufferGeometry {
  if (cachedGemCrystalGeo) return cachedGemCrystalGeo;
  const pts = [
    new THREE.Vector2(0.0, -0.42),
    new THREE.Vector2(0.28, -0.12),
    new THREE.Vector2(0.32, 0.1),
    new THREE.Vector2(0.18, 0.34),
    new THREE.Vector2(0.0, 0.46),
  ];
  cachedGemCrystalGeo = new THREE.LatheGeometry(pts, 6);
  return cachedGemCrystalGeo;
}

function getBombFuseGeo(): THREE.BufferGeometry {
  if (cachedBombFuseGeo) return cachedBombFuseGeo;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.34, 0),
    new THREE.Vector3(0.08, 0.5, 0.04),
    new THREE.Vector3(0.22, 0.56, 0.08),
  ]);
  cachedBombFuseGeo = new THREE.TubeGeometry(curve, 10, 0.032, 6, false);
  return cachedBombFuseGeo;
}

/** Builds a real cartoon iron bomb (Blender GLB + live flickering teardrop flame tip). */
export function createBombVisual(): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'hazard-bomb';

  const glb = cloneModel('bomb');
  if (glb) {
    glb.name = 'bomb-fuse';
    grp.add(glb);
    const flame = new THREE.Mesh(
      createFlameGeometry(),
      new THREE.MeshBasicMaterial({ color: 0xffae24 }),
    );
    flame.name = 'bomb-flame';
    flame.position.set(0.24, 0.90, -0.06);
    flame.scale.set(0.45, 0.36, 0.45);
    grp.add(flame);
    return grp;
  }

  // Fallback procedural iron bomb
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.31, 2),
    new THREE.MeshToonMaterial({ color: 0x202736, emissive: 0x150811 }),
  );
  body.position.y = 0.31;
  body.castShadow = true;
  grp.add(body);

  const stripe = new THREE.Mesh(
    new THREE.TorusGeometry(0.305, 0.035, 8, 18),
    new THREE.MeshBasicMaterial({ color: 0xff4757 }),
  );
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 0.31;
  grp.add(stripe);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.13, 0.12, 10),
    new THREE.MeshToonMaterial({ color: 0x62728f }),
  );
  collar.position.y = 0.6;
  grp.add(collar);

  const fuse = new THREE.Mesh(
    getBombFuseGeo(),
    new THREE.MeshToonMaterial({ color: 0xd9b382 }),
  );
  fuse.name = 'bomb-fuse';
  fuse.position.y = 0.28;
  grp.add(fuse);

  const flame = new THREE.Mesh(
    createFlameGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xffae24 }),
  );
  flame.name = 'bomb-flame';
  flame.position.set(0.22, 0.82, 0.08);
  flame.scale.set(0.45, 0.36, 0.45);
  grp.add(flame);

  return grp;
}

/** Builds a faceted glowing crystal gem pickup (Blender GLB + aura ring). */
export function createGemCrystalVisual(): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'gem-crystal';

  const glb = cloneModel('gem');
  if (glb) {
    const core = new THREE.Group();
    core.name = 'gem-core';
    glb.position.y = -0.5;
    core.add(glb);
    core.position.y = 0.56;
    grp.add(core);
  } else {
    const crystal = new THREE.Mesh(
      getGemCrystalGeo(),
      new THREE.MeshToonMaterial({ color: 0xd946ff, emissive: 0x6c00c9 }),
    );
    crystal.name = 'gem-core';
    crystal.position.y = 0.56;
    crystal.castShadow = true;
    grp.add(crystal);

    const highlight = new THREE.Mesh(
      getGemCrystalGeo(),
      new THREE.MeshBasicMaterial({ color: 0xf7b8ff, wireframe: true, transparent: true, opacity: 0.4 }),
    );
    highlight.scale.setScalar(1.04);
    crystal.add(highlight);
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.47, 18),
    new THREE.MeshBasicMaterial({
      color: 0xf08cff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  grp.add(ring);

  return grp;
}

/**
 * Creates a sculpted, recognizable 3D projectile Group aligned to +X forward.
 * Zero plain spheres: real bullet cartridges, shotgun slugs, shockwave blades,
 * finned sniper arrows, energy power fists, corked potion flasks, and 3D music notes.
 */
export function createProjectileVisual(spec: ProjectileVisualSpec): THREE.Group {
  const grp = new THREE.Group();
  grp.name = `proj-${spec.brawlerId}-${spec.isSuper ? 'super' : 'primary'}`;
  const cfg = BRAWLERS[spec.brawlerId];
  const teamTint = spec.team === 'blue' ? cfg.accentColor : '#ff5a6e';

  if (spec.brawlerId === 'blaze') {
    const scale = spec.isSuper ? 1.45 : 1.05;
    const glb = cloneModel('bullet');
    const tracer = new THREE.Mesh(
      getTracerConeGeo(),
      new THREE.MeshBasicMaterial({
        color: spec.isSuper ? 0xffe066 : 0xff922b,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      }),
    );
    if (glb) {
      grp.add(glb, tracer);
      grp.scale.setScalar(scale);
      return grp;
    }
    const casing = new THREE.Mesh(
      getBulletCasingGeo(),
      new THREE.MeshToonMaterial({ color: spec.isSuper ? 0xffd43b : 0xe3a844 }),
    );
    const tip = new THREE.Mesh(
      getBulletTipGeo(),
      new THREE.MeshToonMaterial({
        color: spec.isSuper ? 0xff5247 : 0xd96b27,
        emissive: spec.isSuper ? 0x661500 : 0x2a0c00,
      }),
    );
    grp.add(casing, tip, tracer);
    grp.scale.setScalar(scale);
    return grp;
  }

  if (spec.brawlerId === 'buck') {
    if (spec.isSuper) {
      const blade = new THREE.Mesh(
        getCrescentBladeGeo(),
        new THREE.MeshToonMaterial({ color: 0xffd43b, emissive: 0x994400 }),
      );
      const inner = new THREE.Mesh(
        getCrescentBladeGeo(),
        new THREE.MeshBasicMaterial({ color: 0xfff3b0 }),
      );
      inner.scale.set(0.65, 1.15, 0.72);
      inner.position.x = 0.05;
      const trail = new THREE.Mesh(
        getTracerConeGeo(),
        new THREE.MeshBasicMaterial({ color: 0xff6b2b, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
      );
      trail.scale.set(0.85, 1.35, 1.35);
      grp.add(blade, inner, trail);
      grp.scale.setScalar(1.15);
      return grp;
    }

    const trail = new THREE.Mesh(
      getTracerConeGeo(),
      new THREE.MeshBasicMaterial({ color: 0xffae34, transparent: true, opacity: 0.58, side: THREE.DoubleSide }),
    );
    trail.scale.set(0.65, 0.85, 0.85);
    const glb = cloneModel('shotgun_shell');
    if (glb) {
      grp.add(glb, trail);
      return grp;
    }

    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.34, 10),
      new THREE.MeshToonMaterial({ color: spec.team === 'blue' ? 0x9b5cff : 0xff4757 }),
    );
    shell.rotation.z = -Math.PI / 2;
    const brassBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.11, 10),
      new THREE.MeshToonMaterial({ color: 0xffd24a }),
    );
    brassBase.rotation.z = -Math.PI / 2;
    brassBase.position.x = -0.17;
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.2, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff0a6 }),
    );
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.25;
    grp.add(shell, brassBase, nose, trail);
    return grp;
  }

  if (spec.brawlerId === 'vex') {
    const streak = new THREE.Mesh(
      getTracerConeGeo(),
      new THREE.MeshBasicMaterial({ color: 0x62e2ff, transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
    );
    streak.scale.set(1.25, 0.7, 0.7);
    const glb = cloneModel('sniper_bolt');
    if (glb) {
      grp.add(glb, streak);
      return grp;
    }
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.075, 0.88, 8),
      new THREE.MeshToonMaterial({ color: 0x36c9ff, emissive: 0x0a4d78 }),
    );
    shaft.rotation.z = -Math.PI / 2;
    const spearHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.38, 6),
      new THREE.MeshBasicMaterial({ color: 0xff5ea8 }),
    );
    spearHead.rotation.z = -Math.PI / 2;
    spearHead.position.x = 0.56;

    const finGeo = new THREE.BoxGeometry(0.28, 0.03, 0.28);
    const finMat = new THREE.MeshBasicMaterial({ color: 0x9ef0ff });
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.x = -0.34;
      fin.rotation.x = (i / 3) * Math.PI;
      grp.add(fin);
    }
    grp.add(shaft, spearHead, streak);
    return grp;
  }

  if (spec.brawlerId === 'golem') {
    const arc = new THREE.Mesh(
      getCrescentBladeGeo(),
      new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.72 }),
    );
    arc.position.x = 0.34;
    arc.scale.set(0.95, 1.0, 1.15);
    const glb = cloneModel('power_fist');
    if (glb) {
      grp.add(glb, arc);
      return grp;
    }
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.34, 0.42),
      new THREE.MeshToonMaterial({ color: 0xff9624, emissive: 0x5c2600 }),
    );
    palm.position.x = 0.1;
    const knuckles = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.26, 0.46),
      new THREE.MeshToonMaterial({ color: 0xffe57f }),
    );
    knuckles.position.x = 0.3;
    const thumb = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.14, 0.14),
      new THREE.MeshToonMaterial({ color: 0xff9624 }),
    );
    thumb.position.set(0.12, 0.14, 0.26);
    grp.add(palm, knuckles, thumb, arc);
    return grp;
  }

  if (spec.brawlerId === 'mort') {
    const glb = cloneModel('potion_flask');
    if (glb) {
      grp.add(glb);
      grp.scale.setScalar(spec.isSuper ? 1.28 : 1.1);
      return grp;
    }
    const glass = new THREE.Mesh(
      getFlaskGlassGeo(),
      new THREE.MeshToonMaterial({
        color: 0xd8f8ff,
        transparent: true,
        opacity: 0.58,
      }),
    );
    const liquid = new THREE.Mesh(
      getFlaskLiquidGeo(),
      new THREE.MeshBasicMaterial({
        color: spec.team === 'blue' ? 0x45f584 : 0xff4d7a,
      }),
    );
    const cork = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.072, 0.14, 8),
      new THREE.MeshToonMaterial({ color: 0x9c6631 }),
    );
    cork.position.y = 0.42;
    grp.add(liquid, glass, cork);
    grp.scale.setScalar(spec.isSuper ? 1.28 : 1.1);
    return grp;
  }

  // Lumi: Blender 3D music note + curved acoustic wave crescent
  const noteColor = spec.isHeal ? 0x4dffaa : spec.team === 'blue' ? 0xff4dc4 : 0xff5a6e;
  const arcColor = spec.isHeal ? 0xb8ffdf : teamTint;
  const wave = new THREE.Mesh(
    getCrescentBladeGeo(),
    new THREE.MeshBasicMaterial({
      color: arcColor,
      transparent: true,
      opacity: 0.72,
    }),
  );
  wave.scale.set(spec.isSuper ? 1.35 : 1.0, 1.0, spec.isSuper ? 1.45 : 1.05);
  wave.position.x = 0.12;

  const glbNote = cloneModel('music_note');
  if (glbNote) {
    glbNote.scale.setScalar(spec.isSuper ? 1.45 : 1.15);
    grp.add(glbNote, wave);
    return grp;
  }

  const note = new THREE.Mesh(
    getMusicNoteGeo(),
    new THREE.MeshToonMaterial({ color: noteColor, emissive: spec.isHeal ? 0x0a6638 : 0x52003a }),
  );
  note.scale.setScalar(spec.isSuper ? 1.45 : 1.15);
  grp.add(note, wave);
  return grp;
}
