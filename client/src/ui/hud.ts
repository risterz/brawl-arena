import {
  isBrawlerVisibleToTeam,
  MatchState,
  Team,
} from '@brawl-arena/shared';

export interface HudCallbacks {
  onToggleMute: () => boolean;
  onLeave: () => void;
  onSuperReady?: () => void;
}

export class MatchHud {
  private container: HTMLElement;
  private onSuperReady?: () => void;
  private blueScoreEl!: HTMLElement;
  private redScoreEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private countdownEl!: HTMLElement;
  private muteBtn!: HTMLButtonElement;
  private hintEl!: HTMLElement;
  private superMeterEl!: HTMLElement;
  private superArcEl!: SVGCircleElement;
  private superPctEl!: HTMLElement;
  private superSubEl!: HTMLElement;
  private barsContainer!: HTMLDivElement;
  private barNodes: Map<number, HTMLDivElement> = new Map();
  private lastSuperReady = false;

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.container = container;
    this.onSuperReady = callbacks.onSuperReady;
    this.container.innerHTML = `
      <div class="hud-top">
        <div class="gem-score blue">💎 <span id="hud-blue-gems">0</span></div>
        <div class="hud-timer" id="hud-timer">03:30</div>
        <div class="gem-score red"><span id="hud-red-gems">0</span> 💎</div>
      </div>
      <div class="hud-corner-tools">
        <button id="hud-mute-btn" class="btn btn-dark btn-sm">🔊 SFX</button>
        <button id="hud-leave-btn" class="btn btn-red btn-sm">Leave</button>
      </div>
      <div id="hud-countdown" class="countdown-banner hidden"></div>
      <div id="hud-bars"></div>
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

    this.blueScoreEl = this.container.querySelector('#hud-blue-gems')!;
    this.redScoreEl = this.container.querySelector('#hud-red-gems')!;
    this.timerEl = this.container.querySelector('#hud-timer')!;
    this.countdownEl = this.container.querySelector('#hud-countdown')!;
    this.muteBtn = this.container.querySelector('#hud-mute-btn')!;
    this.hintEl = this.container.querySelector('#hud-hint')!;
    this.superMeterEl = this.container.querySelector('#hud-super-meter')!;
    this.superArcEl = this.container.querySelector('#hud-super-arc')!;
    this.superPctEl = this.container.querySelector('#hud-super-pct')!;
    this.superSubEl = this.container.querySelector('#hud-super-sub')!;
    this.barsContainer = this.container.querySelector('#hud-bars')!;

    this.muteBtn.addEventListener('click', () => {
      const muted = callbacks.onToggleMute();
      this.muteBtn.textContent = muted ? '🔇 Muted' : '🔊 SFX';
    });

    this.container.querySelector('#hud-leave-btn')!.addEventListener('click', () => {
      callbacks.onLeave();
    });
  }

  public setTouchMode(isTouch: boolean): void {
    this.hintEl.classList.toggle('hidden', isTouch);
    this.superMeterEl.classList.toggle('hidden', isTouch);
  }

  public show(isTouch: boolean): void {
    this.container.classList.remove('hidden');
    this.setTouchMode(isTouch);
    this.lastSuperReady = false;
  }

  public hide(): void {
    this.container.classList.add('hidden');
    this.barsContainer.innerHTML = '';
    this.barNodes.clear();
    this.lastSuperReady = false;
  }

  public update(
    state: MatchState,
    localSlot: number,
    project: (wx: number, wy: number, heightY: number) => { x: number; y: number; visible: boolean },
  ): void {
    this.blueScoreEl.textContent = String(state.blueGems);
    this.redScoreEl.textContent = String(state.redGems);

    if (state.phase === 'sudden_death') {
      this.timerEl.textContent = `SD ${Math.ceil(state.suddenDeathRemaining)}s`;
    } else {
      const rem = Math.max(0, Math.ceil(state.maxDuration - state.elapsed));
      const mm = Math.floor(rem / 60);
      const ss = rem % 60;
      this.timerEl.textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }

    if (state.countdownTeam) {
      this.countdownEl.classList.remove('hidden', 'blue', 'red');
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
      const gemHtml = b.gems > 0 ? `<div class="overhead-gems">💎 ${b.gems}</div>` : '';
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
        <div class="overhead-name">${b.name}</div>
        <div class="hp-track"><div class="hp-fill" style="width:${hpPct.toFixed(0)}%;background:${hpColor}"></div></div>
        ${ammoHtml}
      `;
    }
  }
}
