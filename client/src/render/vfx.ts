import * as THREE from 'three';
import {
  AttackSpec,
  BRAWLERS,
  GemState,
  HazardZoneState,
  MatchState,
  ProjectileState,
} from '@brawl-arena/shared';

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  gravity: number;
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
  private projMeshes: Map<number, THREE.Mesh> = new Map();
  private hazardMeshes: Map<number, THREE.Mesh> = new Map();
  private gemMeshes: Map<number, THREE.Group> = new Map();
  private particles: Particle[] = [];
  private telegraphGroup: THREE.Group;
  private telegraphMesh: THREE.Mesh | null = null;
  private lastTelegraphKey = '';

  private boxGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
  private sphereGeo = new THREE.SphereGeometry(1, 10, 10);
  private gemGeo = new THREE.OctahedronGeometry(0.32, 0);
  private gemRingGeo = new THREE.RingGeometry(0.32, 0.45, 16);

  constructor(parent: THREE.Scene) {
    this.group = new THREE.Group();
    this.telegraphGroup = new THREE.Group();
    this.group.add(this.telegraphGroup);
    parent.add(this.group);
  }

  public clear(): void {
    for (const m of this.projMeshes.values()) this.group.remove(m);
    for (const m of this.hazardMeshes.values()) this.group.remove(m);
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

  public spawnWallRubble(tx: number, ty: number): void {
    const cx = tx + 0.5;
    const cz = ty + 0.5;
    const colors = [0xd49b54, 0x9b6830, 0xffe0a3];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 2.2 + Math.random() * 3.0;
      const mesh = new THREE.Mesh(
        this.boxGeo,
        new THREE.MeshToonMaterial({ color: colors[i % colors.length] }),
      );
      mesh.position.set(cx, 0.55 + Math.random() * 0.4, cz);
      mesh.scale.setScalar(0.7 + Math.random() * 0.7);
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: 4.0 + Math.random() * 3.2,
        vz: Math.sin(ang) * spd,
        life: 0.55 + Math.random() * 0.25,
        maxLife: 0.75,
        gravity: 16,
      });
    }
  }

  public spawnHitBurst(x: number, y: number, colorHex: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.6 + Math.random() * 2.8;
      const mesh = new THREE.Mesh(
        this.sphereGeo,
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9 }),
      );
      mesh.position.set(x, 0.7, y);
      mesh.scale.setScalar(0.11 + Math.random() * 0.08);
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: 2.2 + Math.random() * 2.0,
        vz: Math.sin(ang) * spd,
        life: 0.32 + Math.random() * 0.16,
        maxLife: 0.45,
        gravity: 10,
      });
    }
  }

  public updateTelegraph(input: AimTelegraphInput | null): void {
    if (!input || !input.active) {
      this.telegraphGroup.visible = false;
      return;
    }
    this.telegraphGroup.visible = true;
    const key = `${input.spec.shape}:${input.spec.range.toFixed(1)}:${input.spec.spreadRad.toFixed(2)}:${input.isSuper ? 1 : 0}`;
    if (key !== this.lastTelegraphKey || !this.telegraphMesh) {
      if (this.telegraphMesh) {
        this.telegraphGroup.remove(this.telegraphMesh);
        this.telegraphMesh.geometry.dispose();
      }
      const color = input.isSuper ? 0xffd43b : 0xffffff;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: input.isSuper ? 0.4 : 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      let geo: THREE.BufferGeometry;
      if (input.spec.shape === 'cone' || input.spec.shape === 'arc') {
        const spread = Math.max(0.35, input.spec.spreadRad);
        geo = new THREE.CircleGeometry(input.spec.range, 20, -spread / 2, spread);
        geo.rotateX(-Math.PI / 2);
      } else if (input.spec.shape === 'circle') {
        const r = Math.max(1.2, input.spec.puddleRadius ?? input.spec.radius);
        geo = new THREE.RingGeometry(0.15, r, 24);
        geo.rotateX(-Math.PI / 2);
      } else {
        const w = Math.max(0.45, input.spec.radius * 2.6);
        geo = new THREE.PlaneGeometry(input.spec.range, w);
        geo.translate(input.spec.range / 2, 0, 0);
        geo.rotateX(-Math.PI / 2);
      }

      this.telegraphMesh = new THREE.Mesh(geo, mat);
      this.telegraphGroup.add(this.telegraphMesh);
      this.lastTelegraphKey = key;
    }

    if (input.spec.shape === 'circle') {
      const dist = input.spec.range * 0.78;
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
    this.syncProjectiles(state.projectiles);
    this.syncHazards(state.hazards);
    this.syncGems(state.gems, state.elapsed);
    this.stepParticles(dt);
  }

  private syncProjectiles(projectiles: ProjectileState[]): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let mesh = this.projMeshes.get(p.id);
      if (!mesh) {
        const cfg = BRAWLERS[p.brawlerId];
        const color = p.isHeal
          ? 0x5effb1
          : p.isSuper
            ? 0xffd43b
            : p.team === 'blue'
              ? cfg.accentColor
              : '#ff5266';
        mesh = new THREE.Mesh(
          this.sphereGeo,
          new THREE.MeshBasicMaterial({ color }),
        );
        mesh.scale.set(p.radius * 1.15, p.radius * 0.9, p.radius * 1.15);
        this.group.add(mesh);
        this.projMeshes.set(p.id, mesh);
      }
      let py = 0.72;
      if (p.lobbed) {
        const t = Math.min(1, p.elapsed / Math.max(0.05, p.flightDuration));
        py = 0.7 + Math.sin(t * Math.PI) * 3.1;
      }
      mesh.position.set(p.x, py, p.y);
    }

    for (const [id, mesh] of this.projMeshes) {
      if (!seen.has(id)) {
        this.group.remove(mesh);
        this.projMeshes.delete(id);
      }
    }
  }

  private syncHazards(hazards: HazardZoneState[]): void {
    const seen = new Set<number>();
    for (const h of hazards) {
      seen.add(h.id);
      let mesh = this.hazardMeshes.get(h.id);
      if (!mesh) {
        if (h.kind === 'puddle') {
          const geo = new THREE.CircleGeometry(h.radius, 22);
          geo.rotateX(-Math.PI / 2);
          const color = h.team === 'blue' ? 0x45f584 : 0xff5a6e;
          mesh = new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.48, depthWrite: false }),
          );
          mesh.position.set(h.x, 0.06, h.y);
        } else {
          mesh = new THREE.Mesh(
            this.sphereGeo,
            new THREE.MeshToonMaterial({ color: 0xff4d6d, emissive: 0x550011 }),
          );
          mesh.scale.setScalar(0.32);
          mesh.position.set(h.x, 0.35, h.y);
        }
        this.group.add(mesh);
        this.hazardMeshes.set(h.id, mesh);
      }
      if (h.kind === 'bomb') {
        const pulse = 1 + Math.sin((1 - h.remaining / Math.max(0.1, h.duration)) * 24) * 0.22;
        mesh.scale.setScalar(0.32 * pulse);
      }
    }

    for (const [id, mesh] of this.hazardMeshes) {
      if (!seen.has(id)) {
        this.group.remove(mesh);
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
        grp = new THREE.Group();
        const crystal = new THREE.Mesh(
          this.gemGeo,
          new THREE.MeshToonMaterial({ color: 0xd946ff, emissive: 0x6200b3 }),
        );
        crystal.position.y = 0.52;
        crystal.castShadow = true;
        grp.add(crystal);

        const ring = new THREE.Mesh(
          this.gemRingGeo,
          new THREE.MeshBasicMaterial({ color: 0xf4a8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        grp.add(ring);

        this.group.add(grp);
        this.gemMeshes.set(g.id, grp);
      }
      const t = Math.min(1, g.popTimer / Math.max(0.01, g.popDuration));
      const gx = g.startX + (g.x - g.startX) * t;
      const gz = g.startY + (g.y - g.startY) * t;
      const popArc = Math.sin(t * Math.PI) * 1.65;
      grp.position.set(gx, 0, gz);
      const crystal = grp.children[0];
      crystal.position.y = 0.52 + popArc + Math.sin(elapsed * 4 + g.id) * 0.09;
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
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.08, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 7;
      p.mesh.rotation.y += dt * 5;
      next.push(p);
    }
    this.particles = next;
  }
}
