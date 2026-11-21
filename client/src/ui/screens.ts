import {
  BRAWL_BOX_COST,
  BRAWLER_LIST,
  BrawlerId,
  BRAWLERS,
  DAILY_FREE_COINS,
  DAILY_FREE_GEMS,
  GameMode,
  getEffectivePrice,
  getShopItem,
  LobbyState,
  MAP_LIST,
  MapId,
  MatchState,
  PlayerProfile,
  SHOP_ITEMS,
  ShopItem,
  Team,
} from '@brawl-arena/shared';
import { computePodiumLineup } from '../render/victoryStage';

export type ShopTab = 'featured' | 'skins' | 'rings';

export interface ShopViewProps {
  profile: PlayerProfile;
  activeTab: ShopTab;
  previewBrawler: BrawlerId;
  previewSkinId: string | null;
  previewRingId: string | null;
  lastBoxRewardText: string | null;
  onSelectTab: (tab: ShopTab) => void;
  onPreviewItem: (item: ShopItem | null, brawlerId?: BrawlerId, category?: 'skin' | 'ring') => void;
  onBuyItem: (itemId: string) => void;
  onEquipItem: (category: 'skin' | 'ring', itemId: string | null, brawlerId?: BrawlerId) => void;
  onClaimDaily: () => void;
  onOpenBox: () => void;
  onClose: () => void;
}

export interface HomeViewProps {
  playerName: string;
  selectedBrawler: BrawlerId;
  selectedMap: MapId;
  selectedMode: GameMode;
  blueSize: number;
  redSize: number;
  profile: PlayerProfile;
  sfxMuted: boolean;
  bgmMuted: boolean;
  onToggleSfx: () => boolean;
  onToggleBgm: () => boolean;
  onNameChange: (name: string) => void;
  onOpenBrawlers: () => void;
  onOpenShop: () => void;
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
  rewardSummary?: { coinsEarned: number; gemsEarned: number; milestoneHit: boolean } | null;
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
            <div class="wallet-bar">
              <span class="wallet-pill coins">🪙 ${props.profile.coins}</span>
              <span class="wallet-pill gems">💎 ${props.profile.gems}</span>
            </div>
            <button id="open-shop-btn" class="btn btn-gold btn-sm shop-launch-btn">
              🛒 SHOP${props.profile.dailyAvailable ? '<span class="shop-dot"></span>' : ''}
            </button>
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
                <div style="font-size:11px;font-weight:800;color:#9ec5ff;">HP ${b.maxHp} • Range ${b.attack.range} • Speed ${b.moveSpeed}</div>
              </div>
            </div>
            <p>${escapeHtml(b.description)}</p>
            <p style="color:#ffd43b;"><strong>Super:</strong> ${escapeHtml(b.superDescription)}</p>
            <button id="open-brawlers-btn" class="btn btn-blue btn-sm" style="margin-top:6px;">Change Brawler (6)</button>
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
    this.container.querySelector('#open-shop-btn')!.addEventListener('click', props.onOpenShop);
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
            <div style="font-size:11px;color:#9ec5ff;margin-bottom:5px;">Range ${b.attack.range} • Speed ${b.moveSpeed}</div>
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

