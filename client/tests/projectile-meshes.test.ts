import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { BRAWLER_LIST } from '@brawl-arena/shared';
import {
  createProjectileVisual,
  createBombVisual,
  createGemCrystalVisual,
  createFlameGeometry,
  createHealCrossGeometry,
} from '../src/render/projectileMeshes';
import {
  MODEL_MANIFEST,
  ModelKey,
  cloneModel,
  cloneAnimatedModel,
  applyCartoonColorCorrection,
  registerModelForTest,
  clearModelsForTest,
} from '../src/render/modelBank';
import { createBrawlerMesh } from '../src/render/brawlerMeshes';

describe('Sculpted 3D projectile, bomb, crystal, flame, and heal meshes', () => {
  it('builds distinct multi-part sculpted visuals (not plain spheres) for every brawler primary and Super', () => {
    for (const b of BRAWLER_LIST) {
      for (const isSuper of [false, true]) {
        const visual = createProjectileVisual({
          brawlerId: b.id,
          team: 'blue',
          isSuper,
          isHeal: b.id === 'lumi' && isSuper,
          radius: 0.25,
        });
        expect(visual).toBeInstanceOf(THREE.Group);
        expect(visual.children.length).toBeGreaterThanOrEqual(2);
        expect(visual.name).toContain(b.id);
      }
    }
    const kageSuper = createProjectileVisual({
      brawlerId: 'kage',
      team: 'blue',
      isSuper: true,
      isHeal: false,
      radius: 0.62,
    });
    expect(kageSuper.children.length).toBeGreaterThanOrEqual(3);
  });

  it('builds a cartoon iron bomb with fuse and flame tip, a faceted gem crystal, a teardrop flame, and a 3D heal cross', () => {
    const bomb = createBombVisual();
    expect(bomb).toBeInstanceOf(THREE.Group);
    expect(bomb.getObjectByName('bomb-fuse')).toBeDefined();
    expect(bomb.getObjectByName('bomb-flame')).toBeDefined();

    const gem = createGemCrystalVisual();
    expect(gem).toBeInstanceOf(THREE.Group);
    expect(gem.children.length).toBeGreaterThanOrEqual(2);

    const flameGeo = createFlameGeometry();
    expect(flameGeo.attributes.position.count).toBeGreaterThan(20);

    const crossGeo = createHealCrossGeometry();
    expect(crossGeo.attributes.position.count).toBeGreaterThan(20);
  });

  it('has all 23 Blender GLB models and 7 brawler portraits present and isolates cloned materials when requested', () => {
    const keys = Object.keys(MODEL_MANIFEST) as ModelKey[];
    expect(keys).toHaveLength(23);
    const modelsDir = path.resolve(__dirname, '../public/models');
    for (const k of keys) {
      const rel = MODEL_MANIFEST[k].replace(/^\/models\//, '');
      const fullPath = path.join(modelsDir, rel);
      expect(fs.existsSync(fullPath), `Missing GLB: ${fullPath}`).toBe(true);
      expect(fs.statSync(fullPath).size).toBeGreaterThan(1000);
    }

    const portraitsDir = path.resolve(__dirname, '../public/portraits');
    for (const b of BRAWLER_LIST) {
      const pPath = path.join(portraitsDir, `${b.id}.png`);
      expect(fs.existsSync(pPath), `Missing portrait: ${pPath}`).toBe(true);
      expect(fs.statSync(pPath).size).toBeGreaterThan(1000);
    }

    clearModelsForTest();
    const proto = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    proto.add(mesh);
    registerModelForTest('buck', proto);

    const c1 = cloneModel('buck', true)!;
    const c2 = cloneModel('buck', true)!;
    expect(c1).not.toBeNull();
    expect((c1.children[0] as THREE.Mesh).material).not.toBe((c2.children[0] as THREE.Mesh).material);
    clearModelsForTest();

    // Verify balanced cartoon gamma (~1.45) deepens pastel midtones without crushing darks
    const testGrp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.2 });
    mat.color.setRGB(0.5, 0.5, 0.5);
    testGrp.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
    applyCartoonColorCorrection(testGrp);
    expect(mat.color.r).toBeGreaterThan(0.30);
    expect(mat.color.r).toBeLessThan(0.42);
    expect(mat.metalness).toBeLessThanOrEqual(0.28);

    // Verify rigged GLB animations wire cleanly into BrawlerVisual
    const rigProto = new THREE.Group();
    rigProto.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const idleClip = new THREE.AnimationClip('Idle', 1.0, []);
    const runClip = new THREE.AnimationClip('Run', 0.8, []);
    const atkClip = new THREE.AnimationClip('Attack', 0.4, []);
    registerModelForTest('buck', rigProto, [idleClip, runClip, atkClip]);

    const clonedRig = cloneAnimatedModel('buck', true)!;
    expect(clonedRig.animations).toHaveLength(3);
    const visual = createBrawlerMesh('buck', 'blue', true);
    expect(visual.hasAnimations).toBe(true);
    visual.updateAnimation(0.016, true, false);
    visual.updateAnimation(0.016, true, true);
    clearModelsForTest();
  });

  it('rigs kage.glb as a real SkinnedMesh with hip/knee/arm joints and forward-backward leg stride in Run', () => {
    const glbPath = path.resolve(__dirname, '../public/models/kage.glb');
    const buf = fs.readFileSync(glbPath);
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
    const binStart = 20 + jsonLen + 8;

    // 1. Must export a real skeletal Skin bound to at least one SkinnedMesh primitive (matching buck.glb)
    expect(Array.isArray(gltf.skins) && gltf.skins.length).toBeGreaterThanOrEqual(1);
    const skinnedNodes = gltf.nodes.filter((n: { skin?: number }) => n.skin !== undefined);
    const skinnedPrims = gltf.meshes
      .flatMap((m: { primitives: Array<{ attributes: Record<string, number> }> }) => m.primitives)
      .filter((p: { attributes: Record<string, number> }) => p.attributes.JOINTS_0 !== undefined && p.attributes.WEIGHTS_0 !== undefined);
    expect(skinnedNodes.length).toBeGreaterThanOrEqual(1);
    expect(skinnedPrims.length).toBeGreaterThanOrEqual(1);
    const jointNames: string[] = gltf.skins[0].joints.map((idx: number) => gltf.nodes[idx].name);
    for (const required of [
      'Pelvis',
      'Spine',
      'Head',
      'UpperArm.L',
      'Forearm.L',
      'UpperArm.R',
      'Forearm.R',
      'Thigh.L',
      'Shin.L',
      'Foot.L',
      'Thigh.R',
      'Shin.R',
      'Foot.R',
    ]) {
      expect(jointNames, `Missing skin joint ${required}`).toContain(required);
    }

    // 2. Run clip must swing Thigh.L and bend Shin.L around the side-to-side Z hinge (not axial Y twist!)
    const runAnim = (gltf.animations ?? []).find((a: { name: string }) => a.name.toLowerCase().includes('run'));
    expect(runAnim).toBeDefined();

    const readQuatSpan = (boneName: string) => {
      const nodeIdx = gltf.nodes.findIndex((n: { name: string }) => n.name === boneName);
      expect(nodeIdx).toBeGreaterThanOrEqual(0);
      const ch = runAnim.channels.find(
        (c: { target: { node: number; path: string } }) => c.target.node === nodeIdx && c.target.path === 'rotation',
      );
      expect(ch, `Missing rotation channel for ${boneName}`).toBeDefined();
      const sampler = runAnim.samplers[ch.sampler];
      const acc = gltf.accessors[sampler.output];
      const bv = gltf.bufferViews[acc.bufferView];
      const offset = binStart + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < acc.count; i++) {
        const qz = buf.readFloatLE(offset + i * 16 + 8); // quaternion z component (local Z hinge)
        minZ = Math.min(minZ, qz);
        maxZ = Math.max(maxZ, qz);
      }
      return maxZ - minZ;
    };

    // Thigh must swing strongly forward/back, Shin bends at knee, Foot rolls at ankle
    expect(readQuatSpan('Thigh.L')).toBeGreaterThan(0.35);
    expect(readQuatSpan('Thigh.R')).toBeGreaterThan(0.35);
    expect(readQuatSpan('Shin.L')).toBeGreaterThan(0.15);
    expect(readQuatSpan('Shin.R')).toBeGreaterThan(0.15);
    expect(readQuatSpan('Foot.L')).toBeGreaterThan(0.15);
    expect(readQuatSpan('Foot.R')).toBeGreaterThan(0.15);
  });
});
