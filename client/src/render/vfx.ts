import * as THREE from 'three';
import {
  AttackSpec,
  GemState,
  HazardZoneState,
  MatchState,
  ProjectileState,
  raycastWallDistance,
} from '@brawl-arena/shared';
import {
  createBombVisual,
  createFlameGeometry,
  createGemCrystalVisual,
  createHealCrossGeometry,
  createProjectileVisual,
  createSparkShardGeometry,
} from './projectileMeshes';

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  gravity: number;
  spin: number;
  growRate: number;
  kind: 'rubble' | 'flame' | 'spark' | 'ring' | 'cross';
}

export interface AimTelegraphInput {
  active: boolean;
  isSuper: boolean;
  x: number;
  y: number;
  angle: number;
  spec: AttackSpec;
}

export class VfxManager {
  private group: THREE.Group;
  private projMeshes: Map<number, { obj: THREE.Group; lobbed: boolean; brawlerId: string }> = new Map();
  private hazardMeshes: Map<number, { obj: THREE.Group; kind: 'puddle' | 'bomb' }> = new Map();
  private gemMeshes: Map<number, THREE.Group> = new Map();
  private particles: Particle[] = [];
  private telegraphGroup: THREE.Group;
  private telegraphMesh: THREE.Mesh | null = null;
  private telegraphMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private lastTelegraphKey = '';

  // Shared sculpted particle geometries (zero plain spheres!)
  private plankGeo = new THREE.BoxGeometry(0.32, 0.1, 0.16);
  private ringGeo = new THREE.RingGeometry(0.28, 0.46, 20);
  private flameGeo = createFlameGeometry();
  private crossGeo = createHealCrossGeometry();
  private sparkGeo = createSparkShardGeometry();

