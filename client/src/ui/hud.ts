import {
  isBrawlerVisibleToTeam,
  MatchEvent,
  MatchState,
  Team,
} from '@brawl-arena/shared';
import { CombatFeedTracker } from './combatFeed';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface HudCallbacks {
  onToggleMute: () => boolean;
  onToggleBgm: () => boolean;
  isSfxMuted: () => boolean;
  isBgmMuted: () => boolean;
  onLeave: () => void;
  onSuperReady?: () => void;
}

export class MatchHud {
  private container: HTMLElement;
  private onSuperReady?: () => void;
  private isSfxMuted: () => boolean;
  private isBgmMuted: () => boolean;
  private blueIconEl!: HTMLElement;
  private redIconEl!: HTMLElement;
  private blueScoreEl!: HTMLElement;
  private redScoreEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private countdownEl!: HTMLElement;
  private bgmBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private hintEl!: HTMLElement;
  private superMeterEl!: HTMLElement;
  private superArcEl!: SVGCircleElement;
  private superPctEl!: HTMLElement;
  private superSubEl!: HTMLElement;
  private tackleMeterEl!: HTMLElement;
  private tackleValEl!: HTMLElement;
  private tackleSubEl!: HTMLElement;
  private barsContainer!: HTMLDivElement;
  private floatersContainer!: HTMLDivElement;
  private killFeedEl!: HTMLDivElement;
  private announcerEl!: HTMLDivElement;
  private barNodes: Map<number, HTMLDivElement> = new Map();
  private floaterNodes: Map<number, HTMLDivElement> = new Map();
  private combatFeed = new CombatFeedTracker();
  private lastFeedSig = '';
  private lastBannerId = -1;
  private lastSuperReady = false;
  private isTouch = false;

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.container = container;
    this.onSuperReady = callbacks.onSuperReady;
    this.isSfxMuted = callbacks.isSfxMuted;
    this.isBgmMuted = callbacks.isBgmMuted;
    this.container.innerHTML = `
      <div class="hud-top">
        <div class="gem-score blue"><span id="hud-blue-icon">💎</span> <span id="hud-blue-gems">0</span></div>
        <div class="hud-timer" id="hud-timer">03:30</div>
        <div class="gem-score red"><span id="hud-red-gems">0</span> <span id="hud-red-icon">💎</span></div>
      </div>
      <div class="hud-corner-tools">
        <button id="hud-bgm-btn" class="btn btn-dark btn-sm">🎵 BGM</button>
        <button id="hud-mute-btn" class="btn btn-dark btn-sm">🔊 SFX</button>
        <button id="hud-leave-btn" class="btn btn-red btn-sm">Leave</button>
      </div>
      <div id="hud-countdown" class="countdown-banner hidden"></div>
      <div id="hud-announcer" class="announcer-banner hidden"></div>
      <div id="hud-killfeed" class="hud-killfeed"></div>
      <div id="hud-bars"></div>
      <div id="hud-floaters" class="hud-floaters"></div>
      <div id="hud-tackle-meter" class="tackle-meter hidden">
        <div class="tackle-icon">💨</div>
        <div id="hud-tackle-val" class="tackle-val">TACKLE</div>
        <div id="hud-tackle-sub" class="tackle-sub">SHIFT / E</div>
      </div>
      <div id="hud-super-meter" class="super-meter">
        <svg class="super-ring-svg" viewBox="0 0 100 100">
          <circle class="super-ring-bg" cx="50" cy="50" r="42" />
          <circle id="hud-super-arc" class="super-ring-fill" cx="50" cy="50" r="42" />
        </svg>
        <div class="super-meter-inner">
          <div class="super-bolt">⚡</div>
          <div id="hud-super-pct" class="super-pct">0%</div>
          <div id="hud-super-sub" class="super-sub">SUPER</div>
        </div>
      </div>
      <div id="hud-hint" class="controls-hint">WASD Move • Mouse Aim &amp; Click Shoot • Space/Right-Click Super • Q Auto-Aim</div>
    `;

