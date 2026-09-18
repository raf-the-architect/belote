/* ============================================================================
 * Écran de jeu unifié (solo et multijoueur).
 * ==========================================================================*/

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BotLevel, Card, Seat, Suit } from '../game/types';
import { SEATS, TEAM_OF } from '../game/types';
import { sortHand } from '../game/rules';
import type { GameView } from '../game/views';
import { ActionBar, Felt, HandFan, TopBar } from './components/GameTable';
import { BeloteHint, ContractPanel, MenuOverlay, ScoreBreakdown, Toast, VictoryScreen } from './components/Overlays';
import type { Banner, TrickWinFx } from './useLocalGame';
import { LEVEL_LABEL, type Settings } from './settings';

export interface GameApi {
  view: GameView;
  me: Seat;
  dealing: boolean;
  banner: Banner | null;
  toast: { id: number; text: string } | null;
  trickWin: TrickWinFx | null;
  thinking: Seat | null;
  play: (card: Card) => void;
  accept: () => void;
  pass: () => void;
  take: (suit: Suit) => void;
  nextHand: () => void;
  /** en ligne : secondes avant la manche suivante automatique */
  autoNextIn?: number | null;
}

export function GameScreen({
  api, settings, onQuit, onRules, onSettings, onToggleSound, onlineLabel, onPlayAgain, onLobby,
}: {
  api: GameApi;
  settings: Settings;
  onQuit: () => void;
  onRules: () => void;
  onSettings: () => void;
  onToggleSound: () => void;
  onlineLabel?: string;
  onPlayAgain?: () => void;
  onLobby?: () => void;
}) {
  const { view, me } = api;
  const [selected, setSelected] = useState<Card | null>(null);
  const [menu, setMenu] = useState(false);
  const lastHand = useRef(view.hand);

  useEffect(() => {
    if (lastHand.current !== view.hand) {
      lastHand.current = view.hand;
      setSelected(null);
    }
  }, [view.hand]);

  // la main disparaît de la sélection dès qu'elle est jouée
  useEffect(() => {
    if (selected && !view.cards.some((c) => c.id === selected.id)) setSelected(null);
  }, [view.cards, selected]);

  const sorted = useMemo(() => sortHand(view.cards, view.trump), [view.cards, view.trump]);
  const legalIds = useMemo(() => new Set(view.legal), [view.legal]);
  const myTurn = view.turn === me;
  const canPlay = view.phase === 'playing' && myTurn && !view.pendingCollect && !!selected && legalIds.has(selected.id);
  const isContract = view.phase === 'contract';
  const level: BotLevel = (view.players[1].level ?? 'normal');
  const beloteMine = view.belote.holders.includes(me) && !!view.trump;
  const lastResult = view.history[view.history.length - 1];
  const winners = view.winnerTeam !== undefined && view.phase === 'matchOver';

  const onSelect = (card: Card) => {
    if (view.phase !== 'playing' || !myTurn) return;
    if (!legalIds.has(card.id)) return;
    setSelected((cur) => (cur?.id === card.id ? null : card));
  };

  const playSelected = () => {
    if (!selected) return;
    api.play(selected);
    setSelected(null);
  };

  return (
    <div className={`game ${settings.leftHanded ? 'is-left-handed' : ''}`}>
      <TopBar
        view={view}
        me={me}
        trump={view.trump}
        onMenu={() => setMenu(true)}
        sound={settings.sound}
        onToggleSound={onToggleSound}
        levelLabel={onlineLabel ?? `Bots ${LEVEL_LABEL[level]}`}
      />

      <Felt view={view} me={me} banner={api.banner} trickWin={api.trickWin} dealing={api.dealing} />

      <div className="bottom">
        {isContract && view.contract && (
          <ContractPanel
            view={view}
            me={me}
            onAccept={api.accept}
            onPass={api.pass}
            onTake={api.take}
            compact={view.contract.firstRound}
          />
        )}

        {view.phase === 'playing' && (
          <ActionBar
            view={view}
            me={me}
            selected={selected}
            onPlay={playSelected}
            onSelectHint={() => undefined}
            canPlay={canPlay}
          />
        )}

        {beloteMine && settings.showHints && view.belote.announced.length < 2 && (
          <BeloteHint show={!view.belote.announced.includes(me) || !view.belote.rebelote.includes(me)} />
        )}

        <HandFan
          cards={sorted}
          trump={view.trump}
          legalIds={view.legal}
          selected={selected}
          onSelect={onSelect}
          onPlay={(c) => { api.play(c); setSelected(null); }}
          disabled={api.dealing || view.phase !== 'playing' || !myTurn}
          me={me}
          dealing={api.dealing}
          cardsLeft={sorted.length}
        />
      </div>

      {api.toast && <Toast key={api.toast.id} text={api.toast.text} />}
      {api.dealing && (
        <div className="dealing-flash" aria-hidden>
          <span>Distribution…</span>
        </div>
      )}

      {view.phase === 'handOver' && !winners && (
        <ScoreBreakdown
          view={view}
          me={me}
          onNext={api.nextHand}
          canNext={!!lastResult}
        />
      )}

      {api.autoNextIn !== undefined && api.autoNextIn !== null && view.phase === 'handOver' && (
        <div className="auto-next">Manche suivante dans {api.autoNextIn} s</div>
      )}

      {winners && (
        <VictoryScreen
          view={view}
          me={me}
          onPlayAgain={onPlayAgain ?? onQuit}
          onLobby={onLobby ?? onQuit}
        />
      )}

      {menu && (
        <MenuOverlay
          onResume={() => setMenu(false)}
          onRules={() => { setMenu(false); onRules(); }}
          onSettings={() => { setMenu(false); onSettings(); }}
          onQuit={onQuit}
        />
      )}
    </div>
  );
}

export { TEAM_OF, SEATS };
