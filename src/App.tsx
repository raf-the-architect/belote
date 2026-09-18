/* ============================================================================
 * Belote Tunisie — application : accueil, lobby, table, règles, paramètres.
 * ==========================================================================*/

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BotLevel, Card, Seat, Suit } from './game/types';
import { TEAM_OF } from './game/types';
import { GameScreen, type GameApi } from './ui/GameScreen';
import { StartScreen } from './ui/screens/StartScreen';
import { OnlineLobby, SoloLobby } from './ui/screens/LobbyScreen';
import { RulesScreen } from './ui/screens/RulesScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { useLocalGame } from './ui/useLocalGame';
import { useOnline } from './ui/useOnline';
import { resolveServerUrl, setStoredServerUrl, normalizeServerUrl } from './net/endpoint';
import { useOnlineFx } from './ui/useOnlineFx';
import { loadSettings, saveSettings, type Settings } from './ui/settings';
import { setSoundEnabled, setVolume, unlockAudio } from './ui/sound';

type Screen = 'start' | 'solo' | 'online' | 'game' | 'online-game';
type Modal = null | 'rules' | 'settings';

const PARTNER_NAMES = ['Leïla', 'Nadia', 'Salma', 'Emna'];
const OPPONENT_NAMES = ['Sami', 'Karim', 'Hédi', 'Bilel'];

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>('start');
  const [urlSeed, setUrlSeed] = useState<number | undefined>(undefined);
  const [serverUrl, setServerUrl] = useState<string>(() => resolveServerUrl());

  const changeServer = useCallback((raw: string) => {
    const url = normalizeServerUrl(raw);
    setStoredServerUrl(url);
    setServerUrl(url || resolveServerUrl());
  }, []);
  const [modal, setModal] = useState<Modal>(null);
  const [session, setSession] = useState(0);
  const local = useLocalGame(settings);
  const online = useOnline(serverUrl);
  const onlineFx = useOnlineFx(online.view, settings.vibrate);
  const [autoNextIn, setAutoNextIn] = useState<number | null>(null);

  /* ------------------------------------------------------------ réglages -- */
  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // paramètres d'URL : ?level=expert&target=701&fast=1&name=Sami&sound=0
  useEffect(() => {
    if (typeof location === 'undefined') return;
    const params = new URLSearchParams(location.search);
    const patch: Partial<Settings> = {};
    const level = params.get('level');
    if (level === 'facile' || level === 'normal' || level === 'expert') patch.level = level;
    const target = Number(params.get('target'));
    if (target >= 101) patch.target = target;
    if (params.get('fast') === '1') patch.fastPlay = true;
    if (params.get('sound') === '0') patch.sound = false;
    if (params.get('name')) patch.playerName = params.get('name')!.slice(0, 16);
    const seed = Number(params.get('seed'));
    if (Number.isFinite(seed) && seed > 0) setUrlSeed(Math.floor(seed));
    if (Object.keys(patch).length) patchSettings(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setSoundEnabled(settings.sound); }, [settings.sound]);
  useEffect(() => { setVolume(settings.volume); }, [settings.volume]);
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  /* ----------------------------------------------- passage en salle de jeu */
  useEffect(() => {
    if (online.view && online.room?.started) setScreen('online-game');
  }, [online.view, online.room?.started]);

  // compte à rebours de la manche suivante en ligne
  useEffect(() => {
    if (online.view?.phase !== 'handOver') {
      setAutoNextIn(null);
      return;
    }
    setAutoNextIn(7);
    const t = setInterval(() => setAutoNextIn((v) => (v === null ? null : Math.max(0, v - 1))), 1000);
    return () => clearInterval(t);
  }, [online.view?.phase, online.view?.hand]);

  const playerName = settings.playerName || 'Vous';

  /* --------------------------------------------------------- partie locale */
  const startLocalMatch = useCallback(() => {
    const partner = PARTNER_NAMES[Math.floor(Math.random() * PARTNER_NAMES.length)];
    const opps = [...OPPONENT_NAMES].sort(() => Math.random() - 0.5).slice(0, 2);
    local.newMatch({
      target: settings.target,
      level: settings.level,
      names: [playerName, opps[0], partner, opps[1]],
      seed: urlSeed,
    });
    setSession((s) => s + 1);
    setScreen('game');
  }, [local, playerName, settings.level, settings.target, urlSeed]);

  const localApi: GameApi | null = useMemo(() => {
    if (!local.view) return null;
    return {
      view: local.view,
      me: 0 as Seat,
      dealing: local.dealing,
      banner: local.banner,
      toast: local.toast,
      trickWin: local.trickWin,
      thinking: local.thinking,
      play: (card: Card) => { local.play(card); },
      accept: local.accept,
      pass: local.pass,
      take: (suit: Suit) => local.take(suit),
      nextHand: local.nextHand,
      autoNextIn: null,
    };
  }, [local]);

  const onlineApi: GameApi | null = useMemo(() => {
    if (!online.view) return null;
    return {
      view: online.view,
      me: online.view.you,
      dealing: false,
      banner: onlineFx.banner,
      toast: online.error ? { id: 1, text: online.error } : null,
      trickWin: onlineFx.trickWin,
      thinking: online.view.turn !== online.view.you ? online.view.turn : null,
      play: (card: Card) => online.action({ type: 'play', card }),
      accept: () => online.action({ type: 'accept' }),
      pass: () => online.action({ type: 'pass' }),
      take: (suit: Suit) => online.action({ type: 'take', suit }),
      nextHand: () => online.nextHand(),
      autoNextIn,
    };
  }, [online, onlineFx.banner, onlineFx.trickWin, autoNextIn]);

  const quitToStart = useCallback(() => {
    local.quit();
    online.leave();
    setScreen('start');
  }, [local, online]);

  /* --------------------------------------------------------------- rendu -- */
  if (modal === 'rules') {
    return <div className="app"><RulesScreen onBack={() => setModal(null)} /></div>;
  }
  if (modal === 'settings') {
    return (
      <div className="app">
        <SettingsScreen
          settings={settings}
          onChange={patchSettings}
          onBack={() => setModal(null)}
          onResetStats={() => { try { localStorage.removeItem('belote-tunisie:stats'); } catch { /* ignore */ } }}
        />
      </div>
    );
  }

  if (screen === 'game' && localApi) {
    return (
      <div className="app">
        <GameScreen
          key={`local-${session}`}
          api={localApi}
          settings={settings}
          onQuit={quitToStart}
          onRules={() => setModal('rules')}
          onSettings={() => setModal('settings')}
          onToggleSound={() => patchSettings({ sound: !settings.sound })}
          onPlayAgain={startLocalMatch}
          onLobby={() => { local.quit(); setScreen('solo'); }}
        />
      </div>
    );
  }

  if (screen === 'online-game' && onlineApi) {
    return (
      <div className="app">
        <GameScreen
          api={onlineApi}
          settings={settings}
          onQuit={quitToStart}
          onRules={() => setModal('rules')}
          onSettings={() => setModal('settings')}
          onToggleSound={() => patchSettings({ sound: !settings.sound })}
          onlineLabel={`Salle ${online.code ?? ''}`}
          onPlayAgain={() => online.restart()}
          onLobby={() => { online.leave(); setScreen('online'); }}
        />
        {!online.connected && <div className="conn-banner">Connexion perdue — reconnexion…</div>}
      </div>
    );
  }

  if (screen === 'game' && local.matchOver) {
    /* victoire gérée dans GameScreen */
  }

  return (
    <div className="app">
      {screen === 'start' && (
        <StartScreen
          onSolo={() => setScreen('solo')}
          onMultiplayer={() => setScreen('online')}
          onRules={() => setModal('rules')}
          onSettings={() => setModal('settings')}
          name={settings.playerName}
          hasSavedSession={online.hasSaved}
          onResumeOnline={() => { online.resume(); setScreen('online'); }}
        />
      )}

      {screen === 'solo' && (
        <SoloLobby
          level={settings.level}
          target={settings.target}
          onLevel={(l: BotLevel) => patchSettings({ level: l })}
          onTarget={(t: number) => patchSettings({ target: t })}
          onStart={startLocalMatch}
          onBack={() => setScreen('start')}
          name={playerName}
          onName={(n: string) => patchSettings({ playerName: n })}
          partnerName={PARTNER_NAMES[0]}
        />
      )}

      {screen === 'online' && (
        <OnlineLobby
          room={online.room}
          you={online.you}
          name={settings.playerName}
          onName={(n: string) => patchSettings({ playerName: n })}
          onReady={online.ready}
          onStart={online.start}
          onLeave={() => { online.leave(); setScreen('start'); }}
          onCreate={() => online.create(settings.playerName || 'Joueur', settings.level, settings.target)}
          onJoin={(code: string) => online.join(code, settings.playerName || 'Joueur')}
          error={online.error}
          chat={online.chat}
          onChat={online.sendChat}
          level={online.room?.level ?? settings.level}
          onLevel={online.setLevel}
          target={online.room?.target ?? settings.target}
          onTarget={online.setTarget}
          connecting={online.connecting}
          connected={online.connected}
          serverUrl={serverUrl}
          onServer={changeServer}
          onRetry={online.retry}
        />
      )}
    </div>
  );
}

export { TEAM_OF };
