import './styles.css';
import { BrawlerId, MapId, MatchState } from '@brawl-arena/shared';
import { SfxEngine } from './audio/sfx';
import { ControlManager } from './input/controls';
import { LocalMatchController } from './net/localController';
import { OnlineMatchController } from './net/onlineController';
import { ArenaRenderer } from './render/arenaScene';
import { preloadAllModels } from './render/modelBank';
import { MatchHud } from './ui/hud';
import { ScreenManager } from './ui/screens';

type AppMode = 'home' | 'lobby' | 'solo' | 'online';

function boot(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const hudLayer = document.getElementById('hud-layer')!;
  const controlsLayer = document.getElementById('controls-layer')!;
  const uiLayer = document.getElementById('ui-layer')!;
  const toastLayer = document.getElementById('toast-layer')!;
  const portraitBlocker = document.getElementById('portrait-blocker')!;

  const renderer = new ArenaRenderer(canvas);
  const sfx = new SfxEngine();
  const controls = new ControlManager(controlsLayer, portraitBlocker, () => sfx.unlock());
  const screens = new ScreenManager(uiLayer, toastLayer);

  let mode: AppMode = 'home';
  let playerName = localStorage.getItem('brawl_arena_name') || `Brawler${Math.floor(10 + Math.random() * 89)}`;
  let selectedBrawler: BrawlerId = 'buck';
  let selectedMap: MapId = 'crystal-cavern';
  let localMatch: LocalMatchController | null = null;
  let resultsShown = false;
  let lastResultsHostSlot = -2;

  const hud = new MatchHud(hudLayer, {
    onToggleMute: () => {
      sfx.setMuted(!sfx.isMuted());
      return sfx.isMuted();
    },
    onLeave: () => leaveToHome(),
  });

  const online = new OnlineMatchController({
    onLobby: (lobby, mySlot) => {
      mode = 'lobby';
      resultsShown = false;
      controls.setActive(false);
      hud.hide();
      renderer.setPreviewBrawler(lobby.slots[mySlot]?.brawlerId ?? selectedBrawler);
      screens.renderLobby({
        lobby,
        mySlot,
        onPickBrawler: (id) => {
          selectedBrawler = id;
          online.pickBrawler(id);
        },
        onSwitchTeam: (team) => online.switchTeam(team),
        onPickMap: (mapId) => online.pickMap(mapId),
        onStartMatch: () => online.startMatch(),
        onLeave: () => leaveToHome(),
        onCopyInvite: (code) => {
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
      resultsShown = false;
      screens.clear();
      renderer.loadMap(mapId, state.grid);
      hud.show(controls.isTouchMode());
      controls.setActive(true);
    },
    onEvents: (events) => {
      renderer.applyEvents(events, online.getState(), online.getMySlot());
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

  function showHome(): void {
    mode = 'home';
    resultsShown = false;
    localMatch = null;
    controls.setActive(false);
    hud.hide();
    renderer.setPreviewBrawler(selectedBrawler);

    screens.renderHome({
      playerName,
      selectedBrawler,
      selectedMap,
      onNameChange: (name) => {
        playerName = name;
        try {
          localStorage.setItem('brawl_arena_name', name);
        } catch {
          // ignore
        }
      },
      onOpenBrawlers: () => {
        screens.renderBrawlerDrawer(
          selectedBrawler,
          (id) => {
            selectedBrawler = id;
            showHome();
          },
          () => {
            // drawer closed
          },
        );
      },
      onSelectMap: (mapId) => {
        selectedMap = mapId;
        showHome();
      },
      onPlaySolo: () => startSoloMatch(),
      onCreateRoom: async () => {
        try {
          sfx.unlock();
          const code = await online.createRoom();
          online.connect(code, playerName);
        } catch {
          screens.showToast('Could not reach room server', 'error');
        }
      },
      onJoinRoom: (code) => {
        sfx.unlock();
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
    resultsShown = false;
    screens.clear();
    localMatch = new LocalMatchController({
      mapId: selectedMap,
      playerBrawler: selectedBrawler,
      playerName,
    });
    renderer.loadMap(selectedMap, localMatch.getState().grid);
    hud.show(controls.isTouchMode());
    controls.setActive(true);
  }

  function maybeShowResults(state: MatchState, localSlot: number, isOnline: boolean): void {
    if (state.phase !== 'ended') return;
    const lobby = online.getLobby();
    const curHostSlot = lobby ? lobby.hostSlot : -1;
    if (resultsShown && (!isOnline || lastResultsHostSlot === curHostSlot)) return;
    resultsShown = true;
    lastResultsHostSlot = curHostSlot;
    controls.setActive(false);
    const isHost = Boolean(lobby && lobby.hostSlot === online.getMySlot());
    screens.renderResults({
      state,
      localSlot,
      isOnline,
      isHost,
      onPlayAgain: () => {
        if (isOnline) {
          online.returnToLobby();
        } else {
          startSoloMatch();
        }
      },
      onHome: () => leaveToHome(),
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
  if (inviteRoom && /^[A-Za-z0-9]{4}$/.test(inviteRoom)) {
    online.connect(inviteRoom.toUpperCase(), playerName);
  }

  // Main 60fps loop
  let lastTime = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    if (mode === 'home' || mode === 'lobby') {
      renderer.renderPreview(dt);
    } else if (mode === 'solo' && localMatch) {
      const state = localMatch.getState();
      const { input, telegraph } = controls.sampleInput(
        state,
        localMatch.localSlot,
        (x, y) => renderer.screenToWorldGround(x, y),
      );
      const events = localMatch.tick(dt, input);
      renderer.applyEvents(events, state, localMatch.localSlot);
      for (const ev of events) sfx.playEvent(ev);
      renderer.syncState(state, localMatch.localSlot, dt, telegraph);
      hud.update(state, localMatch.localSlot, (wx, wy, h) => renderer.projectToScreen(wx, wy, h));
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
          hud.update(state, mySlot, (wx, wy, h) => renderer.projectToScreen(wx, wy, h));
          maybeShowResults(state, mySlot, true);
        }
      }
    }

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
