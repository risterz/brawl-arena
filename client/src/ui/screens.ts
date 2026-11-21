import {
  BRAWLER_LIST,
  BrawlerId,
  BRAWLERS,
  LobbyState,
  MAP_LIST,
  MapId,
  MatchState,
  Team,
} from '@brawl-arena/shared';

export interface HomeViewProps {
  playerName: string;
  selectedBrawler: BrawlerId;
  selectedMap: MapId;
  onNameChange: (name: string) => void;
  onOpenBrawlers: () => void;
  onSelectMap: (mapId: MapId) => void;
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

    this.container.innerHTML = `
      <div class="home-shell">
        <div class="home-top">
          <div class="brand-badge">
            <h1>BRAWL ARENA</h1>
            <span>3v3 Gem Grab • 3D Arena</span>
          </div>
          <div class="name-box">
            <span style="font-weight:800;font-size:13px;color:#9ec5ff;">NAME</span>
            <input id="player-name-input" maxlength="16" value="${escapeHtml(props.playerName)}" placeholder="Your Name" />
          </div>
        </div>

        <div class="home-bottom">
          <div class="brawler-summary">
            <h2>
              <span class="swatch" style="background:${b.primaryColor}"></span>
              ${escapeHtml(b.name)}
              <span class="role-pill">${escapeHtml(b.role)}</span>
            </h2>
            <p>${escapeHtml(b.description)}</p>
            <p style="color:#ffd43b;"><strong>Super:</strong> ${escapeHtml(b.superDescription)}</p>
            <button id="open-brawlers-btn" class="btn btn-blue btn-sm" style="margin-top:6px;">Change Brawler (6)</button>
          </div>

          <div class="action-deck">
            <div class="map-chip-row">${mapChips}</div>
            <div class="action-row">
              <button id="play-solo-btn" class="btn btn-gold">PLAY SOLO vs BOTS</button>
              <button id="create-room-btn" class="btn btn-purple">CREATE ROOM</button>
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

    this.container.querySelectorAll('.map-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.map as MapId;
        props.onSelectMap(id);
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
          <div class="brawler-card-head">
            <strong style="font-family:'Fredoka',sans-serif;font-size:20px;">
              <span class="swatch" style="background:${b.primaryColor};vertical-align:middle;margin-right:6px;"></span>
              ${escapeHtml(b.name)}
            </strong>
            <span class="role-pill">${escapeHtml(b.role)}</span>
          </div>
          <div style="font-size:12px;color:#9ec5ff;margin-bottom:6px;">HP ${b.maxHp} • Range ${b.attack.range} • Speed ${b.moveSpeed}</div>
          <div style="font-size:12px;color:#e4f0ff;">${escapeHtml(b.description)}</div>
          <div style="font-size:12px;color:#ffd43b;margin-top:4px;"><strong>Super:</strong> ${escapeHtml(b.superDescription)}</div>
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

    const renderTeamCol = (team: Team) => {
      const slots = lobby.slots.filter((s) => s.team === team);
      const rows = slots
        .map((s) => {
          const isMe = s.slotIndex === mySlot;
          const b = BRAWLERS[s.brawlerId];
          const hostCrown = s.slotIndex === lobby.hostSlot ? ' 👑' : '';
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
          <strong style="font-family:'Fredoka',sans-serif;font-size:18px;color:${team === 'blue' ? '#54c7ff' : '#ff6b7a'}">${team.toUpperCase()} TEAM</strong>
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

    this.container.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <h2>ROOM LOBBY</h2>
              <div class="room-code-pill" id="lobby-room-code">${escapeHtml(lobby.code)}</div>
              <button id="copy-invite-btn" class="btn btn-blue btn-sm">Copy Invite Link</button>
            </div>
            <button id="leave-lobby-btn" class="btn btn-red btn-sm">Leave</button>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div>
              <div style="font-size:12px;color:#9ec5ff;font-weight:800;margin-bottom:4px;">YOUR BRAWLER</div>
              <div class="map-chip-row">${brawlerPills}</div>
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
            <span style="font-size:13px;color:#9ec5ff;">Empty slots automatically fill with AI Bots on start.</span>
            ${
              isHost
                ? '<button id="start-match-btn" class="btn btn-gold">START 3v3 MATCH</button>'
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
    }
  }

  public renderResults(props: ResultsViewProps): void {
    this.container.classList.remove('hidden');
    const { state, localSlot } = props;
    const myTeam = state.brawlers[localSlot]?.team ?? 'blue';
    const headline =
      state.winner === 'draw' ? 'DRAW!' : state.winner === myTeam ? 'VICTORY!' : 'DEFEAT';
    const headColor =
      state.winner === 'draw' ? '#ffd43b' : state.winner === myTeam ? '#32e276' : '#ff4757';

    const rows = state.brawlers
      .map((b) => {
        const star = b.slotIndex === state.starPlayerSlot ? '<span class="star-pill">★ STAR PLAYER</span>' : '';
        const teamColor = b.team === 'blue' ? '#54c7ff' : '#ff6b7a';
        return `
          <tr>
            <td style="color:${teamColor};font-weight:900;">${escapeHtml(b.name)}${star}</td>
            <td>${escapeHtml(BRAWLERS[b.brawlerId].name)}</td>
            <td>${b.stats.kills} / ${b.stats.deaths}</td>
            <td>💎 ${b.stats.gemsCollected}</td>
            <td>${b.stats.damageDealt}</td>
          </tr>
        `;
      })
      .join('');

    const playAgainBtn =
      !props.isOnline || props.isHost
        ? `<button id="play-again-btn" class="btn btn-gold">${props.isOnline ? 'BACK TO LOBBY' : 'PLAY AGAIN'}</button>`
        : '<span style="color:#ffd43b;font-weight:800;">Waiting for host to return to lobby...</span>';

    this.container.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h2 style="color:${headColor};font-size:32px;">${headline}</h2>
            <div style="font-family:'Fredoka',sans-serif;font-size:20px;">
              <span style="color:#54c7ff;">BLUE ${state.blueGems}</span> — <span style="color:#ff6b7a;">RED ${state.redGems}</span>
            </div>
          </div>

          <table class="results-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Brawler</th>
                <th>K / D</th>
                <th>Gems</th>
                <th>Damage</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:16px;align-items:center;">
            <button id="results-home-btn" class="btn btn-dark">Home</button>
            ${playAgainBtn}
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#results-home-btn')!.addEventListener('click', props.onHome);
    this.container.querySelector('#play-again-btn')?.addEventListener('click', props.onPlayAgain);
  }
}
