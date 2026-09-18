/* ============================================================================
 * Client multijoueur : connexion WebSocket, salle, vues filtrées.
 * ==========================================================================*/

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, BotLevel } from '../game/types';
import type { GameView } from '../game/views';
import type { ClientMessage, RoomInfo, ServerMessage } from '../net/protocol';

const SESSION_KEY = 'belote-tunisie:session';

interface SavedSession { playerId: string; code: string }

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

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
  clearError: () => void;
}

export function useOnline(): OnlineApi {
  const ws = useRef<WebSocket | null>(null);
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

  const connect = useCallback((after?: () => void) => {
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
      after?.();
      return;
    }
    setConnecting(true);
    leaving.current = false;
    const sock = new WebSocket(wsUrl());
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
    sock.onclose = () => {
      setConnected(false);
      setConnecting(false);
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
          connect(() => send({ t: 'resume', playerId: saved!.playerId, code: saved!.code }));
        }, 700 * attempts.current);
      }
    };
    sock.onerror = () => setConnecting(false);
  }, [send]);

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
  };
}
