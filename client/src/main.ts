import './styles.css';
import { BrawlerId, GameMode, MapId, MatchState } from '@brawl-arena/shared';
import { SfxEngine } from './audio/sfx';
import { ControlManager } from './input/controls';
import { LocalMatchController } from './net/localController';
import { OnlineMatchController } from './net/onlineController';
import { ProfileClient } from './net/profileClient';
import { ArenaRenderer } from './render/arenaScene';
import { preloadAllModels } from './render/modelBank';
import { MatchHud } from './ui/hud';
import { ScreenManager, ShopTab } from './ui/screens';

type AppMode = 'home' | 'shop' | 'lobby' | 'solo' | 'online';

function boot(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const hudLayer = document.getElementById('hud-layer')!;
  const controlsLayer = document.getElementById('controls-layer')!;
  const uiLayer = document.getElementById('ui-layer')!;
  const toastLayer = document.getElementById('toast-layer')!;
  const portraitBlocker = document.getElementById('portrait-blocker')!;

  const renderer = new ArenaRenderer(canvas);
  const sfx = new SfxEngine();
  sfx.preload();

  // Unlock Web Audio & start Lobby BGM smoothly on first user interaction
  const unlockOnce = () => sfx.unlock();
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce, { passive: true });

  const controls = new ControlManager(controlsLayer, portraitBlocker, () => sfx.unlock());
  const screens = new ScreenManager(uiLayer, toastLayer);

  let mode: AppMode = 'home';
  let playerName = localStorage.getItem('brawl_arena_name') || `Brawler${Math.floor(10 + Math.random() * 89)}`;
  const profileClient = new ProfileClient(playerName);
  let selectedBrawler: BrawlerId = 'buck';
  let selectedMap: MapId = 'crystal-cavern';
  let selectedMode: GameMode = 'gem-grab';
  let selectedBlueSize = 3;
  let selectedRedSize = 3;
  let shopTab: ShopTab = 'featured';
  let shopPreviewBrawler: BrawlerId = 'buck';
  let shopPreviewSkinId: string | null = null;
  let shopPreviewRingId: string | null = null;
  let lastBoxRewardText: string | null = null;
  let lastMatchReward: { coinsEarned: number; gemsEarned: number; milestoneHit: boolean } | null = null;
  let pendingRoomConfig: { mapId: MapId; mode: GameMode; blueSize: number; redSize: number } | null = null;
  let activeMatchMap: MapId = 'crystal-cavern';
  let localMatch: LocalMatchController | null = null;
  let resultsShown = false;
  let lastResultsHostSlot = -2;

  const hud = new MatchHud(hudLayer, {
    onToggleMute: () => {
      sfx.unlock();
      sfx.setSfxMuted(!sfx.isSfxMuted());
      return sfx.isSfxMuted();
    },
    onToggleBgm: () => {
      sfx.unlock();
      sfx.setBgmMuted(!sfx.isBgmMuted());
      return sfx.isBgmMuted();
    },
    isSfxMuted: () => sfx.isSfxMuted(),
    isBgmMuted: () => sfx.isBgmMuted(),
    onLeave: () => {
      sfx.playUiClick();
      leaveToHome();
    },
    onSuperReady: () => sfx.playSuperReady(),
  });

  const online = new OnlineMatchController({
    onLobby: (lobby, mySlot) => {
      mode = 'lobby';
      resultsShown = false;
      controls.setActive(false);
      hud.hide();
      sfx.playBgm('lobby');
      if (pendingRoomConfig && lobby.hostSlot === mySlot) {
        const cfg = pendingRoomConfig;
        pendingRoomConfig = null;
        online.pickMap(cfg.mapId);
        online.pickMode(cfg.mode);
        online.setTeamSizes(cfg.blueSize, cfg.redSize);
        if (cfg.blueSize < 3 || cfg.redSize < 3) {
          online.setFillBots(false);
        }
      }
      const lobbyBrawler = lobby.slots[mySlot]?.brawlerId ?? selectedBrawler;
      const desiredSkin = profileClient.getEquippedSkin(lobbyBrawler);
      const desiredRing = profileClient.getEquippedRing();
      if (
        lobby.slots[mySlot] &&
        ((lobby.slots[mySlot].skinId ?? null) !== desiredSkin ||
          (lobby.slots[mySlot].ringId ?? null) !== desiredRing)
      ) {
        online.pickCosmetics(desiredSkin, desiredRing);
      }
      renderer.setPreviewBrawler(lobbyBrawler, lobby.mode ?? 'gem-grab', desiredSkin, desiredRing);
      screens.renderLobby({
        lobby,
        mySlot,
        onPickBrawler: (id) => {
          sfx.playUiSelect();
          selectedBrawler = id;
          online.pickBrawler(id);
          online.pickCosmetics(profileClient.getEquippedSkin(id), profileClient.getEquippedRing());
        },
        onSwitchTeam: (team) => {
          sfx.playUiSelect();
          online.switchTeam(team);
        },
        onPickMap: (mapId) => {
          sfx.playUiSelect();
          online.pickMap(mapId);
        },
        onPickMode: (nextMode) => {
          sfx.playUiSelect();
          online.pickMode(nextMode);
        },
        onSetTeamSizes: (blueSize, redSize) => {
          sfx.playUiSelect();
          online.setTeamSizes(blueSize, redSize);
        },
        onSetFillBots: (fillBots) => {
          sfx.playUiSelect();
          online.setFillBots(fillBots);
        },
        onStartMatch: () => {
          sfx.playUiClick();
          online.startMatch();
        },
        onLeave: () => {
          sfx.playUiClick();
          leaveToHome();
        },
        onCopyInvite: (code) => {
          sfx.playUiClick();
          const url = `${window.location.origin}/?room=${code}`;
          if (navigator.clipboard) {
            void navigator.clipboard.writeText(url);
          }
          screens.showToast(`Copied invite link for ${code}!`, 'info');
        },
      });
    },
    onMatchStart: (mapId, _mySlot, _myTeam, state) => {
      mode = 'online';
      activeMatchMap = mapId;
      resultsShown = false;
      screens.clear();
      renderer.loadMap(mapId, state.grid, state.mode);
      hud.show(controls.isTouchMode());
      controls.setActive(true);
      sfx.playBgm(mapId === 'crystal-cavern' ? 'battle' : mapId === 'iron-foundry' ? 'foundry' : 'battle_alt');
    },
    onEvents: (events) => {
      const curState = online.getState();
      const mySlot = online.getMySlot();
      renderer.applyEvents(events, curState, mySlot);
      hud.ingestEvents(events, curState, mySlot);
      for (const ev of events) sfx.playEvent(ev);
    },
    onError: (message) => {
      screens.showToast(message, 'error');
      if (mode !== 'online') {
        showHome();
      }
    },
    onDisconnect: () => {
      if (mode === 'lobby' || mode === 'online') {
        screens.showToast('Disconnected from room', 'error');
        leaveToHome();
      }
    },
  });

  function syncMatchBgm(state: MatchState): void {
    if (state.phase === 'ended') {
      sfx.playBgm('victory');
    } else if (state.countdownTeam !== null || state.phase === 'sudden_death') {
      sfx.playBgm('countdown');
    } else {
      sfx.playBgm(
        activeMatchMap === 'crystal-cavern'
          ? 'battle'
          : activeMatchMap === 'iron-foundry'
            ? 'foundry'
            : 'battle_alt',
      );
    }
  }

  function showShop(): void {
    mode = 'shop';
    controls.setActive(false);
    hud.hide();
    sfx.playBgm('lobby');
    renderer.setPreviewBrawler(shopPreviewBrawler, selectedMode, shopPreviewSkinId, shopPreviewRingId);

    screens.renderShop({
      profile: profileClient.getProfile(),
      activeTab: shopTab,
      previewBrawler: shopPreviewBrawler,
      previewSkinId: shopPreviewSkinId,
      previewRingId: shopPreviewRingId,
      lastBoxRewardText,
      onSelectTab: (tab) => {
        sfx.playUiSelect();
        shopTab = tab;
        showShop();
      },
      onPreviewItem: (item, brawlerId, category) => {
        sfx.playUiSelect();
        if (category === 'skin' && brawlerId) {
          shopPreviewBrawler = brawlerId;
          shopPreviewSkinId = item ? item.id : null;
        } else if (category === 'ring') {
          shopPreviewRingId = item ? item.id : null;
        }
        showShop();
      },
      onBuyItem: async (itemId) => {
        try {
          const updated = await profileClient.buyItem(itemId);
          sfx.playSuperReady();
          const bought = updated.ownedItems.includes(itemId);
          if (bought) {
            screens.showToast('Unlocked & Equipped!', 'info');
            const skinForPreview = updated.loadout.skins[shopPreviewBrawler] ?? null;
            shopPreviewSkinId = skinForPreview;
            shopPreviewRingId = updated.loadout.ring;
          }
          showShop();
        } catch (err) {
          screens.showToast(err instanceof Error ? err.message : 'Purchase failed', 'error');
        }
      },
      onEquipItem: async (category, itemId, brawlerId) => {
        try {
          const updated = await profileClient.equipItem(category, itemId, brawlerId);
          sfx.playUiSelect();
          if (category === 'skin' && brawlerId) {
            shopPreviewBrawler = brawlerId;
            shopPreviewSkinId = updated.loadout.skins[brawlerId] ?? null;
          } else if (category === 'ring') {
            shopPreviewRingId = updated.loadout.ring;
          }
          showShop();
        } catch (err) {
          screens.showToast(err instanceof Error ? err.message : 'Equip failed', 'error');
        }
      },
      onClaimDaily: async () => {
        try {
          await profileClient.claimDaily();
          sfx.playSuperReady();
          screens.showToast('Claimed +100 🪙 & +15 💎!', 'info');
          showShop();
        } catch (err) {
          screens.showToast(err instanceof Error ? err.message : 'Daily claim failed', 'error');
        }
      },
      onOpenBox: async () => {
        try {
          const reward = await profileClient.openBrawlBox();
          sfx.playSuperReady();
          if (reward.rewardType === 'item' && reward.itemName) {
            lastBoxRewardText = `Brawl Box Unlocked: ${reward.itemName}!`;
          } else if (reward.rewardType === 'gems') {
            lastBoxRewardText = `Brawl Box Jackpot: +${reward.gems} 💎 Gems!`;
          } else {
            lastBoxRewardText = `Brawl Box Stash: +${reward.coins} 🪙 Coins!`;
          }
          showShop();
        } catch (err) {
          screens.showToast(err instanceof Error ? err.message : 'Could not open box', 'error');
        }
      },
      onClose: () => {
        sfx.playUiClick();
        lastBoxRewardText = null;
        showHome();
      },
    });
  }

  function showHome(): void {
    mode = 'home';
    resultsShown = false;
    lastMatchReward = null;
    localMatch = null;
    controls.setActive(false);
    hud.hide();
    sfx.playBgm('lobby');
    renderer.setPreviewBrawler(
      selectedBrawler,
      selectedMode,
      profileClient.getEquippedSkin(selectedBrawler),
      profileClient.getEquippedRing(),
    );

    screens.renderHome({
      playerName,
      selectedBrawler,
      selectedMap,
      selectedMode,
      blueSize: selectedBlueSize,
      redSize: selectedRedSize,
      profile: profileClient.getProfile(),
      sfxMuted: sfx.isSfxMuted(),
      bgmMuted: sfx.isBgmMuted(),
      onToggleSfx: () => {
        sfx.unlock();
        sfx.setSfxMuted(!sfx.isSfxMuted());
        if (!sfx.isSfxMuted()) sfx.playUiClick();
        return sfx.isSfxMuted();
      },
      onToggleBgm: () => {
        sfx.unlock();
        sfx.setBgmMuted(!sfx.isBgmMuted());
        sfx.playUiClick();
        return sfx.isBgmMuted();
      },
      onNameChange: (name) => {
        playerName = name;
        try {
          localStorage.setItem('brawl_arena_name', name);
        } catch {
          // ignore
        }
      },
      onOpenBrawlers: () => {
        sfx.unlock();
        sfx.playUiClick();
        screens.renderBrawlerDrawer(
          selectedBrawler,
          (id) => {
            sfx.playUiSelect();
            selectedBrawler = id;
            showHome();
          },
          () => {
            sfx.playUiClick();
          },
        );
      },
      onOpenShop: () => {
        sfx.unlock();
        sfx.playUiClick();
        shopPreviewBrawler = selectedBrawler;
        shopPreviewSkinId = profileClient.getEquippedSkin(selectedBrawler);
        shopPreviewRingId = profileClient.getEquippedRing();
        lastBoxRewardText = null;
        showShop();
      },
      onSelectMap: (mapId) => {
        sfx.unlock();
        sfx.playUiSelect();
        selectedMap = mapId;
        showHome();
      },
      onSelectMode: (nextMode) => {
        sfx.unlock();
        sfx.playUiSelect();
        selectedMode = nextMode;
        showHome();
      },
      onSelectFormat: (blueSize, redSize) => {
        sfx.unlock();
        sfx.playUiSelect();
        selectedBlueSize = blueSize;
        selectedRedSize = redSize;
        showHome();
      },
      onPlaySolo: () => {
        sfx.unlock();
        sfx.playUiClick();
        startSoloMatch();
      },
      onCreateRoom: async () => {
        try {
          sfx.unlock();
          sfx.playUiClick();
          pendingRoomConfig = {
            mapId: selectedMap,
            mode: selectedMode,
            blueSize: selectedBlueSize,
            redSize: selectedRedSize,
          };
          const code = await online.createRoom();
          online.connect(code, playerName);
        } catch {
          pendingRoomConfig = null;
          screens.showToast('Could not reach room server', 'error');
        }
      },
      onJoinRoom: (code) => {
        sfx.unlock();
        sfx.playUiClick();
        online.connect(code, playerName);
      },
    });
  }

  function leaveToHome(): void {
    online.disconnect();
    window.history.replaceState({}, '', window.location.pathname);
    showHome();
  }

  function startSoloMatch(): void {
    sfx.unlock();
    mode = 'solo';
    activeMatchMap = selectedMap;
    resultsShown = false;
    screens.clear();
    localMatch = new LocalMatchController({
      mapId: selectedMap,
      mode: selectedMode,
      blueSize: selectedBlueSize,
      redSize: selectedRedSize,
      playerBrawler: selectedBrawler,
      playerSkinId: profileClient.getEquippedSkin(selectedBrawler),
      playerRingId: profileClient.getEquippedRing(),
      playerName,
    });
    renderer.loadMap(selectedMap, localMatch.getState().grid, selectedMode);
    hud.show(controls.isTouchMode());
    controls.setActive(true);
    sfx.playBgm(selectedMap === 'crystal-cavern' ? 'battle' : selectedMap === 'iron-foundry' ? 'foundry' : 'battle_alt');
  }

  function maybeShowResults(state: MatchState, localSlot: number, isOnline: boolean): void {
    if (state.phase !== 'ended') return;
    const lobby = online.getLobby();
    const curHostSlot = lobby ? lobby.hostSlot : -1;
    if (resultsShown && (!isOnline || lastResultsHostSlot === curHostSlot)) return;
    const firstShow = !resultsShown;
    resultsShown = true;
    lastResultsHostSlot = curHostSlot;
    controls.setActive(false);
    hud.hide();
    if (firstShow) {
      renderer.setResultsScene(state, localSlot);
      sfx.playBgm('victory');
      const me = state.brawlers[localSlot];
      if (me) {
        const outcome: 'victory' | 'defeat' | 'draw' =
          state.winner === 'draw' ? 'draw' : state.winner === me.team ? 'victory' : 'defeat';
        void profileClient
          .claimMatchReward({
            name: playerName,
            mode: state.mode,
            outcome,
            kills: me.stats.kills,
            objectives: me.stats.gemsCollected,
            isStarPlayer: state.starPlayerSlot === localSlot,
          })
          .then((res) => {
            if (res && resultsShown) {
              lastMatchReward = {
                coinsEarned: res.coinsEarned,
                gemsEarned: res.gemsEarned,
                milestoneHit: res.milestoneHit,
              };
              const curLobby = online.getLobby();
              const curIsHost = Boolean(curLobby && curLobby.hostSlot === online.getMySlot());
              screens.renderResults({
                state,
                localSlot,
                isOnline,
                isHost: curIsHost,
                rewardSummary: lastMatchReward,
                onPlayAgain: () => {
                  sfx.playUiClick();
                  if (isOnline) online.returnToLobby();
                  else startSoloMatch();
                },
                onHome: () => {
                  sfx.playUiClick();
                  leaveToHome();
                },
              });
            }
          });
      }
    }
    const isHost = Boolean(lobby && lobby.hostSlot === online.getMySlot());
    screens.renderResults({
      state,
      localSlot,
      isOnline,
      isHost,
      rewardSummary: lastMatchReward,
      onPlayAgain: () => {
        sfx.playUiClick();
        if (isOnline) {
          online.returnToLobby();
        } else {
          startSoloMatch();
        }
      },
      onHome: () => {
        sfx.playUiClick();
        leaveToHome();
      },
    });
  }

  window.addEventListener('resize', () => renderer.resize());

  // Preload all 18 Blender GLB models and refresh the turntable as soon as ready
  void preloadAllModels().then(() => {
    renderer.refreshPreview();
  });

  // Check for invite URL /?room=XXXX
  const params = new URLSearchParams(window.location.search);
  const inviteRoom = params.get('room');
  showHome();
  void profileClient.load(playerName).then(() => {
    if (mode === 'home') showHome();
  });
  if (inviteRoom && /^[A-Za-z0-9]{4}$/.test(inviteRoom)) {
    online.connect(inviteRoom.toUpperCase(), playerName);
  }

  // Main 60fps loop
  let lastTime = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    if (mode === 'home' || mode === 'shop' || mode === 'lobby') {
      renderer.renderPreview(dt);
    } else if (resultsShown) {
      if (mode === 'online') {
        const currentState = online.getState();
        if (currentState) {
          maybeShowResults(currentState, online.getMySlot(), true);
        }
      }
      renderer.renderResults(dt);
    } else if (mode === 'solo' && localMatch) {
      const state = localMatch.getState();
      const { input, telegraph } = controls.sampleInput(
        state,
        localMatch.localSlot,
        (x, y) => renderer.screenToWorldGround(x, y),
      );
      const events = localMatch.tick(dt, input);
      renderer.applyEvents(events, state, localMatch.localSlot);
      hud.ingestEvents(events, state, localMatch.localSlot);
      for (const ev of events) sfx.playEvent(ev);
      renderer.syncState(state, localMatch.localSlot, dt, telegraph);
      hud.setTouchMode(controls.isTouchMode());
      hud.update(state, localMatch.localSlot, dt, (wx, wy, h) => renderer.projectToScreen(wx, wy, h));
      syncMatchBgm(state);
      maybeShowResults(state, localMatch.localSlot, false);
    } else if (mode === 'online') {
      const currentState = online.getState();
      if (currentState) {
        const mySlot = online.getMySlot();
        const { input, telegraph } = controls.sampleInput(
          currentState,
          mySlot,
          (x, y) => renderer.screenToWorldGround(x, y),
        );
        const state = online.tick(dt, input);
        if (state) {
          renderer.syncState(state, mySlot, dt, telegraph);
          hud.setTouchMode(controls.isTouchMode());
          hud.update(state, mySlot, dt, (wx, wy, h) => renderer.projectToScreen(wx, wy, h));
          syncMatchBgm(state);
          maybeShowResults(state, mySlot, true);
        }
      }
    }

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
