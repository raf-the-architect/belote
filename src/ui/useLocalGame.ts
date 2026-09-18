/* ============================================================================
 * Partie locale (1 humain + 3 bots) : pilote le moteur et cadence les bots.
 * ==========================================================================*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BotLevel, Card, GameState, Seat, Suit } from '../game/types';
import { SEATS, TEAM_OF } from '../game/types';
import {
  applyAction, awaitingCollect, collectTrick, createMatch, describeIllegal, legalFor, nextToPlay, playCard as enginePlay,
  redealHand, startHand,
} from '../game/engine';
import { botContractDecision, botPlay } from '../game/bots';
import { buildView, type GameView } from '../game/views';
import { playSound, vibrate } from './sound';
import type { Settings } from './settings';

export interface Banner {
  id: number;
  text: string;
  sub?: string;
  kind: 'belote' | 'trick' | 'info' | 'error';
}

export interface TrickWinFx {
  id: number;
  seat: Seat;
  points: number;
}

export interface LocalGame {
  view: GameView | null;
  dealing: boolean;
  banner: Banner | null;
  toast: { id: number; text: string } | null;
  trickWin: TrickWinFx | null;
  thinking: Seat | null;
  matchOver: boolean;
  newMatch: (opts: { target: number; level: BotLevel; names?: [string, string, string, string]; seed?: number }) => void;
  play: (card: Card) => boolean;
  accept: () => void;
  pass: () => void;
  take: (suit: Suit) => void;
  nextHand: () => void;
  quit: () => void;
}

const HUMAN: Seat = 0;

export function useLocalGame(settings: Settings): LocalGame {
  const stateRef = useRef<GameState | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [dealing, setDealing] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [trickWin, setTrickWin] = useState<TrickWinFx | null>(null);
  const [thinking, setThinking] = useState<Seat | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const fxId = useRef(1);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const clearTimers = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (dealTimer.current) clearTimeout(dealTimer.current);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    timer.current = null;
  }, []);

  const flashBanner = useCallback((text: string, kind: Banner['kind'], sub?: string, ms = 1700) => {
    setBanner({ id: fxId.current++, text, sub, kind });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);

  const showToast = useCallback((text: string) => {
    setToast({ id: fxId.current++, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  /* ------------------------------------------------------ évènements moteur */
  const drainEvents = useCallback((st: GameState) => {
    const s = settingsRef.current;
    for (const e of st.events) {
      if (e.seq <= seqRef.current) continue;
      seqRef.current = e.seq;
      switch (e.kind) {
        case 'deal':
          playSound('deal');
          break;
        case 'play':
          playSound('place');
          break;
        case 'belote':
          flashBanner(e.word, 'belote', e.seat === HUMAN ? 'Votre annonce' : st.playerNames[e.seat], 1900);
          playSound('belote');
          break;
        case 'trick':
          setTrickWin({ id: fxId.current++, seat: e.seat, points: e.points });
          playSound('trick');
          break;
        case 'contract':
          flashBanner(
            `Prise à ${e.suit === 'H' ? '♥' : e.suit === 'D' ? '♦' : e.suit === 'C' ? '♣' : '♠'}`,
            'info',
            st.playerNames[e.seat],
            1500,
          );
          break;
        case 'handOver':
          playSound('score');
          break;
        case 'matchOver':
          break;
        default:
          break;
      }
    }
    const last = st.events[st.events.length - 1];
    if (last) seqRef.current = Math.max(seqRef.current, last.seq);
    void s;
  }, [flashBanner]);

  const sync = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    drainEvents(st);
    setView(buildView(st, HUMAN));
  }, [drainEvents]);

  /* --------------------------------------------------------- ordonnanceur */
  const schedule = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const s = settingsRef.current;
    const speed = s.fastPlay ? 0.45 : 1;

    if (st.phase === 'contract') {
      const seat = st.contract!.turn;
      if (seat === HUMAN) {
        setThinking(null);
        return;
      }
      setThinking(seat);
      timer.current = setTimeout(() => {
        const cur = stateRef.current!;
        if (cur.phase !== 'contract' || cur.contract!.turn !== seat) return;
        applyAction(cur, seat, botContractDecision(cur, seat, cur.playerLevel[seat] ?? 'normal'));
        if (cur.pendingRedeal) {
          cur.pendingRedeal = false;
          redealHand(cur);
          flashBanner('Nouvelle donne', 'info', 'Tout le monde a passé', 1200);
        }
        setThinking(null);
        sync();
        schedule();
      }, 850 * speed);
      return;
    }

    if (st.phase === 'playing') {
      if (awaitingCollect(st)) {
        setThinking(null);
        timer.current = setTimeout(() => {
          const cur = stateRef.current!;
          collectTrick(cur);
          sync();
          schedule();
        }, 1000 * speed);
        return;
      }
      const seat = nextToPlay(st);
      if (seat === null) return;
      if (seat === HUMAN) {
        setThinking(null);
        return;
      }
      setThinking(seat);
      timer.current = setTimeout(() => {
        const cur = stateRef.current!;
        if (cur.phase !== 'playing' || nextToPlay(cur) !== seat) return;
        const card = botPlay(cur, seat, cur.playerLevel[seat] ?? 'normal');
        enginePlay(cur, seat, card);
        setThinking(null);
        sync();
        schedule();
      }, 800 * speed);
      return;
    }
    setThinking(null);
  }, [flashBanner, sync]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!view) return;
    if (dealing) return;
    schedule();
  }, [view, dealing, schedule]);

  /* ---------------------------------------------------------- démarrage -- */

  const newMatch = useCallback((opts: { target: number; level: BotLevel; names?: [string, string, string, string]; seed?: number }) => {
    clearTimers();
    seqRef.current = 0;
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    const names = opts.names ?? ['Vous', 'Ouest', 'Partenaire', 'Est'];
    const st = createMatch({
      seed,
      target: opts.target,
      level: opts.level,
      names,
      kinds: ['human', 'bot', 'bot', 'bot'],
      levels: [null, opts.level, opts.level, opts.level],
    });
    startHand(st);
    stateRef.current = st;
    setTrickWin(null);
    setBanner(null);
    setDealing(true);
    setView(buildView(st, HUMAN));
    if (dealTimer.current) clearTimeout(dealTimer.current);
    dealTimer.current = setTimeout(() => setDealing(false), settingsRef.current.fastPlay ? 700 : 1700);
  }, [clearTimers]);

  const quit = useCallback(() => {
    clearTimers();
    stateRef.current = null;
    setView(null);
    setDealing(false);
    setBanner(null);
    setThinking(null);
  }, [clearTimers]);

  /* ------------------------------------------------------------- actions -- */

  const play = useCallback((card: Card) => {
    const st = stateRef.current;
    if (!st || st.phase !== 'playing') return false;
    if (nextToPlay(st) !== HUMAN) {
      showToast('Ce n’est pas votre tour.');
      playSound('error');
      return false;
    }
    const legal = legalFor(st, HUMAN);
    if (!legal.some((c) => c.id === card.id)) {
      const why = describeIllegal(st, HUMAN, card);
      showToast(why ?? 'Carte non autorisée.');
      playSound('error');
      vibrate(60, settingsRef.current.vibrate);
      return false;
    }
    enginePlay(st, HUMAN, card);
    vibrate(18, settingsRef.current.vibrate);
    sync();
    schedule();
    return true;
  }, [schedule, showToast, sync]);

  const accept = useCallback(() => {
    const st = stateRef.current;
    if (!st || st.phase !== 'contract' || st.contract!.turn !== HUMAN) return;
    applyAction(st, HUMAN, { type: 'accept' });
    playSound('click');
    sync();
    schedule();
  }, [schedule, sync]);

  const pass = useCallback(() => {
    const st = stateRef.current;
    if (!st || st.phase !== 'contract' || st.contract!.turn !== HUMAN) return;
    applyAction(st, HUMAN, { type: 'pass' });
    playSound('click');
    sync();
    schedule();
  }, [schedule, sync]);

  const take = useCallback((suit: Suit) => {
    const st = stateRef.current;
    if (!st || st.phase !== 'contract' || st.contract!.turn !== HUMAN) return;
    applyAction(st, HUMAN, { type: 'take', suit });
    playSound('click');
    sync();
    schedule();
  }, [schedule, sync]);

  const nextHand = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    if (st.phase === 'handOver') {
      startHand(st);
      setTrickWin(null);
      setDealing(true);
      sync();
      if (dealTimer.current) clearTimeout(dealTimer.current);
      dealTimer.current = setTimeout(() => setDealing(false), settingsRef.current.fastPlay ? 700 : 1700);
      schedule();
    }
  }, [schedule, sync]);

  const matchOver = view?.phase === 'matchOver';

  // fin de match : petit son de victoire/défaite une seule fois
  const endedRef = useRef(false);
  useEffect(() => {
    if (view?.phase === 'matchOver' && !endedRef.current) {
      endedRef.current = true;
      const myTeam = TEAM_OF[HUMAN];
      playSound(view.winnerTeam === myTeam ? 'win' : 'lose');
    }
    if (view?.phase !== 'matchOver') endedRef.current = false;
  }, [view?.phase, view?.winnerTeam]);

  // annonces belote de l'humain / des bots : vibration douce
  useEffect(() => {
    if (banner?.kind === 'belote') vibrate([25, 40, 25], settingsRef.current.vibrate);
  }, [banner]);

  return useMemo(
    () => ({ view, dealing, banner, toast, trickWin, thinking, matchOver, newMatch, play, accept, pass, take, nextHand, quit }),
    [view, dealing, banner, toast, trickWin, thinking, matchOver, newMatch, play, accept, pass, take, nextHand, quit],
  );
}

export { SEATS };
