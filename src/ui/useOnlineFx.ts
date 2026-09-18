/* ============================================================================
 * Effets visuels/sonores dérivés des vues reçues en multijoueur.
 * ==========================================================================*/

import { useEffect, useRef, useState } from 'react';
import type { GameView } from '../game/views';
import { SUIT_SYMBOL } from '../game/types';
import { playSound, vibrate } from './sound';
import type { Banner, TrickWinFx } from './useLocalGame';

export function useOnlineFx(view: GameView | null, vibrateOn: boolean) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [trickWin, setTrickWin] = useState<TrickWinFx | null>(null);
  const prev = useRef<{ tricks: number; belote: number; hand: number; rebelote: number }>({ tricks: 0, belote: 0, hand: 0, rebelote: 0 });
  const idRef = useRef(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!view) return;
    const p = prev.current;
    if (view.hand !== p.hand) {
      prev.current = { tricks: view.tricksPlayed, belote: view.belote.announced.length, rebelote: view.belote.rebelote.length, hand: view.hand };
      setTrickWin(null);
      playSound('deal');
      return;
    }
    if (view.belote.announced.length > p.belote) {
      const seat = view.belote.announced[view.belote.announced.length - 1];
      const rebelote = view.belote.rebelote.length > p.rebelote;
      setBanner({ id: idRef.current++, text: rebelote ? 'REBELOTE !' : 'BELOTE !', sub: view.players[seat].name, kind: 'belote' });
      playSound('belote');
      vibrate([25, 40, 25], vibrateOn);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setBanner(null), 1900);
    }
    if (view.tricksPlayed > p.tricks && view.lastTrick) {
      setTrickWin({ id: idRef.current++, seat: view.lastTrick.winner, points: view.lastTrick.points });
      playSound('trick');
    }
    if (view.phase === 'handOver' && p.tricks !== view.tricksPlayed) {
      playSound('score');
    }
    prev.current = {
      tricks: view.tricksPlayed,
      belote: view.belote.announced.length,
      rebelote: view.belote.rebelote.length,
      hand: view.hand,
    };
  }, [view, vibrateOn]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { banner, trickWin, suitLabel: (s: keyof typeof SUIT_SYMBOL) => SUIT_SYMBOL[s] };
}
