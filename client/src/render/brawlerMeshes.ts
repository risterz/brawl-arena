import * as THREE from 'three';
import { BrawlerId, BRAWLERS, Team } from '@brawl-arena/shared';

export interface BrawlerVisual {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  teamRing: THREE.Mesh;
  superRing: THREE.Mesh;
  shieldDome: THREE.Mesh;
  materials: THREE.MeshToonMaterial[];
  setOpacity: (alpha: number) => void;
}

function makeToonMat(color: string | number, emissive = 0x000000): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    emissive,
    transparent: false,
    opacity: 1,
  });
}

export function createBrawlerMesh(
  brawlerId: BrawlerId,
  team: Team,
  isLocal: boolean,
): BrawlerVisual {
  const cfg = BRAWLERS[brawlerId];
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const materials: THREE.MeshToonMaterial[] = [];
  const addMat = (c: string | number, em = 0x000000) => {
    const m = makeToonMat(c, em);
    materials.push(m);
    return m;
  };

  const primaryMat = addMat(cfg.primaryColor);
  const accentMat = addMat(cfg.accentColor);
  const skinMat = addMat('#ffdbb5');
  const darkMat = addMat('#1d2233');
  const whiteMat = addMat('#ffffff');

  // Ground shadow disc
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.radius * 1.08, 20),
    new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  // Team ring under feet
  const ringColor = isLocal ? 0x4ef2ff : team === 'blue' ? 0x2aa4ff : 0xff4757;
  const teamRing = new THREE.Mesh(
    new THREE.RingGeometry(cfg.radius * 1.15, cfg.radius * 1.45, 28),
    new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false }),
  );
  teamRing.rotation.x = -Math.PI / 2;
  teamRing.position.y = 0.04;
  root.add(teamRing);

  // Golden Super-ready ring
  const superRing = new THREE.Mesh(
    new THREE.RingGeometry(cfg.radius * 1.52, cfg.radius * 1.78, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd43b, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  superRing.rotation.x = -Math.PI / 2;
  superRing.position.y = 0.05;
  superRing.visible = false;
  root.add(superRing);

  // Spawn invulnerability shield dome
  const shieldDome = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.radius * 1.85, 18, 14),
    new THREE.MeshBasicMaterial({
      color: 0x7ce8ff,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      wireframe: false,
    }),
  );
  shieldDome.position.y = 0.65;
  shieldDome.visible = false;
  root.add(shieldDome);

  // Scale body slightly by role (Golem chunky, Vex sleek)
  const bulk = brawlerId === 'golem' ? 1.24 : brawlerId === 'vex' ? 0.92 : 1.0;

  // Feet
  for (const side of [-0.18, 0.18]) {
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.11 * bulk, 0.12, 4, 8), darkMat);
    foot.position.set(side * bulk, 0.16, 0);
    foot.castShadow = true;
    bodyGroup.add(foot);
  }

  // Torso
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32 * bulk, 0.36 * bulk, 0.62 * bulk, 12),
    primaryMat,
  );
  torso.position.y = 0.56 * bulk;
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Belt / trim
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35 * bulk, 0.36 * bulk, 0.12, 12),
    accentMat,
  );
  belt.position.y = 0.38 * bulk;
  bodyGroup.add(belt);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3 * bulk, 14, 12), skinMat);
  head.position.y = 1.06 * bulk;
  head.castShadow = true;
  bodyGroup.add(head);

  // Expressive eyes facing +X (model forward = +X to match Math.atan2(dy, dx))
  for (const side of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055 * bulk, 8, 8), darkMat);
    eye.position.set(0.24 * bulk, 1.08 * bulk, side * bulk);
    bodyGroup.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.02 * bulk, 6, 6), whiteMat);
    glint.position.set(0.285 * bulk, 1.1 * bulk, (side - 0.015) * bulk);
    bodyGroup.add(glint);
  }

  // Brawler-specific iconic silhouettes & weapons (facing +X)
  if (brawlerId === 'buck') {
    // Ranger hat + bandana + chunky shotgun
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.07, 14), darkMat);
    brim.position.y = 1.3;
    bodyGroup.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.24, 12), primaryMat);
    crown.position.y = 1.44;
    bodyGroup.add(crown);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.17, 0.18), darkMat);
    gun.position.set(0.44, 0.62, 0.22);
    gun.castShadow = true;
    bodyGroup.add(gun);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 10), accentMat);
    muzzle.rotation.z = Math.PI / 2;
    muzzle.position.set(0.82, 0.62, 0.22);
    bodyGroup.add(muzzle);
  } else if (brawlerId === 'vex') {
    // Star visor + sleek sniper rifle + cape
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.44), accentMat);
    visor.position.set(0.18, 1.05, 0);
    bodyGroup.add(visor);
    const rifle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.12, 10), darkMat);
    rifle.rotation.z = Math.PI / 2;
    rifle.position.set(0.56, 0.62, 0.2);
    bodyGroup.add(rifle);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), accentMat);
    tip.position.set(1.12, 0.62, 0.2);
    bodyGroup.add(tip);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.56, 0.48), accentMat);
    cape.position.set(-0.34, 0.56, 0);
    cape.rotation.z = 0.22;
    bodyGroup.add(cape);
  } else if (brawlerId === 'blaze') {
    // Spiky golden hair + twin blasters
    const hair = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.36, 7), accentMat);
    hair.position.set(-0.04, 1.42, 0);
    hair.rotation.z = 0.25;
    bodyGroup.add(hair);
    for (const side of [-0.32, 0.32]) {
      const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.13, 0.12), darkMat);
      pistol.position.set(0.4, 0.62, side);
      bodyGroup.add(pistol);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.13), accentMat);
      barrel.position.set(0.64, 0.62, side);
      bodyGroup.add(barrel);
    }
  } else if (brawlerId === 'golem') {
    // Horned mask + huge shoulder pads + gauntlets
    const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.39, 0.28, 12), primaryMat);
    mask.position.y = 1.38;
    bodyGroup.add(mask);
    for (const side of [-0.3, 0.3]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 6), accentMat);
      horn.position.set(0.05, 1.62, side);
      horn.rotation.x = side > 0 ? 0.35 : -0.35;
      bodyGroup.add(horn);
      const gauntlet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), accentMat);
      gauntlet.position.set(0.42, 0.62, side * 1.45);
      gauntlet.castShadow = true;
      bodyGroup.add(gauntlet);
    }
  } else if (brawlerId === 'mort') {
    // Alchemist pointed hood + potion tank + glowing flask
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.48, 10), primaryMat);
    hood.position.set(-0.04, 1.42, 0);
    hood.rotation.z = 0.2;
    bodyGroup.add(hood);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 10), accentMat);
    tank.position.set(-0.36, 0.65, 0);
    bodyGroup.add(tank);
    const flask = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), accentMat);
    flask.position.set(0.42, 0.68, 0.28);
    bodyGroup.add(flask);
  } else if (brawlerId === 'lumi') {
    // Star crest hat + glowing synth guitar
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), accentMat);
    hat.position.y = 1.32;
    bodyGroup.add(hat);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), primaryMat);
    star.position.y = 1.48;
    bodyGroup.add(star);
    const guitarBody = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.12), accentMat);
    guitarBody.position.set(0.36, 0.56, 0.18);
    guitarBody.rotation.y = 0.35;
    bodyGroup.add(guitarBody);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.09, 0.08), darkMat);
    neck.position.set(0.68, 0.6, 0.04);
    neck.rotation.y = 0.35;
    bodyGroup.add(neck);
  }

  return {
    root,
    bodyGroup,
    teamRing,
    superRing,
    shieldDome,
    materials,
    setOpacity(alpha: number) {
      const transparent = alpha < 0.99;
      for (const m of materials) {
        if (m.transparent !== transparent || m.opacity !== alpha) {
          m.transparent = transparent;
          m.opacity = alpha;
          m.needsUpdate = true;
        }
      }
    },
  };
}