    this.blueIconEl = this.container.querySelector('#hud-blue-icon')!;
    this.redIconEl = this.container.querySelector('#hud-red-icon')!;
    this.blueScoreEl = this.container.querySelector('#hud-blue-gems')!;
    this.redScoreEl = this.container.querySelector('#hud-red-gems')!;
    this.timerEl = this.container.querySelector('#hud-timer')!;
    this.countdownEl = this.container.querySelector('#hud-countdown')!;
    this.bgmBtn = this.container.querySelector('#hud-bgm-btn')!;
    this.muteBtn = this.container.querySelector('#hud-mute-btn')!;
    this.hintEl = this.container.querySelector('#hud-hint')!;
    this.superMeterEl = this.container.querySelector('#hud-super-meter')!;
    this.superArcEl = this.container.querySelector('#hud-super-arc')!;
    this.superPctEl = this.container.querySelector('#hud-super-pct')!;
    this.superSubEl = this.container.querySelector('#hud-super-sub')!;
    this.tackleMeterEl = this.container.querySelector('#hud-tackle-meter')!;
    this.tackleValEl = this.container.querySelector('#hud-tackle-val')!;
    this.tackleSubEl = this.container.querySelector('#hud-tackle-sub')!;
    this.barsContainer = this.container.querySelector('#hud-bars')!;
    this.floatersContainer = this.container.querySelector('#hud-floaters')!;
    this.killFeedEl = this.container.querySelector('#hud-killfeed')!;
    this.announcerEl = this.container.querySelector('#hud-announcer')!;

    this.bgmBtn.addEventListener('click', () => {
      const muted = callbacks.onToggleBgm();
      this.bgmBtn.textContent = muted ? '🔇 BGM' : '🎵 BGM';
    });

    this.muteBtn.addEventListener('click', () => {
      const muted = callbacks.onToggleMute();
      this.muteBtn.textContent = muted ? '🔇 SFX' : '🔊 SFX';
    });

