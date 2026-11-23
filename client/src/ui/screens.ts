import {
  BRAWLER_LIST,
  BrawlerConfig,
  BrawlerId,
  BRAWLERS,
  GameMode,
  LobbyState,
  MAP_LIST,
  MapId,
  MatchState,
  Team,
} from '@brawl-arena/shared';
import { computePodiumLineup } from '../render/victoryStage';

export interface HomeViewProps {
  playerName: string;
  selectedBrawler: BrawlerId;
  selectedMap: MapId;
  selectedMode: GameMode;
  blueSize: number;
  redSize: number;
  sfxMuted: boolean;
  bgmMuted: boolean;
  onToggleSfx: () => boolean;
  onToggleBgm: () => boolean;
  onNameChange: (name: string) => void;
  onOpenBrawlers: () => void;
  onSelectMap: (mapId: MapId) => void;
  onSelectMode: (mode: GameMode) => void;
  onSelectFormat: (blueSize: number, redSize: number) => void;
  onPlaySolo: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
}

export interface LobbyViewProps {
  lobby: LobbyState;
  mySlot: number;
  onPickBrawler: (id: BrawlerId) => void;
  onSwitchTeam: (team: Team) => void;
  onPickMap: (mapId: MapId) => void;
  onPickMode: (mode: GameMode) => void;
  onSetTeamSizes: (blueSize: number, redSize: number) => void;
  onSetFillBots: (fillBots: boolean) => void;
  onStartMatch: () => void;
  onLeave: () => void;
  onCopyInvite: (code: string) => void;
}

export interface ResultsViewProps {
  state: MatchState;
  localSlot: number;
  isOnline: boolean;
  isHost: boolean;
  onPlayAgain: () => void;
  onHome: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatAttackDamage(b: BrawlerConfig): string {
  if (b.attack.minDamage !== undefined && b.attack.minDamage !== b.attack.damage) {
    return `${b.attack.minDamage}-${b.attack.damage}`;
  }
  if (b.attack.burstCount && b.attack.burstCount > 1) {
    return `${b.attack.damage}×${b.attack.burstCount}`;
  }
  if (b.attack.projectiles > 1 && b.id !== 'lumi' && b.id !== 'kage') {
    return `${b.attack.damage}×${b.attack.projectiles}`;
  }
  if (b.attack.puddleDps) {
    return `${b.attack.damage}+${b.attack.puddleDps}/s`;
  }
  return `${b.attack.damage}`;
}

export class ScreenManager {
  private container: HTMLElement;
  private toastLayer: HTMLElement;

  constructor(container: HTMLElement, toastLayer: HTMLElement) {
    this.container = container;
    this.toastLayer = toastLayer;
  }

  public clear(): void {
    this.container.innerHTML = '';
    this.container.classList.add('hidden');
  }

  public showToast(message: string, variant: 'error' | 'info' = 'error'): void {
    const el = document.createElement('div');
    el.className = `toast ${variant === 'info' ? 'info' : ''}`;
    el.textContent = message;
    this.toastLayer.appendChild(el);
    window.setTimeout(() => {
      el.remove();
    }, 3600);
  }

