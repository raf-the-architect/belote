/* ============================================================================
 * Client multijoueur : connexion WebSocket, salle, vues filtrées.
 * ==========================================================================*/

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, BotLevel } from '../game/types';
import type { GameView } from '../game/views';
import type { ClientMessage, RoomInfo, ServerMessage } from '../net/protocol';
import { isStaticDeployment, shortServerLabel } from '../net/endpoint';

const SESSION_KEY = 'belote-tunisie:session';

interface SavedSession { playerId: string; code: string }

export interface OnlineApi {
  connecting: boolean;
  connected: boolean;
  you: string | null;
  code: string | null;
  room: RoomInfo | null;
  view: GameView | null;
  error: string | null;
  chat: { from: string; text: string; at: number }[];
  hasSaved: boolean;
  create: (name: string, level: BotLevel, target: number) => void;
  join: (code: string, name: string) => void;
  ready: (r: boolean) => void;
  start: () => void;
  setLevel: (l: BotLevel) => void;
  setTarget: (t: number) => void;
  action: (a: Action) => void;
  nextHand: () => void;
  restart: () => void;
  sendChat: (text: string) => void;
  leave: () => void;
  resume: () => void;
  retry: () => void;
  clearError: () => void;
  /** adresse du serveur réellement utilisée */
  serverUrl: string;
}

export function useOnline(serverUrl: string): OnlineApi {
  const ws = useRef<WebSocket | null>(null);
  const target = useRef(serverUrl);
  const openedWith = useRef('');
  const wanted = useRef(false);
  const queue = useRef<ClientMessage[]>([]);
  const attempts = useRef(0);
  const leaving = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [you, setYou] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<{ from: string; text: string; at: number }[]>([]);
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    try {
      setHasSaved(!!localStorage.getItem(SESSION_KEY));
    } catch { /* ignore */ }
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const sock = ws.current;
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(msg));
    else queue.current.push(msg);
  }, []);

  const open = useCallback((after?: () => void) => {
    const url = target.current;
    openedWith.current = url;
    setConnecting(true);
    leaving.current = false;
    let sock: WebSocket;
    try {
      sock = new WebSocket(url);
    } catch {
      setConnecting(false);
      setError(
        isStaticDeployment()
          ? `Impossible d'ouvrir une connexion vers ${shortServerLabel(url)}. Le solo fonctionne sans serveur ; pour le multijoueur, renseignez l'adresse du serveur de jeu ci-dessous.`
          : `Connexion impossible vers ${shortServerLabel(url)}.`,
      );
      return;
    }
    ws.current = sock;
    sock.onopen = () => {
      setConnected(true);
      setConnecting(false);
      attempts.current = 0;
      const pending = queue.current;
      queue.current = [];
      for (const m of pending) sock.send(JSON.stringify(m));
      after?.();
    };
    sock.onmessage = (ev) => {
      let msg: ServerMessage;
      try { msg = JSON.parse(String(ev.data)) as ServerMessage; } catch { return; }
      switch (msg.t) {
        case 'welcome':
          setYou(msg.playerId);
          setCode(msg.code);
          try { localStorage.setItem(SESSION_KEY, JSON.stringify({ playerId: msg.playerId, code: msg.code })); } catch { /* ignore */ }
          setHasSaved(true);
          break;
        case 'room':
          setRoom(msg.room);
          break;
        case 'view':
          setView(msg.view);
          break;
        case 'chat':
          setChat((c) => [...c.slice(-60), { from: msg.from, text: msg.text, at: msg.at }]);
          break;
        case 'error':
          setError(msg.message);
          break;
        default:
          break;
      }
    };
    sock.onerror = () => setConnecting(false);
    sock.onclose = () => {
      setConnected(false);
      setConnecting(false);
      // le joueur a changé de serveur : une nouvelle connexion est déjà en route
      if (openedWith.current !== target.current) return;
      if (leaving.current) return;
      // reconnexion automatique si une session existe
      let saved: SavedSession | null = null;
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        saved = raw ? (JSON.parse(raw) as SavedSession) : null;
      } catch { /* ignore */ }
      if (saved && attempts.current < 6) {
        attempts.current++;
        setTimeout(() => {
          open(() => send({ t: 'resume', playerId: saved!.playerId, code: saved!.code }));
        }, 700 * attempts.current);
        return;
      }
      // échec franc : on explique quoi faire plutôt que de laisser « déconnecté »
      const label = shortServerLabel(target.current);
      setError(
        isStaticDeployment() && !saved
          ? `Aucun serveur de jeu joignable sur ${label}. Cette page est hébergée en statique : le solo fonctionne entièrement, et pour le multijoueur renseignez l'adresse du serveur ci-dessous.`
          : `Connexion au serveur impossible (${label}). Vérifiez que le serveur de jeu tourne, puis réessayez.`,
      );
    };
    // si la tentative échoue sans même ouvrir (hôte inconnu, hors ligne)
    setTimeout(() => {
      if (!leaving.current && sock.readyState === WebSocket.CONNECTING && openedWith.current === target.current) {
        setConnecting(false);
      }
    }, 6000);
  }, [send]);

  const connect = useCallback((after?: () => void) => {
    wanted.current = true;
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
      if (openedWith.current === target.current) { after?.(); return; }
      try { ws.current.close(); } catch { /* ignore */ }
    }
    attempts.current = 0;
    setError(null);
    open(after);
  }, [open]);

  // changement d'adresse de serveur : on rebascule la connexion
  useEffect(() => {
    if (target.current === serverUrl) return;
    target.current = serverUrl;
    if (!wanted.current) return;
    const sock = ws.current;
    if (sock) { try { sock.close(); } catch { /* ignore */ } }
    ws.current = null;
    setConnected(false);
    attempts.current = 0;
    setError(null);
    open();
  }, [serverUrl, open]);

  const create = useCallback((name: string, level: BotLevel, target: number) => {
    connect(() => send({ t: 'create', name, level, target }));
  }, [connect, send]);

  const join = useCallback((roomCode: string, name: string) => {
    connect(() => send({ t: 'join', code: roomCode, name }));
  }, [connect, send]);

  const resume = useCallback(() => {
    let saved: SavedSession | null = null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      saved = raw ? (JSON.parse(raw) as SavedSession) : null;
    } catch { /* ignore */ }
    if (!saved) return;
    connect(() => send({ t: 'resume', playerId: saved!.playerId, code: saved!.code }));
  }, [connect, send]);

  const leave = useCallback(() => {
    leaving.current = true;
    wanted.current = false;
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setHasSaved(false);
    ws.current?.close();
    ws.current = null;
    setRoom(null);
    setView(null);
    setYou(null);
    setCode(null);
    setChat([]);
    setError(null);
  }, []);

  useEffect(() => () => { leaving.current = true; ws.current?.close(); }, []);

  return {
    connecting, connected, you, code, room, view, error, chat, hasSaved,
    create, join, resume, leave,
    ready: (r) => send({ t: 'ready', ready: r }),
    start: () => send({ t: 'start' }),
    setLevel: (l) => send({ t: 'level', level: l }),
    setTarget: (t) => send({ t: 'target', target: t }),
    action: (a) => send({ t: 'action', action: a }),
    nextHand: () => send({ t: 'nextHand' }),
    restart: () => send({ t: 'restart' }),
    sendChat: (text) => send({ t: 'chat', text }),
    clearError: () => setError(null),
    retry: () => connect(),
    serverUrl: target.current,
  };
}
