import * as THREE from 'three';
import { BrawlerId, BRAWLERS, getShopItem, Team } from '@brawl-arena/shared';
import { cloneAnimatedModel } from './modelBank';

export type BrawlerEmote = 'none' | 'victory' | 'defeat';

export interface BrawlerVisual {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  teamRing: THREE.Mesh;
  superRing: THREE.Mesh;
  shieldDome: THREE.Mesh;
  materials: THREE.Material[];
  hasAnimations: boolean;
  setOpacity: (alpha: number) => void;
  setEmote: (emote: BrawlerEmote, timeOffset?: number) => void;
  updateAnimation: (dt: number, isMoving: boolean, isAttacking: boolean) => void;
}

function makeToonMat(color: string | number, emissive = 0x000000): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    emissive,
    transparent: false,
    opacity: 1,
  });
}

function applyCosmeticSkinToMaterials(materials: THREE.Material[], skinId?: string | null): void {
  const spec = getShopItem(skinId)?.skinSpec;
  if (!spec) return;
  const tint = new THREE.Color(spec.tintHex);
  const emissive = new THREE.Color(spec.emissiveHex);

  for (const m of materials) {
    if (m.userData.isGlass) continue; // preserve translucent glass tank/flasks on Mort!
    if (m instanceof THREE.MeshStandardMaterial) {
      // Keep near-black outlines/eyes crisp while recoloring armor/clothing/weapons vividly
      const lum = m.color.r * 0.299 + m.color.g * 0.587 + m.color.b * 0.114;
      if (lum > 0.09) {
        m.color.lerp(tint, spec.tintStrength);
        m.emissive.copy(emissive);
        m.emissiveIntensity = spec.emissiveIntensity;
        m.metalness = Math.max(m.metalness, spec.metalness);
        m.roughness = Math.min(m.roughness, spec.roughness);
      }
    } else if (m instanceof THREE.MeshToonMaterial) {
      const lum = m.color.r * 0.299 + m.color.g * 0.587 + m.color.b * 0.114;
      if (lum > 0.09) {
        m.color.lerp(tint, spec.tintStrength);
        m.emissive.copy(emissive);
        m.emissiveIntensity = spec.emissiveIntensity * 0.85;
      }
    }
  }
}