  public renderHome(props: HomeViewProps): void {
    this.container.classList.remove('hidden');
    const b = BRAWLERS[props.selectedBrawler];
    const mapChips = MAP_LIST.map(
      (m) =>
        `<button class="map-chip ${m.id === props.selectedMap ? 'active' : ''}" data-map="${m.id}">${escapeHtml(m.name)}</button>`,
    ).join('');
    const modeChips = (
      [
        { id: 'gem-grab', label: '💎 Gem Grab' },
        { id: 'brawl-ball', label: '⚽ Brawl Ball' },
      ] as const
    )
      .map(
        (m) =>
          `<button class="map-chip mode-chip ${m.id === props.selectedMode ? 'active' : ''}" data-mode="${m.id}">${m.label}</button>`,
      )
      .join('');
    const formatPresets: Array<[number, number, string]> = [
      [1, 1, '1v1'],
      [2, 2, '2v2'],
      [1, 2, '1v2'],
      [2, 1, '2v1'],
      [3, 3, '3v3'],
    ];
    const formatChips = formatPresets
      .map(
        ([bs, rs, label]) =>
          `<button class="map-chip format-chip ${props.blueSize === bs && props.redSize === rs ? 'active' : ''}" data-blue="${bs}" data-red="${rs}">${label}</button>`,
      )
      .join('');
    const fmtLabel = `${props.blueSize}v${props.redSize}`;

    this.container.innerHTML = `
      <div class="home-shell">
        <div class="home-top">
          <div class="brand-badge">
            <h1>BRAWL ARENA</h1>
            <span>Custom 1v1 • 2v2 • 1v2 • 3v3 • 3D Arena</span>
          </div>
          <div class="action-row">
            <button id="home-bgm-btn" class="btn btn-dark btn-sm">${props.bgmMuted ? '🔇 BGM' : '🎵 BGM'}</button>
            <button id="home-sfx-btn" class="btn btn-dark btn-sm">${props.sfxMuted ? '🔇 SFX' : '🔊 SFX'}</button>
            <div class="name-box">
              <span style="font-weight:800;font-size:13px;color:#9ec5ff;">NAME</span>
              <input id="player-name-input" maxlength="16" value="${escapeHtml(props.playerName)}" placeholder="Your Name" />
            </div>
          </div>
        </div>

        <div class="home-bottom">
          <div class="brawler-summary">
            <div class="brawler-summary-head">
              <img class="brawler-avatar" src="/portraits/${b.id}.png" alt="${escapeHtml(b.name)}" style="border-color:${b.primaryColor};" />
              <div>
                <h2>
                  ${escapeHtml(b.name)}
                  <span class="role-pill">${escapeHtml(b.role)}</span>
                </h2>
                <div style="font-size:11px;font-weight:800;color:#9ec5ff;">HP ${b.maxHp} • DMG ${formatAttackDamage(b)} • Range ${b.attack.range} • Speed ${b.moveSpeed}</div>
              </div>
            </div>
            <p>${escapeHtml(b.description)}</p>
            <p style="color:#ffd43b;"><strong>Super:</strong> ${escapeHtml(b.superDescription)}</p>
            <button id="open-brawlers-btn" class="btn btn-blue btn-sm" style="margin-top:6px;">Change Brawler (${BRAWLER_LIST.length})</button>
          </div>

          <div class="action-deck">
            <div class="map-chip-row">${modeChips}</div>
            <div class="map-chip-row">${formatChips}</div>
            <div class="map-chip-row">${mapChips}</div>
            <div class="action-row">
              <button id="play-solo-btn" class="btn btn-gold">PLAY ${fmtLabel} vs BOTS</button>
              <button id="create-room-btn" class="btn btn-purple">CUSTOM ROOM (${fmtLabel})</button>
            </div>
            <div class="action-row">
              <input id="join-code-input" class="code-input" maxlength="4" placeholder="CODE" />
              <button id="join-room-btn" class="btn btn-blue btn-sm">JOIN ROOM</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const nameInput = this.container.querySelector('#player-name-input') as HTMLInputElement;
    nameInput.addEventListener('input', () => props.onNameChange(nameInput.value));

    const homeBgmBtn = this.container.querySelector('#home-bgm-btn') as HTMLButtonElement;
    homeBgmBtn.addEventListener('click', () => {
      const muted = props.onToggleBgm();
      homeBgmBtn.textContent = muted ? '🔇 BGM' : '🎵 BGM';
    });

    const homeSfxBtn = this.container.querySelector('#home-sfx-btn') as HTMLButtonElement;
    homeSfxBtn.addEventListener('click', () => {
      const muted = props.onToggleSfx();
      homeSfxBtn.textContent = muted ? '🔇 SFX' : '🔊 SFX';
    });

    this.container.querySelector('#open-brawlers-btn')!.addEventListener('click', props.onOpenBrawlers);
    this.container.querySelector('#play-solo-btn')!.addEventListener('click', props.onPlaySolo);
    this.container.querySelector('#create-room-btn')!.addEventListener('click', props.onCreateRoom);

    const codeInput = this.container.querySelector('#join-code-input') as HTMLInputElement;
    const submitJoin = () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code.length !== 4) {
        this.showToast('Enter a 4-character room code');
        return;
      }
      props.onJoinRoom(code);
    };
    this.container.querySelector('#join-room-btn')!.addEventListener('click', submitJoin);
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitJoin();
    });

    this.container.querySelectorAll('[data-map]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.map as MapId;
        props.onSelectMap(id);
      });
    });
    this.container.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.mode as GameMode;
        props.onSelectMode(id);
      });
    });
    this.container.querySelectorAll('[data-blue]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        props.onSelectFormat(Number(el.dataset.blue), Number(el.dataset.red));
      });
    });
  }

  public renderBrawlerDrawer(
    selected: BrawlerId,
    onSelect: (id: BrawlerId) => void,
    onClose: () => void,
  ): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const cards = BRAWLER_LIST.map(
      (b) => `
        <div class="brawler-card ${b.id === selected ? 'selected' : ''}" data-id="${b.id}">
          <div class="brawler-portrait-stage" style="--p1:${b.primaryColor};--p2:${b.accentColor};">
            <img class="brawler-portrait-img" src="/portraits/${b.id}.png" alt="${escapeHtml(b.name)}" />
            <span class="role-pill brawler-portrait-role">${escapeHtml(b.role)}</span>
          </div>
          <div class="brawler-card-body">
            <div class="brawler-card-head">
              <strong style="font-family:'Fredoka',sans-serif;font-size:20px;">
                <span class="swatch" style="background:${b.primaryColor};vertical-align:middle;margin-right:6px;"></span>
                ${escapeHtml(b.name)}
              </strong>
              <span style="font-size:11px;font-weight:900;color:#9ec5ff;">HP ${b.maxHp}</span>
            </div>
            <div style="font-size:11px;color:#9ec5ff;margin-bottom:5px;">DMG ${formatAttackDamage(b)} • Range ${b.attack.range} • Speed ${b.moveSpeed}</div>
            <div style="font-size:12px;color:#e4f0ff;line-height:1.3;">${escapeHtml(b.description)}</div>
            <div style="font-size:11.5px;color:#ffd43b;margin-top:4px;line-height:1.3;"><strong>Super:</strong> ${escapeHtml(b.superDescription)}</div>
          </div>
        </div>
      `,
    ).join('');

    backdrop.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h2>CHOOSE BRAWLER</h2>
          <button class="btn btn-dark btn-sm" id="close-drawer-btn">Done</button>
        </div>
        <div class="brawler-grid">${cards}</div>
      </div>
    `;

    backdrop.querySelector('#close-drawer-btn')!.addEventListener('click', () => {
      backdrop.remove();
      onClose();
    });
    backdrop.querySelectorAll('.brawler-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.id as BrawlerId;
        backdrop.remove();
        onSelect(id);
      });
    });

    this.container.appendChild(backdrop);
  }

  public renderLobby(props: LobbyViewProps): void {
    this.container.classList.remove('hidden');
    const { lobby, mySlot } = props;
    const isHost = lobby.hostSlot === mySlot;
    const myBrawler = lobby.slots[mySlot]?.brawlerId ?? 'buck';
    const blueSize = lobby.blueSize ?? 3;
    const redSize = lobby.redSize ?? 3;
    const fillBots = lobby.fillBots ?? true;

    const renderTeamCol = (team: Team) => {
      const cap = team === 'blue' ? blueSize : redSize;
      const slots = lobby.slots.filter((s) => s.team === team && (s.enabled ?? true));
      const humanCount = slots.filter((s) => !s.isBot).length;
      const rows = slots
        .map((s) => {
          const isMe = s.slotIndex === mySlot;
          const b = BRAWLERS[s.brawlerId];
          const hostCrown = s.slotIndex === lobby.hostSlot ? ' 👑' : '';
          if (s.isBot && !fillBots) {
            return `
              <div class="slot-row empty">
                <span style="color:#89a7db;">Open Player Slot <span class="open-badge">OPEN</span></span>
                <span style="color:#6c86b8;font-size:12px;">Waiting...</span>
              </div>
            `;
          }
          const badge = s.isBot ? '<span class="bot-badge">BOT</span>' : '';
          return `
            <div class="slot-row ${isMe ? 'me' : ''}">
              <span>${escapeHtml(s.name)}${hostCrown}${badge}</span>
              <span style="color:${b.accentColor};font-size:13px;">${escapeHtml(b.name)}</span>
            </div>
          `;
        })
        .join('');
      const hasRoom = slots.some((s) => s.isBot);
      const myTeam = lobby.slots[mySlot]?.team;
      const switchBtn =
        myTeam !== team && hasRoom
          ? `<button class="btn btn-dark btn-sm switch-team-btn" data-team="${team}" style="margin-top:10px;width:100%;">Join ${team.toUpperCase()}</button>`
          : '';
      return `
        <div class="team-col ${team}">
          <strong style="font-family:'Fredoka',sans-serif;font-size:18px;color:${team === 'blue' ? '#54c7ff' : '#ff6b7a'}">${team.toUpperCase()} TEAM (${humanCount}/${cap})</strong>
          ${rows}
          ${switchBtn}
        </div>
      `;
    };

    const brawlerPills = BRAWLER_LIST.map(
      (b) =>
        `<button class="map-chip ${b.id === myBrawler ? 'active' : ''}" data-brawler="${b.id}">${escapeHtml(b.name)}</button>`,
    ).join('');

    const mapPills = MAP_LIST.map(
      (m) =>
        `<button class="map-chip ${m.id === lobby.mapId ? 'active' : ''}" data-map="${m.id}" ${isHost ? '' : 'disabled'}>${escapeHtml(m.name)}</button>`,
    ).join('');

    const modePills = (
      [
        { id: 'gem-grab', label: '💎 Gem Grab' },
        { id: 'brawl-ball', label: '⚽ Brawl Ball' },
      ] as const
    )
      .map(
        (m) =>
          `<button class="map-chip mode-chip ${m.id === (lobby.mode ?? 'gem-grab') ? 'active' : ''}" data-mode="${m.id}" ${isHost ? '' : 'disabled'}>${m.label}</button>`,
      )
      .join('');

    const formatPills = (
      [
        [1, 1, '1v1'],
        [2, 2, '2v2'],
        [1, 2, '1v2'],
        [2, 1, '2v1'],
        [3, 3, '3v3'],
      ] as Array<[number, number, string]>
    )
      .map(
        ([bs, rs, label]) =>
          `<button class="map-chip format-chip ${blueSize === bs && redSize === rs ? 'active' : ''}" data-blue="${bs}" data-red="${rs}" ${isHost ? '' : 'disabled'}>${label}</button>`,
      )
      .join('');

    const botToggleBtn = `<button id="toggle-fill-bots-btn" class="map-chip ${fillBots ? 'active' : ''}" ${isHost ? '' : 'disabled'}>${fillBots ? '🤖 Fill Bots: ON' : '👤 Players Only'}</button>`;

    this.container.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <h2>CUSTOM ROOM (${blueSize}v${redSize})</h2>
              <div class="room-code-pill" id="lobby-room-code">${escapeHtml(lobby.code)}</div>
              <button id="copy-invite-btn" class="btn btn-blue btn-sm">Copy Invite Link</button>
            </div>
            <button id="leave-lobby-btn" class="btn btn-red btn-sm">Leave</button>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-size:12px;color:#9ec5ff;font-weight:800;margin-bottom:4px;">YOUR BRAWLER</div>
              <div class="map-chip-row">${brawlerPills}</div>
            </div>
            <div>
              <div style="font-size:12px;color:#9ec5ff;font-weight:800;margin-bottom:4px;">TEAM FORMAT ${isHost ? '(HOST)' : ''}</div>
              <div class="map-chip-row">${formatPills}${botToggleBtn}</div>
            </div>
            <div>
              <div style="font-size:12px;color:#9ec5ff;font-weight:800;margin-bottom:4px;">MODE ${isHost ? '(HOST)' : ''}</div>
              <div class="map-chip-row">${modePills}</div>
            </div>
            <div>
              <div style="font-size:12px;color:#9ec5ff;font-weight:800;margin-bottom:4px;">MAP ${isHost ? '(HOST)' : ''}</div>
              <div class="map-chip-row">${mapPills}</div>
            </div>
          </div>

          <div class="lobby-teams">
            ${renderTeamCol('blue')}
            ${renderTeamCol('red')}
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-size:13px;color:#9ec5ff;">${
              fillBots
                ? `Empty slots fill with AI Bots on start (${blueSize}v${redSize}).`
                : `Players-Only PvP: no bots spawn (need at least 1 human on each team).`
            }</span>
            ${
              isHost
                ? `<button id="start-match-btn" class="btn btn-gold">START ${blueSize}v${redSize} MATCH</button>`
                : '<span style="font-weight:800;color:#ffd43b;">Waiting for host to start...</span>'
            }
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#leave-lobby-btn')!.addEventListener('click', props.onLeave);
    this.container.querySelector('#copy-invite-btn')!.addEventListener('click', () => props.onCopyInvite(lobby.code));
    this.container.querySelector('#start-match-btn')?.addEventListener('click', props.onStartMatch);

    this.container.querySelectorAll('.switch-team-btn').forEach((btn) => {
      btn.addEventListener('click', () => props.onSwitchTeam((btn as HTMLElement).dataset.team as Team));
    });
    this.container.querySelectorAll('[data-brawler]').forEach((btn) => {
      btn.addEventListener('click', () => props.onPickBrawler((btn as HTMLElement).dataset.brawler as BrawlerId));
    });
    if (isHost) {
      this.container.querySelectorAll('[data-map]').forEach((btn) => {
        btn.addEventListener('click', () => props.onPickMap((btn as HTMLElement).dataset.map as MapId));
      });
      this.container.querySelectorAll('[data-mode]').forEach((btn) => {
        btn.addEventListener('click', () => props.onPickMode((btn as HTMLElement).dataset.mode as GameMode));
      });
      this.container.querySelectorAll('[data-blue]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const el = btn as HTMLElement;
          props.onSetTeamSizes(Number(el.dataset.blue), Number(el.dataset.red));
        });
      });
      this.container.querySelector('#toggle-fill-bots-btn')?.addEventListener('click', () => {
        props.onSetFillBots(!fillBots);
      });
    }
  }

  public renderResults(props: ResultsViewProps): void {
    this.container.classList.remove('hidden');
    const { state, localSlot } = props;
    const isBall = state.mode === 'brawl-ball';
    const objIcon = isBall ? '⚽' : '💎';
    const objLabel = isBall ? 'Goals' : 'Gems';
    const lineup = computePodiumLineup(state, localSlot);
    const headline =
      lineup.outcome === 'draw' ? 'DRAW!' : lineup.outcome === 'victory' ? 'VICTORY!' : 'DEFEAT';
    const headColor =
      lineup.outcome === 'draw' ? '#ffd43b' : lineup.outcome === 'victory' ? '#32e276' : '#ff4757';

    const enemyStarNote =
      lineup.overallStarPlayer && lineup.overallStarPlayer.team !== lineup.myTeam
        ? `<div class="results-enemy-star">★ STAR PLAYER: ${escapeHtml(lineup.overallStarPlayer.name)} (${escapeHtml(BRAWLERS[lineup.overallStarPlayer.brawlerId].name)})</div>`
        : '';

    const podiumCards = lineup.members
      .map((m) => {
        const b = m.brawler;
        const bCfg = BRAWLERS[b.brawlerId];
        const teamColor = b.team === 'blue' ? '#54c7ff' : '#ff6b7a';
        const badge = m.isStarPlayer
          ? '<div class="podium-card-badge">★ STAR PLAYER</div>'
          : m.isTeamMvp
            ? '<div class="podium-card-badge mvp">TEAM MVP</div>'
            : '';
        const youTag = m.isLocal ? ' (You)' : '';
        return `
          <div class="podium-card ${m.position === 'center' ? 'center' : ''}">
            ${badge}
            <div class="podium-card-name" style="color:${teamColor};">${escapeHtml(b.name)}${youTag}</div>
            <div class="podium-card-brawler">${escapeHtml(bCfg.name)}</div>
            <div class="podium-card-stats">
              <span>⚔️ ${b.stats.kills}/${b.stats.deaths}</span>
              <span>${objIcon} ${b.stats.gemsCollected}</span>
              <span>💥 ${b.stats.damageDealt}</span>
            </div>
          </div>
        `;
      })
      .join('');

    const rows = state.brawlers
      .map((b) => {
        const star = b.slotIndex === state.starPlayerSlot ? '<span class="star-pill">★ STAR PLAYER</span>' : '';
        const teamColor = b.team === 'blue' ? '#54c7ff' : '#ff6b7a';
        return `
          <tr>
            <td style="color:${teamColor};font-weight:900;">${escapeHtml(b.name)}${star}</td>
            <td>${escapeHtml(BRAWLERS[b.brawlerId].name)}</td>
            <td>${b.stats.kills} / ${b.stats.deaths}</td>
            <td>${objIcon} ${b.stats.gemsCollected}</td>
            <td>${b.stats.damageDealt}</td>
          </tr>
        `;
      })
      .join('');

    const playAgainBtn =
      !props.isOnline || props.isHost
        ? `<button id="play-again-btn" class="btn btn-gold">${props.isOnline ? 'BACK TO LOBBY' : 'PLAY AGAIN'}</button>`
        : '<span style="color:#ffd43b;font-weight:800;background:rgba(11,19,38,0.8);padding:8px 14px;border-radius:12px;">Waiting for host to return to lobby...</span>';

    this.container.innerHTML = `
      <div class="results-stage-overlay">
        <div class="results-top-bar">
          <h2 class="results-headline" style="color:${headColor};">${headline}</h2>
          <div class="results-score-row">
            <div class="results-score-pill">
              <span style="color:#54c7ff;">BLUE ${state.blueGems}</span> — <span style="color:#ff6b7a;">RED ${state.redGems}</span>
            </div>
            ${enemyStarNote}
          </div>
        </div>

        <div class="results-bottom-zone">
          <div class="results-podium-strip">${podiumCards}</div>
          <div class="results-actions">
            <button id="results-stats-btn" class="btn btn-blue btn-sm">📊 Full Stats</button>
            <button id="results-home-btn" class="btn btn-dark">Home</button>
            ${playAgainBtn}
          </div>
        </div>
      </div>

      <div id="results-stats-modal" class="modal-backdrop hidden">
        <div class="modal-card">
          <div class="modal-header">
            <h2 style="color:${headColor};">MATCH STATS</h2>
            <button id="close-stats-btn" class="btn btn-dark btn-sm">Close</button>
          </div>
          <table class="results-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Brawler</th>
                <th>K / D</th>
                <th>${objLabel}</th>
                <th>Damage</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    const statsModal = this.container.querySelector('#results-stats-modal')!;
    this.container.querySelector('#results-stats-btn')!.addEventListener('click', () => {
      statsModal.classList.remove('hidden');
    });
    this.container.querySelector('#close-stats-btn')!.addEventListener('click', () => {
      statsModal.classList.add('hidden');
    });
    statsModal.addEventListener('click', (e) => {
      if (e.target === statsModal) statsModal.classList.add('hidden');
    });
    this.container.querySelector('#results-home-btn')!.addEventListener('click', props.onHome);
    this.container.querySelector('#play-again-btn')?.addEventListener('click', props.onPlayAgain);
  }
}