  constructor(parent: THREE.Scene) {
    this.group = new THREE.Group();
    this.telegraphGroup = new THREE.Group();
    this.group.add(this.telegraphGroup);
    parent.add(this.group);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  public clear(): void {
    for (const p of this.projMeshes.values()) this.group.remove(p.obj);
    for (const h of this.hazardMeshes.values()) this.group.remove(h.obj);
    for (const g of this.gemMeshes.values()) this.group.remove(g);
    for (const p of this.particles) this.group.remove(p.mesh);
    this.projMeshes.clear();
    this.hazardMeshes.clear();
    this.gemMeshes.clear();
    this.particles = [];
    if (this.telegraphMesh) {
      this.telegraphGroup.remove(this.telegraphMesh);
      this.telegraphMesh.geometry.dispose();
      this.telegraphMesh = null;
      this.lastTelegraphKey = '';
    }
  }

  /** Fiery multi-tongue muzzle flash oriented along shot direction. */
  public spawnMuzzleFlash(x: number, y: number, angle: number, isSuper: boolean): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const count = isSuper ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.28;
      const a = angle + spread;
      const mat = new THREE.MeshBasicMaterial({
        color: i === Math.floor(count / 2) ? 0xfff3b0 : isSuper ? 0xffd43b : 0xff7b24,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(this.flameGeo, mat);
      mesh.position.set(x + cos * 0.52, 0.68, y + sin * 0.52);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = -a + Math.PI / 2;
      mesh.rotation.x = Math.PI / 2;
      const s = isSuper ? 0.9 : 0.58;
      mesh.scale.set(s * 0.7, s, s * 0.7);
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(a) * (isSuper ? 3.8 : 2.4),
        vy: 0.3,
        vz: Math.sin(a) * (isSuper ? 3.8 : 2.4),
        life: 0.14,
        maxLife: 0.14,
        gravity: 0,
        spin: 0,
        growRate: 1.5,
        kind: 'flame',
      });
    }
  }

  /** Shattered wooden planks + fiery burst ring when cover walls break. */
  public spawnWallRubble(tx: number, ty: number): void {
    const cx = tx + 0.5;
    const cz = ty + 0.5;
    const colors = [0xd49b54, 0x9b6830, 0x5d4037];
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2 + Math.random() * 0.35;
      const spd = 2.2 + Math.random() * 3.4;
      const mesh = new THREE.Mesh(
        this.plankGeo,
        new THREE.MeshToonMaterial({ color: colors[i % colors.length] }),
      );
      mesh.position.set(cx, 0.55 + Math.random() * 0.4, cz);
      mesh.scale.setScalar(0.75 + Math.random() * 0.65);
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: 4.2 + Math.random() * 3.0,
        vz: Math.sin(ang) * spd,
        life: 0.58 + Math.random() * 0.22,
        maxLife: 0.78,
        gravity: 16,
        spin: 8,
        growRate: 0,
        kind: 'rubble',
      });
    }
    this.spawnShockRing(cx, cz, 0xffb703, 2.4, 0.34);
  }

  /** Directional spark shards + crisp impact shockwave ring. */
  public spawnHitBurst(x: number, y: number, colorHex: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 2.6 + Math.random() * 2.8;
      const mesh = new THREE.Mesh(
        this.sparkGeo,
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 }),
      );
      mesh.position.set(x, 0.72, y);
      mesh.rotation.y = -ang;
      mesh.scale.setScalar(0.85 + Math.random() * 0.5);
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: 1.8 + Math.random() * 1.6,
        vz: Math.sin(ang) * spd,
        life: 0.26 + Math.random() * 0.12,
        maxLife: 0.36,
        gravity: 8,
        spin: 0,
        growRate: -1.4,
        kind: 'spark',
      });
    }
    this.spawnShockRing(x, y, colorHex, 1.35, 0.22);
  }

  /** Sculpted fiery teardrop flame burst + expanding shockwave ring for kills/explosions. */
  public spawnExplosion(x: number, y: number, primaryColor = 0xff6b2b, scale = 1.0): void {
    const flameColors = [0xfff3b0, 0xffd43b, primaryColor, 0xff4757];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const spd = (1.6 + Math.random() * 2.4) * scale;
      const mesh = new THREE.Mesh(
        this.flameGeo,
        new THREE.MeshBasicMaterial({
          color: flameColors[i % flameColors.length],
          transparent: true,
          opacity: 0.92,
        }),
      );
      mesh.position.set(x + Math.cos(ang) * 0.18, 0.42, y + Math.sin(ang) * 0.18);
      mesh.scale.set(0.95 * scale, (1.1 + Math.random() * 0.6) * scale, 0.95 * scale);
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: (2.6 + Math.random() * 2.2) * scale,
        vz: Math.sin(ang) * spd,
        life: 0.42 + Math.random() * 0.18,
        maxLife: 0.58,
        gravity: 3.5,
        spin: 0,
        growRate: 0.8,
        kind: 'flame',
      });
    }
    this.spawnHitBurst(x, y, 0xffe066, 8);
    this.spawnShockRing(x, y, primaryColor, 2.8 * scale, 0.36);
  }

  /** Rising 3D extruded emerald '+' heal crosses + expanding green aura ring. */
  public spawnHealBurst(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.random() * 0.4;
      const mesh = new THREE.Mesh(
        this.crossGeo,
        new THREE.MeshBasicMaterial({ color: 0x4dff9b, transparent: true, opacity: 0.95 }),
      );
      mesh.position.set(x + Math.cos(ang) * 0.35, 0.75 + i * 0.12, y + Math.sin(ang) * 0.35);
      mesh.scale.setScalar(0.85);
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * 0.55,
        vy: 1.9 + Math.random() * 0.6,
        vz: Math.sin(ang) * 0.55,
        life: 0.52,
        maxLife: 0.52,
        gravity: 0,
        spin: 4.5,
        growRate: -0.4,
        kind: 'cross',
      });
    }
    this.spawnShockRing(x, y, 0x4dff9b, 1.8, 0.32);
  }

  private spawnShockRing(x: number, y: number, colorHex: number, growRate: number, duration: number): void {
    const mesh = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    mesh.position.set(x, 0.09, y);
    mesh.scale.setScalar(0.5);
    this.group.add(mesh);
    this.particles.push({
      mesh,
      vx: 0,
      vy: 0,
      vz: 0,
      life: duration,
      maxLife: duration,
      gravity: 0,
      spin: 0,
      growRate,
      kind: 'ring',
    });
  }

  public updateTelegraph(input: AimTelegraphInput | null, grid?: Uint8Array): void {
    if (!input || !input.active) {
      this.telegraphGroup.visible = false;
      return;
    }
    this.telegraphGroup.visible = true;

    const clipToWalls = Boolean(grid && !input.spec.isHeal && !input.spec.lobbed && !input.spec.isLeap);
    if (clipToWalls && grid && (input.spec.shape === 'cone' || input.spec.shape === 'arc')) {
      // Dynamic wall-clipped shotgun/arc fan so aim cone never shines through solid crates!
      const spread = Math.max(0.35, input.spec.spreadRad);
      const rays = 14;
      const positions = new Float32Array((rays + 1) * 3);
      const indices: number[] = [];
      positions[0] = 0;
      positions[1] = 0;
      positions[2] = 0;
      for (let i = 0; i <= rays; i++) {
        const localA = -spread / 2 + (i / rays) * spread;
        const dist = raycastWallDistance(grid, input.x, input.y, input.angle + localA, input.spec.range, 0.14);
        const idx = (i + 1) * 3;
        positions[idx] = Math.cos(localA) * dist;
        positions[idx + 1] = 0;
        positions[idx + 2] = Math.sin(localA) * dist;
        if (i < rays) {
          indices.push(0, i + 1, i + 2);
        }
      }
      if (this.telegraphMesh) {
        this.telegraphGroup.remove(this.telegraphMesh);
        this.telegraphMesh.geometry.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);
      this.telegraphMat.color.setHex(input.isSuper ? 0xffd43b : 0xffffff);
      this.telegraphMat.opacity = input.isSuper ? 0.42 : 0.28;
      this.telegraphMesh = new THREE.Mesh(geo, this.telegraphMat);
      this.telegraphGroup.add(this.telegraphMesh);
      this.lastTelegraphKey = 'dynamic-cone';
      this.telegraphGroup.position.set(input.x, 0.07, input.y);
      this.telegraphGroup.rotation.y = -input.angle;
      return;
    }

    const effectiveRange =
      clipToWalls && grid && input.spec.shape === 'line'
        ? raycastWallDistance(grid, input.x, input.y, input.angle, input.spec.range, 0.14)
        : input.spec.range;

    const key = `${input.spec.shape}:${effectiveRange.toFixed(1)}:${input.spec.spreadRad.toFixed(2)}:${input.isSuper ? 1 : 0}`;
    if (key !== this.lastTelegraphKey || !this.telegraphMesh) {
      if (this.telegraphMesh) {
        this.telegraphGroup.remove(this.telegraphMesh);
        this.telegraphMesh.geometry.dispose();
      }
      this.telegraphMat.color.setHex(input.isSuper ? 0xffd43b : 0xffffff);
      this.telegraphMat.opacity = input.isSuper ? 0.42 : 0.28;

      let geo: THREE.BufferGeometry;
      if (input.spec.shape === 'cone' || input.spec.shape === 'arc') {
        const spread = Math.max(0.35, input.spec.spreadRad);
        geo = new THREE.CircleGeometry(effectiveRange, 20, -spread / 2, spread);
        geo.rotateX(-Math.PI / 2);
      } else if (input.spec.shape === 'circle') {
        const r = Math.max(1.2, input.spec.puddleRadius ?? input.spec.radius);
        geo = new THREE.RingGeometry(0.15, r, 24);
        geo.rotateX(-Math.PI / 2);
      } else {
        const w = Math.max(0.45, input.spec.radius * 2.6);
        geo = new THREE.PlaneGeometry(effectiveRange, w);
        geo.translate(effectiveRange / 2, 0, 0);
        geo.rotateX(-Math.PI / 2);
      }

      this.telegraphMesh = new THREE.Mesh(geo, this.telegraphMat);
      this.telegraphGroup.add(this.telegraphMesh);
      this.lastTelegraphKey = key;
    }

    if (input.spec.shape === 'circle') {
      const dist = input.spec.isLeap ? input.spec.range * 0.85 : input.spec.range * 0.78;
      this.telegraphGroup.position.set(
        input.x + Math.cos(input.angle) * dist,
        0.07,
        input.y + Math.sin(input.angle) * dist,
      );
      this.telegraphGroup.rotation.y = 0;
    } else {
      this.telegraphGroup.position.set(input.x, 0.07, input.y);
      this.telegraphGroup.rotation.y = -input.angle;
    }
  }

  public sync(state: MatchState, dt: number): void {
    this.syncProjectiles(state.projectiles, dt);
    this.syncHazards(state.hazards, state.elapsed);
    this.syncGems(state.gems, state.elapsed);
    this.stepParticles(dt);
  }

  private syncProjectiles(projectiles: ProjectileState[], dt: number): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let entry = this.projMeshes.get(p.id);
      if (!entry) {
        const obj = createProjectileVisual({
          brawlerId: p.brawlerId,
          team: p.team,
          isSuper: p.isSuper,
          isHeal: p.isHeal,
          radius: p.radius,
        });
        this.group.add(obj);
        entry = { obj, lobbed: p.lobbed, brawlerId: p.brawlerId };
        this.projMeshes.set(p.id, entry);
      }

      let py = 0.72;
      if (p.lobbed) {
        const t = Math.min(1, p.elapsed / Math.max(0.05, p.flightDuration));
        py = 0.7 + Math.sin(t * Math.PI) * 3.1;
        // Tumble corked potion flask end-over-end in mid-air
        entry.obj.rotation.x += dt * 9.5;
        entry.obj.rotation.z += dt * 6.5;
      } else {
        const heading = Math.atan2(p.vy, p.vx);
        entry.obj.rotation.y = -heading;
      }
      entry.obj.position.set(p.x, py, p.y);
    }

    for (const [id, entry] of this.projMeshes) {
      if (!seen.has(id)) {
        this.group.remove(entry.obj);
        this.projMeshes.delete(id);
      }
    }
  }

  private createPuddleVisual(h: HazardZoneState): THREE.Group {
    const grp = new THREE.Group();
    const baseColor = h.team === 'blue' ? 0x34e878 : 0xff4d6d;
    const rimColor = h.team === 'blue' ? 0x9bff4d : 0xff9eb0;

    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(h.radius, 22),
      new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.48, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.05;
    grp.add(pool);

    const rim = new THREE.Mesh(
      new THREE.RingGeometry(h.radius * 0.86, h.radius * 1.02, 22),
      new THREE.MeshBasicMaterial({ color: rimColor, side: THREE.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.06;
    grp.add(rim);

    // Bubbling cauldron droplets (3 sculpted rings/domes that animate vertically)
    const bubbleGeo = new THREE.TorusGeometry(0.14, 0.05, 6, 10);
    bubbleGeo.rotateX(Math.PI / 2);
    const bubbleMat = new THREE.MeshBasicMaterial({ color: rimColor, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.4;
      const dist = h.radius * (0.28 + (i % 2) * 0.28);
      const b = new THREE.Mesh(bubbleGeo, bubbleMat);
      b.name = `puddle-bubble-${i}`;
      b.position.set(Math.cos(ang) * dist, 0.14, Math.sin(ang) * dist);
      grp.add(b);
    }

    grp.position.set(h.x, 0, h.y);
    return grp;
  }

  private syncHazards(hazards: HazardZoneState[], elapsed: number): void {
    const seen = new Set<number>();
    for (const h of hazards) {
      seen.add(h.id);
      let entry = this.hazardMeshes.get(h.id);
      if (!entry) {
        const obj = h.kind === 'puddle' ? this.createPuddleVisual(h) : createBombVisual();
        if (h.kind === 'bomb') obj.position.set(h.x, 0, h.y);
        this.group.add(obj);
        entry = { obj, kind: h.kind };
        this.hazardMeshes.set(h.id, entry);
      }
      if (h.kind === 'bomb') {
        const pulse = 1 + Math.sin((1 - h.remaining / Math.max(0.1, h.duration)) * 26) * 0.16;
        entry.obj.scale.setScalar(pulse);
        const flame = entry.obj.getObjectByName('bomb-flame');
        if (flame) {
          flame.scale.set(
            0.42 + Math.sin(elapsed * 32) * 0.1,
            0.34 + Math.cos(elapsed * 28) * 0.12,
            0.42 + Math.sin(elapsed * 32) * 0.1,
          );
        }
      } else {
        // Animate acid puddle bubbles popping upward
        for (let i = 0; i < 4; i++) {
          const b = entry.obj.getObjectByName(`puddle-bubble-${i}`);
          if (b) {
            const phase = (elapsed * 2.4 + i * 0.7) % 1;
            b.position.y = 0.08 + phase * 0.36;
            b.scale.setScalar(0.55 + Math.sin(phase * Math.PI) * 0.75);
          }
        }
      }
    }

    for (const [id, entry] of this.hazardMeshes) {
      if (!seen.has(id)) {
        if (entry.kind === 'bomb') {
          this.spawnExplosion(entry.obj.position.x, entry.obj.position.z, 0xff5ea8, 0.9);
        }
        this.group.remove(entry.obj);
        this.hazardMeshes.delete(id);
      }
    }
  }

  private syncGems(gems: GemState[], elapsed: number): void {
    const seen = new Set<number>();
    for (const g of gems) {
      seen.add(g.id);
      let grp = this.gemMeshes.get(g.id);
      if (!grp) {
        grp = createGemCrystalVisual();
        this.group.add(grp);
        this.gemMeshes.set(g.id, grp);
      }
      const t = Math.min(1, g.popTimer / Math.max(0.01, g.popDuration));
      const gx = g.startX + (g.x - g.startX) * t;
      const gz = g.startY + (g.y - g.startY) * t;
      const popArc = Math.sin(t * Math.PI) * 1.65;
      grp.position.set(gx, 0, gz);
      const crystal = grp.getObjectByName('gem-core') ?? grp.children[0];
      crystal.position.y = 0.56 + popArc + Math.sin(elapsed * 4 + g.id) * 0.1;
      crystal.rotation.y = elapsed * 2.4 + g.id;
    }

    for (const [id, grp] of this.gemMeshes) {
      if (!seen.has(id)) {
        this.group.remove(grp);
        this.gemMeshes.delete(id);
      }
    }
  }

  private stepParticles(dt: number): void {
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        continue;
      }
      const lifeRatio = p.life / p.maxLife;
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.07, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;

      if (p.spin !== 0) {
        if (p.kind === 'cross') {
          p.mesh.rotation.y += dt * p.spin;
        } else {
          p.mesh.rotation.x += dt * p.spin;
          p.mesh.rotation.y += dt * p.spin * 0.7;
        }
      }

      if (p.growRate !== 0) {
        const s = Math.max(0.05, p.mesh.scale.x + p.growRate * dt);
        if (p.kind === 'ring') {
          p.mesh.scale.setScalar(s);
        } else {
          p.mesh.scale.setScalar(Math.max(0.05, s));
        }
      }

      const mat = p.mesh.material;
      if (mat instanceof THREE.MeshBasicMaterial && mat.transparent) {
        mat.opacity = Math.max(0, Math.min(0.95, lifeRatio));
      }

      next.push(p);
    }
    this.particles = next;
  }
}