  public renderShop(props: ShopViewProps): void {
    this.container.classList.remove('hidden');
    const { profile, activeTab } = props;
    const owned = new Set(profile.ownedItems);

    const renderItemCard = (item: ShopItem) => {
      const isOwned = owned.has(item.id);
      const isDeal = profile.dailyDealIds.includes(item.id);
      const effectivePrice = getEffectivePrice(item, profile.dailyDealIds);
      const curIcon = item.currency === 'coins' ? '🪙' : '💎';
      const canAfford = item.currency === 'coins' ? profile.coins >= effectivePrice : profile.gems >= effectivePrice;
      const isEquipped =
        item.category === 'ring'
          ? profile.loadout.ring === item.id
          : Boolean(item.brawlerId && profile.loadout.skins[item.brawlerId] === item.id);
      const isPreviewing =
        item.category === 'ring' ? props.previewRingId === item.id : props.previewSkinId === item.id;

      const accent = item.skinSpec?.accentHex ?? item.ringSpec?.accentHex ?? '#ffd43b';
      const brawlerTag = item.brawlerId ? BRAWLERS[item.brawlerId].name : 'ALL BRAWLERS';
      const priceHtml = isDeal
        ? `<span class="price-old">${item.price}</span> ${curIcon} ${effectivePrice}`
        : `${curIcon} ${effectivePrice}`;

      let actionBtn: string;
      if (isEquipped) {
        actionBtn = `<button class="btn btn-dark btn-sm shop-unequip-btn" data-cat="${item.category}" data-brawler="${item.brawlerId ?? ''}">Equipped ✓</button>`;
      } else if (isOwned) {
        actionBtn = `<button class="btn btn-blue btn-sm shop-equip-btn" data-id="${item.id}" data-cat="${item.category}" data-brawler="${item.brawlerId ?? ''}">Equip</button>`;
      } else {
        actionBtn = `<button class="btn ${canAfford ? 'btn-gold' : 'btn-dark'} btn-sm shop-buy-btn" data-id="${item.id}" ${canAfford ? '' : 'disabled'}>${priceHtml}</button>`;
      }

      return `
        <div class="shop-item-card rarity-${item.rarity} ${isPreviewing ? 'previewing' : ''}" data-preview-id="${item.id}">
          <div class="shop-card-top">
            <span class="rarity-pill ${item.rarity}">${item.rarity.toUpperCase()}</span>
            ${isDeal && !isOwned ? '<span class="deal-pill">-25%</span>' : `<span class="brawler-tag">${escapeHtml(brawlerTag)}</span>`}
          </div>
          <div class="shop-swatch-row">
            ${
              item.brawlerId
                ? `<img class="shop-mini-portrait" src="/portraits/${item.brawlerId}.png" style="border-color:${accent};box-shadow:0 0 12px ${accent}55;" alt="${escapeHtml(item.name)}" />`
                : `<div class="shop-ring-preview" style="border-color:${accent};box-shadow:0 0 14px ${accent};"></div>`
            }
            <div>
              <div class="shop-item-name">${escapeHtml(item.name)}</div>
              <div class="shop-item-desc">${escapeHtml(item.tagline)}</div>
            </div>
          </div>
          <div class="shop-card-foot">
            <span class="shop-preview-hint">${isPreviewing ? '👁 Previewing 3D' : 'Click to Preview'}</span>
            ${actionBtn}
          </div>
        </div>
      `;
    };

    let bodyHtml = '';
    if (activeTab === 'featured') {
      const dealItems = profile.dailyDealIds
        .map((id) => getShopItem(id))
        .filter((it): it is ShopItem => it !== null);
      bodyHtml = `
        <div class="shop-featured-grid">
          <div class="shop-special-card daily">
            <div>
              <div class="shop-special-title">🎁 DAILY FREE GIFT</div>
              <div class="shop-special-sub">+${DAILY_FREE_COINS} 🪙 Coins &amp; +${DAILY_FREE_GEMS} 💎 Gems every day</div>
            </div>
            <button id="shop-daily-btn" class="btn ${profile.dailyAvailable ? 'btn-gold' : 'btn-dark'} btn-sm" ${profile.dailyAvailable ? '' : 'disabled'}>
              ${profile.dailyAvailable ? 'CLAIM FREE' : 'CLAIMED ✓'}
            </button>
          </div>

          <div class="shop-special-card box">
            <div>
              <div class="shop-special-title">📦 MYSTERY BRAWL BOX</div>
              <div class="shop-special-sub">Roll Coins, Gems, or a random 3D Skin / Aura Ring!</div>
            </div>
            <button id="shop-box-btn" class="btn ${profile.coins >= BRAWL_BOX_COST ? 'btn-purple' : 'btn-dark'} btn-sm" ${profile.coins >= BRAWL_BOX_COST ? '' : 'disabled'}>
              OPEN 🪙 ${BRAWL_BOX_COST}
            </button>
          </div>
        </div>
        ${props.lastBoxRewardText ? `<div class="shop-box-banner">✨ ${escapeHtml(props.lastBoxRewardText)}</div>` : ''}
        <div class="shop-section-label">🔥 TODAY'S DEALS (25% OFF)</div>
        <div class="shop-grid">${dealItems.map(renderItemCard).join('')}</div>
      `;
    } else if (activeTab === 'skins') {
      const skins = SHOP_ITEMS.filter((it) => it.category === 'skin');
      bodyHtml = `
        <div class="shop-section-label">🎨 3D BRAWLER SKINS (CLICK ANY CARD FOR LIVE 3D PREVIEW)</div>
        <div class="shop-grid">${skins.map(renderItemCard).join('')}</div>
      `;
    } else {
      const rings = SHOP_ITEMS.filter((it) => it.category === 'ring');
      bodyHtml = `
        <div class="shop-section-label">✨ CUSTOM GROUND AURA RINGS</div>
        <div class="shop-grid">${rings.map(renderItemCard).join('')}</div>
      `;
    }

    const activeSkinObj = getShopItem(props.previewSkinId);
    const activeRingObj = getShopItem(props.previewRingId);
    const previewLabel = activeSkinObj
      ? `${activeSkinObj.name}`
      : `${BRAWLERS[props.previewBrawler].name} (Classic)`;

    this.container.innerHTML = `
      <div class="shop-shell">
        <div class="shop-stage-badge">
          <div style="font-family:'Fredoka',sans-serif;font-size:18px;color:#ffd43b;">👁 ${escapeHtml(previewLabel)}</div>
          <div style="font-size:11px;color:#b7d4ff;font-weight:800;">
            Aura: ${escapeHtml(activeRingObj ? activeRingObj.name : 'Default Team Ring')} • Wins: ${profile.wins}
          </div>
        </div>

        <div class="shop-panel">
          <div class="shop-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <h2>🛒 BRAWL SHOP</h2>
              <div class="wallet-bar">
                <span class="wallet-pill coins">🪙 ${profile.coins}</span>
                <span class="wallet-pill gems">💎 ${profile.gems}</span>
              </div>
            </div>
            <button id="close-shop-btn" class="btn btn-dark btn-sm">Back</button>
          </div>

          <div class="shop-tabs">
            <button class="map-chip ${activeTab === 'featured' ? 'active' : ''}" data-shop-tab="featured">🔥 Featured &amp; Boxes</button>
            <button class="map-chip ${activeTab === 'skins' ? 'active' : ''}" data-shop-tab="skins">🎨 Skins (12)</button>
            <button class="map-chip ${activeTab === 'rings' ? 'active' : ''}" data-shop-tab="rings">✨ Aura Rings (5)</button>
          </div>

          <div class="shop-body">${bodyHtml}</div>
        </div>
      </div>
    `;

    this.container.querySelector('#close-shop-btn')!.addEventListener('click', props.onClose);
    this.container.querySelector('#shop-daily-btn')?.addEventListener('click', props.onClaimDaily);
    this.container.querySelector('#shop-box-btn')?.addEventListener('click', props.onOpenBox);

    this.container.querySelectorAll('[data-shop-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        props.onSelectTab((btn as HTMLElement).dataset.shopTab as ShopTab);
      });
    });

    this.container.querySelectorAll('.shop-buy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        props.onBuyItem((btn as HTMLElement).dataset.id!);
      });
    });

    this.container.querySelectorAll('.shop-equip-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = btn as HTMLElement;
        props.onEquipItem(
          el.dataset.cat as 'skin' | 'ring',
          el.dataset.id!,
          (el.dataset.brawler || undefined) as BrawlerId | undefined,
        );
      });
    });

    this.container.querySelectorAll('.shop-unequip-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = btn as HTMLElement;
        props.onEquipItem(
          el.dataset.cat as 'skin' | 'ring',
          null,
          (el.dataset.brawler || undefined) as BrawlerId | undefined,
        );
      });
    });

    this.container.querySelectorAll('[data-preview-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const item = getShopItem((card as HTMLElement).dataset.previewId);
        if (item) props.onPreviewItem(item, item.brawlerId, item.category);
      });
    });
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

    const rewardPill = props.rewardSummary
      ? `<div class="results-reward-pill">+${props.rewardSummary.coinsEarned} 🪙${
          props.rewardSummary.gemsEarned > 0
            ? ` • +${props.rewardSummary.gemsEarned} 💎 3-WIN BONUS!`
            : ''
        }</div>`
      : '';

    this.container.innerHTML = `
      <div class="results-stage-overlay">
        <div class="results-top-bar">
          <h2 class="results-headline" style="color:${headColor};">${headline}</h2>
          <div class="results-score-row">
            <div class="results-score-pill">
              <span style="color:#54c7ff;">BLUE ${state.blueGems}</span> — <span style="color:#ff6b7a;">RED ${state.redGems}</span>
            </div>
            ${rewardPill}
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