export function createBrawlerMesh(
  brawlerId: BrawlerId,
  team: Team,
  isLocal: boolean,
  skinId?: string | null,
  ringId?: string | null,
): BrawlerVisual {
  const cfg = BRAWLERS[brawlerId];
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const materials: THREE.Material[] = [];
  const addMat = (c: string | number, em = 0x000000) => {
    const m = makeToonMat(c, em);
    materials.push(m);
    return m;
  };

  // Ground shadow disc
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.radius * 1.1, 20),
    new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  // Team ring under feet (supports custom Shop Aura Rings!)
  const customRing = getShopItem(ringId)?.ringSpec;
  const ringColor = customRing
    ? customRing.primaryHex
    : isLocal
      ? 0x4ef2ff
      : team === 'blue'
        ? 0x2aa4ff
        : 0xff4757;
  const teamRing = new THREE.Mesh(
    new THREE.RingGeometry(cfg.radius * 1.15, cfg.radius * (customRing ? 1.56 : 1.45), 28),
    new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.94, depthWrite: false }),
  );
  teamRing.rotation.x = -Math.PI / 2;
  teamRing.position.y = 0.04;
  root.add(teamRing);
  if (customRing) {
    const innerGlow = new THREE.Mesh(
      new THREE.RingGeometry(cfg.radius * 0.92, cfg.radius * 1.14, 28),
      new THREE.MeshBasicMaterial({
        color: customRing.secondaryHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    innerGlow.position.z = 0.005;
    teamRing.add(innerGlow);
  }

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
    }),
  );
  shieldDome.position.y = 0.65;
  shieldDome.visible = false;
  root.add(shieldDome);

  // Prefer Blender-modeled GLB character (with skeletal AnimationMixer when rigged!)
  const glbBundle = cloneAnimatedModel(brawlerId, true);
  if (glbBundle) {
    const { root: glbModel, animations } = glbBundle;
    glbModel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m) {
            if (m.userData.baseOpacity === undefined) {
              m.userData.baseOpacity = m.opacity;
              m.userData.baseTransparent = m.transparent;
            }
            materials.push(m);
          }
        }
      }
    });
    bodyGroup.add(glbModel);
    applyCosmeticSkinToMaterials(materials, skinId);

    let mixer: THREE.AnimationMixer | null = null;
    let idleAction: THREE.AnimationAction | null = null;
    let runAction: THREE.AnimationAction | null = null;
    let attackAction: THREE.AnimationAction | null = null;
    let victoryAction: THREE.AnimationAction | null = null;
    let defeatAction: THREE.AnimationAction | null = null;
    let currentBase: 'idle' | 'run' = 'idle';
    let activeEmote: BrawlerEmote = 'none';
    let attackActive = false;

    if (animations.length > 0) {
      mixer = new THREE.AnimationMixer(glbModel);
      const findClip = (name: string) =>
        animations.find((c) => c.name.toLowerCase().includes(name)) ?? null;
      const idleClip = findClip('idle') ?? animations[0];
      const runClip = findClip('run');
      const attackClip = findClip('attack');
      const victoryClip = findClip('victory');
      const defeatClip = findClip('defeat');

      if (idleClip) {
        idleAction = mixer.clipAction(idleClip);
        idleAction.play();
      }
      if (runClip) {
        runAction = mixer.clipAction(runClip);
        runAction.timeScale = 1.25;
      }
      if (attackClip) {
        attackAction = mixer.clipAction(attackClip);
        attackAction.setLoop(THREE.LoopOnce, 1);
        attackAction.clampWhenFinished = false;
        attackAction.timeScale = 1.35;
      }
      if (victoryClip) {
        victoryAction = mixer.clipAction(victoryClip);
        victoryAction.setLoop(THREE.LoopRepeat, Infinity);
      }
      if (defeatClip) {
        defeatAction = mixer.clipAction(defeatClip);
        defeatAction.setLoop(THREE.LoopRepeat, Infinity);
      }
    }

    return {
      root,
      bodyGroup,
      teamRing,
      superRing,
      shieldDome,
      materials,
      hasAnimations: mixer !== null,
      setOpacity(alpha: number) {
        for (const m of materials) {
          const baseOpacity = typeof m.userData.baseOpacity === 'number' ? m.userData.baseOpacity : 1;
          const baseTransparent = Boolean(m.userData.baseTransparent);
          const targetOpacity = baseOpacity * alpha;
          const targetTransparent = baseTransparent || targetOpacity < 0.99;
          if (m.transparent !== targetTransparent || Math.abs(m.opacity - targetOpacity) > 0.001) {
            m.transparent = targetTransparent;
            m.opacity = targetOpacity;
            m.needsUpdate = true;
          }
        }
      },
      setEmote(emote: BrawlerEmote, timeOffset = 0) {
        activeEmote = emote;
        if (!mixer) return;
        idleAction?.stop();
        runAction?.stop();
        attackAction?.stop();
        victoryAction?.stop();
        defeatAction?.stop();
        if (emote === 'victory' && victoryAction) {
          victoryAction.reset().play();
          victoryAction.time = timeOffset;
        } else if (emote === 'defeat' && defeatAction) {
          defeatAction.reset().play();
          defeatAction.time = timeOffset;
        } else if (idleAction) {
          idleAction.reset().play();
        }
      },
      updateAnimation(dt: number, isMoving: boolean, isAttacking: boolean) {
        if (!mixer) return;
        if (activeEmote !== 'none') {
          mixer.update(dt);
          return;
        }
        const desired: 'idle' | 'run' = isMoving && runAction ? 'run' : 'idle';
        if (desired !== currentBase) {
          const from = currentBase === 'run' ? runAction : idleAction;
          const to = desired === 'run' ? runAction : idleAction;
          if (to) {
            to.reset().fadeIn(0.12).play();
          }
          if (from && from !== to) {
            from.fadeOut(0.12);
          }
          currentBase = desired;
        }
        if (isAttacking && !attackActive && attackAction) {
          attackAction.reset().setEffectiveWeight(1).fadeIn(0.05).play();
        }
        attackActive = isAttacking;
        mixer.update(dt);
      },
    };
  }

  const primaryMat = addMat(cfg.primaryColor);
  const accentMat = addMat(cfg.accentColor);
  const skinMat = addMat('#ffdbb5');
  const darkMat = addMat('#1d2233');
  const steelMat = addMat('#7a8ca8');
  const woodMat = addMat('#8c5327');
  const whiteMat = addMat('#ffffff');

  const bulk = brawlerId === 'golem' ? 1.24 : brawlerId === 'vex' ? 0.92 : 1.0;

  // Sculpted boots with toe caps
  for (const side of [-0.18, 0.18]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24 * bulk, 0.18, 0.18 * bulk), darkMat);
    boot.position.set(0.04 * bulk, 0.1, side * bulk);
    boot.castShadow = true;
    bodyGroup.add(boot);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * bulk, 0.12 * bulk, 0.14, 8), accentMat);
    cuff.position.set(0, 0.22, side * bulk);
    bodyGroup.add(cuff);
  }

  // Torso jacket + collar + belt buckle
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31 * bulk, 0.36 * bulk, 0.62 * bulk, 12),
    primaryMat,
  );
  torso.position.y = 0.56 * bulk;
  torso.castShadow = true;
  bodyGroup.add(torso);

  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35 * bulk, 0.36 * bulk, 0.12, 12),
    darkMat,
  );
  belt.position.y = 0.38 * bulk;
  bodyGroup.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.18), accentMat);
  buckle.position.set(0.33 * bulk, 0.38 * bulk, 0);
  bodyGroup.add(buckle);

  // Articulated shoulders & arms
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.15 * bulk, 10, 8), primaryMat);
    shoulder.position.set(0.02, 0.78 * bulk, side * 0.36 * bulk);
    bodyGroup.add(shoulder);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085 * bulk, 0.22 * bulk, 4, 8), skinMat);
    arm.rotation.z = -Math.PI / 2.6;
    arm.position.set(0.18 * bulk, 0.66 * bulk, side * 0.36 * bulk);
    bodyGroup.add(arm);
  }

  // Head + expressive eyes & brow
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3 * bulk, 14, 12), skinMat);
  head.position.y = 1.06 * bulk;
  head.castShadow = true;
  bodyGroup.add(head);

  for (const side of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055 * bulk, 8, 8), darkMat);
    eye.position.set(0.24 * bulk, 1.08 * bulk, side * bulk);
    bodyGroup.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.02 * bulk, 6, 6), whiteMat);
    glint.position.set(0.285 * bulk, 1.1 * bulk, (side - 0.015) * bulk);
    bodyGroup.add(glint);
  }

  // Iconic detailed weapons & headgear per brawler (facing +X)
  if (brawlerId === 'buck') {
    // Ranger hat with gold band + double-barrel wooden-stock shotgun
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.07, 14), darkMat);
    brim.position.y = 1.3;
    bodyGroup.add(brim);
    const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.32, 0.07, 12), accentMat);
    hatBand.position.y = 1.36;
    bodyGroup.add(hatBand);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.24, 12), primaryMat);
    crown.position.y = 1.48;
    bodyGroup.add(crown);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.14), woodMat);
    stock.position.set(0.18, 0.58, 0.24);
    bodyGroup.add(stock);
    for (const zOff of [0.19, 0.29]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.62, 10), steelMat);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(0.56, 0.64, zOff);
      barrel.castShadow = true;
      bodyGroup.add(barrel);
    }
    const muzzleBand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.2), accentMat);
    muzzleBand.position.set(0.82, 0.64, 0.24);
    bodyGroup.add(muzzleBand);
  } else if (brawlerId === 'vex') {
    // Glowing star visor + scoped long-barrel star rifle + flowing cape
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.46), accentMat);
    visor.position.set(0.18, 1.05, 0);
    bodyGroup.add(visor);
    const rifle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.068, 1.18, 10), darkMat);
    rifle.rotation.z = Math.PI / 2;
    rifle.position.set(0.58, 0.62, 0.22);
    bodyGroup.add(rifle);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8), steelMat);
    scope.rotation.z = Math.PI / 2;
    scope.position.set(0.48, 0.75, 0.22);
    bodyGroup.add(scope);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 6), accentMat);
    tip.rotation.z = -Math.PI / 2;
    tip.position.set(1.22, 0.62, 0.22);
    bodyGroup.add(tip);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.5), accentMat);
    cape.position.set(-0.34, 0.56, 0);
    cape.rotation.z = 0.24;
    bodyGroup.add(cape);
  } else if (brawlerId === 'blaze') {
    // Dualist golden hair crest + twin detailed revolvers with chambers & grips
    const hair = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.38, 7), accentMat);
    hair.position.set(-0.04, 1.44, 0);
    hair.rotation.z = 0.25;
    bodyGroup.add(hair);
    for (const side of [-0.34, 0.34]) {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.08), woodMat);
      grip.position.set(0.24, 0.55, side);
      grip.rotation.z = 0.25;
      bodyGroup.add(grip);
      const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8), steelMat);
      chamber.rotation.z = Math.PI / 2;
      chamber.position.set(0.36, 0.65, side);
      bodyGroup.add(chamber);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.32, 8), accentMat);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(0.58, 0.67, side);
      bodyGroup.add(barrel);
    }
  } else if (brawlerId === 'golem') {
    // Horned titan helm + armored pauldrons + spiked power gauntlets
    const mask = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.4, 0.3, 12), primaryMat);
    mask.position.y = 1.38;
    bodyGroup.add(mask);
    for (const side of [-0.3, 0.3]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.36, 6), accentMat);
      horn.position.set(0.06, 1.64, side);
      horn.rotation.x = side > 0 ? 0.38 : -0.38;
      bodyGroup.add(horn);
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.26), darkMat);
      pauldron.position.set(0, 0.96, side * 1.55);
      bodyGroup.add(pauldron);
      const gauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.3), accentMat);
      gauntlet.position.set(0.44, 0.64, side * 1.5);
      gauntlet.castShadow = true;
      bodyGroup.add(gauntlet);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), steelMat);
      spike.rotation.z = -Math.PI / 2;
      spike.position.set(0.65, 0.64, side * 1.5);
      bodyGroup.add(spike);
    }
  } else if (brawlerId === 'mort') {
    // Alchemist hood + glass backpack tank with green liquid + corked flask in hand
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.37, 0.5, 10), primaryMat);
    hood.position.set(-0.04, 1.44, 0);
    hood.rotation.z = 0.2;
    bodyGroup.add(hood);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.46, 10), accentMat);
    tank.position.set(-0.36, 0.65, 0);
    bodyGroup.add(tank);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), woodMat);
    cap.position.set(-0.36, 0.9, 0);
    bodyGroup.add(cap);
    const flaskBulb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 10), accentMat);
    flaskBulb.position.set(0.42, 0.66, 0.28);
    bodyGroup.add(flaskBulb);
    const flaskCork = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 8), woodMat);
    flaskCork.position.set(0.42, 0.81, 0.28);
    bodyGroup.add(flaskCork);
  } else if (brawlerId === 'lumi') {
    // Star crest hat + V-body glowing synth guitar
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.08, 12), accentMat);
    hat.position.y = 1.32;
    bodyGroup.add(hat);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.19), primaryMat);
    star.position.y = 1.48;
    bodyGroup.add(star);
    const guitarBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.11), accentMat);
    guitarBody.position.set(0.36, 0.58, 0.2);
    guitarBody.rotation.y = 0.32;
    bodyGroup.add(guitarBody);
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), primaryMat);
    wing.rotation.z = Math.PI / 2;
    wing.position.set(0.16, 0.68, 0.28);
    bodyGroup.add(wing);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.085, 0.075), darkMat);
    neck.position.set(0.72, 0.62, 0.04);
    neck.rotation.y = 0.32;
    bodyGroup.add(neck);
    const headStock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.08), accentMat);
    headStock.position.set(1.02, 0.63, -0.06);
    headStock.rotation.y = 0.32;
    bodyGroup.add(headStock);
  }

  return {
    root,
    bodyGroup,
    teamRing,
    superRing,
    shieldDome,
    materials,
    hasAnimations: false,
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
    setEmote() {
      // Procedural fallback uses victoryStage bounce
    },
    updateAnimation() {
      // Procedural fallback uses arenaScene bob/recoil
    },
  };
}