    this.container.querySelector('#hud-leave-btn')!.addEventListener('click', () => {
      callbacks.onLeave();
    });
  }

  public setTouchMode(isTouch: boolean): void {
    this.isTouch = isTouch;
    this.hintEl.classList.toggle('hidden', isTouch);
    this.superMeterEl.classList.toggle('hidden', isTouch);
    if (isTouch) {
      this.tackleMeterEl.classList.add('hidden');
    }
  }

  public show(isTouch: boolean): void {
    this.container.classList.remove('hidden');
    this.setTouchMode(isTouch);
    this.bgmBtn.textContent = this.isBgmMuted() ? '🔇 BGM' : '🎵 BGM';
    this.muteBtn.textContent = this.isSfxMuted() ? '🔇 SFX' : '🔊 SFX';
    this.lastSuperReady = false;
    this.resetCombatFeed();
  }

  public hide(): void {
    this.container.classList.add('hidden');
    this.barsContainer.innerHTML = '';
    this.barNodes.clear();
    this.lastSuperReady = false;
    this.resetCombatFeed();
  }

  private resetCombatFeed(): void {
    this.combatFeed.clear();
    this.floatersContainer.innerHTML = '';
    this.floaterNodes.clear();
    this.killFeedEl.innerHTML = '';
    this.announcerEl.classList.add('hidden');
    this.lastFeedSig = '';
    this.lastBannerId = -1;
  }

  public ingestEvents(events: MatchEvent[], state: MatchState | null, localSlot: number): void {
    this.combatFeed.ingest(events, state, localSlot);
  }

  public update(
    state: MatchState,
    localSlot: number,
    dt: number,
    project: (wx: number, wy: number, heightY: number) => { x: number; y: number; visible: boolean },
  ): void {
    this.combatFeed.update(dt);
    const isBall = state.mode === 'brawl-ball';
    const scoreIcon = isBall ? '⚽' : '💎';
    if (this.blueIconEl.textContent !== scoreIcon) {
      this.blueIconEl.textContent = scoreIcon;
      this.redIconEl.textContent = scoreIcon;
      this.hintEl.textContent = isBall
        ? 'WASD Move • Click Kick/Shoot • Space/RMB Super-Kick • Shift/E Tackle Steal'
        : 'WASD Move • Mouse Aim & Click Shoot • Space/Right-Click Super • Q Auto-Aim';
    }

    this.blueScoreEl.textContent = String(state.blueGems);
    this.redScoreEl.textContent = String(state.redGems);

    if (state.phase === 'sudden_death') {
      this.timerEl.textContent = `${isBall ? 'OT' : 'SD'} ${Math.ceil(state.suddenDeathRemaining)}s`;
    } else {
      const rem = Math.max(0, Math.ceil(state.maxDuration - state.elapsed));
      const mm = Math.floor(rem / 60);
      const ss = rem % 60;
      this.timerEl.textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }

    if (isBall && state.goalResetTimer > 0 && state.lastGoalTeam) {
      this.countdownEl.classList.remove('hidden', 'blue', 'red', 'gold');
      this.countdownEl.classList.add(state.lastGoalTeam);
      const label = state.lastGoalTeam === 'blue' ? 'BLUE' : 'RED';
      this.countdownEl.textContent = `⚽ ${label} SCORED!`;
    } else if (isBall && state.phase === 'sudden_death') {
      this.countdownEl.classList.remove('hidden', 'blue', 'red', 'gold');
      this.countdownEl.classList.add('gold');
      this.countdownEl.textContent = `⚡ OVERTIME — NEXT GOAL WINS!`;
    } else if (state.countdownTeam) {
      this.countdownEl.classList.remove('hidden', 'blue', 'red', 'gold');
      this.countdownEl.classList.add(state.countdownTeam);
      const label = state.countdownTeam === 'blue' ? 'BLUE' : 'RED';
      this.countdownEl.textContent = `${label} COUNTDOWN — ${Math.ceil(state.countdownTimer)}s`;
    } else {
      this.countdownEl.classList.add('hidden');
    }

    const local = state.brawlers[localSlot];
    const viewerTeam: Team = local ? local.team : 'blue';

    // Update desktop circular Super/Ultimate energy gauge (0% -> 100% READY!)
    if (local) {
      const pct = Math.max(0, Math.min(100, Math.round(local.superCharge)));
      const ready = pct >= 100;
      const circumference = 2 * Math.PI * 42;
      const offset = circumference * (1 - pct / 100);
      this.superArcEl.style.strokeDasharray = `${circumference.toFixed(1)}`;
      this.superArcEl.style.strokeDashoffset = `${offset.toFixed(1)}`;
      this.superMeterEl.classList.toggle('ready', ready);
      if (ready) {
        this.superPctEl.textContent = 'READY!';
        this.superSubEl.textContent = 'SPACE / RMB';
      } else {
        this.superPctEl.textContent = `${pct}%`;
        this.superSubEl.textContent = 'SUPER';
      }
      if (ready && !this.lastSuperReady) {
        this.superMeterEl.classList.add('just-ready');
        this.onSuperReady?.();
        window.setTimeout(() => this.superMeterEl.classList.remove('just-ready'), 550);
      }
      this.lastSuperReady = ready;

      // Update Brawl Ball desktop Tackle cooldown badge
      const showTackleHud = isBall && !this.isTouch;
      this.tackleMeterEl.classList.toggle('hidden', !showTackleHud);
      if (showTackleHud) {
        const carrying = state.ball?.holderSlot === local.slotIndex;
        const tackleReady = !carrying && local.tackleCooldown <= 0.01;
        this.tackleMeterEl.classList.toggle('ready', tackleReady);
        if (carrying) {
          this.tackleValEl.textContent = 'DRIBBLE';
          this.tackleSubEl.textContent = 'CLICK KICK';
        } else if (tackleReady) {
          this.tackleValEl.textContent = 'TACKLE';
          this.tackleSubEl.textContent = 'SHIFT / E';
        } else {
          this.tackleValEl.textContent = `${local.tackleCooldown.toFixed(1)}s`;
          this.tackleSubEl.textContent = 'COOLDOWN';
        }
      }
    }

    for (const b of state.brawlers) {
      let node = this.barNodes.get(b.slotIndex);
      if (!node) {
        node = document.createElement('div');
        node.className = 'overhead-bar';
        this.barsContainer.appendChild(node);
        this.barNodes.set(b.slotIndex, node);
      }

      const visible = b.alive && isBrawlerVisibleToTeam(state, b, viewerTeam);
      if (!visible) {
        node.style.display = 'none';
        continue;
      }

      const pos = project(b.x, b.y, 1.95);
      if (!pos.visible) {
        node.style.display = 'none';
        continue;
      }

      node.style.display = 'flex';
      node.style.left = `${pos.x.toFixed(1)}px`;
      node.style.top = `${pos.y.toFixed(1)}px`;

      const hpPct = Math.max(0, Math.min(100, (b.hp / b.maxHp) * 100));
      const hpColor = b.slotIndex === localSlot ? '#32e276' : b.team === viewerTeam ? '#38b6ff' : '#ff4757';
      const hasBall = isBall && state.ball?.holderSlot === b.slotIndex;
      const gemHtml = hasBall
        ? `<div class="overhead-gems">⚽ BALL</div>`
        : b.gems > 0
          ? `<div class="overhead-gems">💎 ${b.gems}</div>`
          : '';
      let ammoHtml = '';
      if (b.slotIndex === localSlot) {
        const segs = [0, 1, 2]
          .map((idx) => {
            const fill = Math.max(0, Math.min(1, b.ammo - idx)) * 100;
            return `<div class="ammo-seg"><div class="ammo-seg-fill" style="width:${fill.toFixed(0)}%"></div></div>`;
          })
          .join('');
        ammoHtml = `<div class="ammo-row">${segs}</div>`;
      }

      node.innerHTML = `
        ${gemHtml}
        <div class="overhead-name">${escapeHtml(b.name)}</div>
        <div class="hp-track"><div class="hp-fill" style="width:${hpPct.toFixed(0)}%;background:${hpColor}"></div></div>
        ${ammoHtml}
      `;
    }

    // Render rising floating damage/heal/steal numbers projected from 3D world coords
    const popups = this.combatFeed.getPopups();
    const activePopupIds = new Set<number>();
    for (const p of popups) {
      activePopupIds.add(p.id);
      let el = this.floaterNodes.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `float-num ${p.kind} ${p.isCrit ? 'crit' : ''}`;
        el.textContent = p.text;
        this.floatersContainer.appendChild(el);
        this.floaterNodes.set(p.id, el);
      }
      const screen = project(p.wx, p.wy, p.heightY);
      if (!screen.visible) {
        el.style.display = 'none';
        continue;
      }
      const progress = Math.min(1, p.age / Math.max(0.05, p.duration));
      const opacity = progress < 0.65 ? 1 : Math.max(0, 1 - (progress - 0.65) / 0.35);
      const popScale = progress < 0.16 ? 0.72 + (progress / 0.16) * 0.44 : 1.16 - Math.min(0.18, (progress - 0.16) * 0.25);
      el.style.display = 'block';
      el.style.left = `${screen.x.toFixed(1)}px`;
      el.style.top = `${screen.y.toFixed(1)}px`;
      el.style.opacity = opacity.toFixed(2);
      el.style.transform = `translate(-50%, -50%) scale(${popScale.toFixed(2)})`;
    }
    for (const [id, el] of this.floaterNodes) {
      if (!activePopupIds.has(id)) {
        el.remove();
        this.floaterNodes.delete(id);
      }
    }

    // Render top-right kill feed ticker
    const feed = this.combatFeed.getFeed();
    const feedSig = feed.map((f) => f.id).join(',');
    if (feedSig !== this.lastFeedSig) {
      this.lastFeedSig = feedSig;
      this.killFeedEl.innerHTML = feed
        .map((f) => {
          const kClass = f.killerTeam === 'blue' ? 'blue' : f.killerTeam === 'red' ? 'red' : 'neutral';
          const vClass = f.victimTeam === 'blue' ? 'blue' : 'red';
          const hl = f.killerIsLocal ? 'my-kill' : f.victimIsLocal ? 'my-death' : '';
          return `
            <div class="killfeed-row ${hl}">
              <span class="kf-name ${kClass}">${escapeHtml(f.killerName)}</span>
              <span class="kf-icon">☠️</span>
              <span class="kf-name ${vClass}">${escapeHtml(f.victimName)}</span>
            </div>
          `;
        })
        .join('');
    }

    // Render DOUBLE KILL / TRIPLE KILL / TEAM WIPE announcer banner
    const banner = this.combatFeed.getBanner();
    const countdownVisible = !this.countdownEl.classList.contains('hidden');
    if (banner) {
      this.announcerEl.classList.remove('hidden', 'blue', 'red', 'gold', 'offset-low');
      this.announcerEl.classList.add(banner.accent);
      if (countdownVisible) this.announcerEl.classList.add('offset-low');
      if (banner.id !== this.lastBannerId) {
        this.lastBannerId = banner.id;
        this.announcerEl.innerHTML = `
          <div class="announcer-title">${escapeHtml(banner.title)}</div>
          <div class="announcer-sub">${escapeHtml(banner.subtitle)}</div>
        `;
        // Retrigger pop-in animation cleanly
        this.announcerEl.classList.remove('pop');
        void this.announcerEl.offsetWidth;
        this.announcerEl.classList.add('pop');
      }
    } else if (this.lastBannerId !== -1) {
      this.lastBannerId = -1;
      this.announcerEl.classList.add('hidden');
    }
  }
}
