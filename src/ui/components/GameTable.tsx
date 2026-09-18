/* ============================================================================
 * Le tapis de jeu — table complète, 4 sièges, pli central, main du joueur.
 * ==========================================================================*/

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Card, Seat, Suit } from '../../game/types';
import { RANK_LABEL, SEATS, SUIT_NAME_FR, SUIT_SYMBOL, TEAM_OF } from '../../game/types';
import { sortHand, strength } from '../../game/rules';
import type { GameView } from '../../game/views';
import { CardBack, PlayingCard, SuitBadge } from '../Card';
import type { Banner, TrickWinFx } from '../useLocalGame';

const POSITIONS: Record<number, 'sud' | 'ouest' | 'nord' | 'est'> = { 0: 'sud', 1: 'ouest', 2: 'nord', 3: 'est' };

/** position d'un siège relativement à mon siège (0 = moi en bas) */
function relSeat(seat: Seat, me: Seat): 0 | 1 | 2 | 3 {
  return (((seat - me) % 4 + 4) % 4) as 0 | 1 | 2 | 3;
}

/* ------------------------------------------------------------------ en-tête */

export function TopBar({
  view, me, trump, onMenu, sound, onToggleSound, levelLabel,
}: {
  view: GameView; me: Seat; trump: Suit | null; onMenu: () => void; sound: boolean; onToggleSound: () => void; levelLabel?: string;
}) {
  const myTeam = TEAM_OF[me];
  const nous = view.scores[myTeam];
  const eux = view.scores[1 - myTeam];
  const progress = Math.min(100, (Math.max(nous, eux) / view.matchTarget) * 100);
  return (
    <header className="topbar">
      <button type="button" className="topbar__icon" onClick={onMenu} aria-label="Menu">☰</button>
      <div className="topbar__scores">
        <div className="score-pill score-pill--us">
          <span className="score-pill__label">Équipe Nous</span>
          <span className="score-pill__value" key={`n-${nous}`}>{nous}</span>
        </div>
        <div className="score-pill score-pill--them">
          <span className="score-pill__label">Équipe Eux</span>
          <span className="score-pill__value" key={`e-${eux}`}>{eux}</span>
        </div>
        <div className="score-target">
          <span>Manche {view.hand}</span>
          <span className="score-target__sep">·</span>
          <span>Objectif {view.matchTarget}</span>
          {levelLabel && (<><span className="score-target__sep">·</span><span>{levelLabel}</span></>)}
        </div>
        <div className="score-bar" aria-hidden><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className={`trump-badge ${trump ? 'is-set' : 'is-pending'}`}>
        <span className="trump-badge__sym">{trump ? SUIT_SYMBOL[trump] : '?'}</span>
        <span className="trump-badge__label">{trump ? SUIT_NAME_FR[trump] : 'Atout'}</span>
      </div>
      <button type="button" className="topbar__icon" onClick={onToggleSound} aria-label={sound ? 'Couper le son' : 'Activer le son'}>
        {sound ? '🔊' : '🔈'}
      </button>
    </header>
  );
}

/* -------------------------------------------------------------- les sièges */

function SeatBox({
  view, seat, rel, thinking, isDealer, isDeclaring, cardsLeft, passed,
}: {
  view: GameView; seat: Seat; rel: 0 | 1 | 2 | 3; thinking: boolean; isDealer: boolean; isDeclaring: boolean; cardsLeft: number; passed?: boolean;
}) {
  const player = view.players.find((p) => p.seat === seat)!;
  const isTurn = view.turn === seat && (view.phase === 'playing' || view.phase === 'contract');
  const beloteHeld = view.belote.holders.includes(seat);
  const beloteDone = view.belote.announced.includes(seat);
  const label = rel === 2 ? 'Partenaire' : rel === 1 ? 'Ouest' : 'Est';
  const levelTag = player.kind === 'bot' ? { facile: '★', normal: '★★', expert: '★★★' }[player.level ?? 'normal'] : null;

  return (
    <div className={`seat seat--${POSITIONS[rel]} ${isTurn ? 'is-turn' : ''} ${thinking ? 'is-thinking' : ''}`}>
      <div className="seat__avatar" data-initial={player.name.slice(0, 1).toUpperCase()}>
        <span className="seat__ring" />
      </div>
      <div className="seat__info">
        <span className="seat__name">
          {label} <em>{player.name}</em>
        </span>
        <span className="seat__tags">
          {isDealer && <i className="tag tag--dealer" title="Donneur">D</i>}
          {isDeclaring && <i className="tag tag--declare" title="Équipe qui a pris">preneur</i>}
          {beloteHeld && <i className="tag tag--belote" title="Belote : Roi et Dame d’atout">belote{beloteDone ? ' ✓' : ''}</i>}
          {passed && <i className="tag tag--pass" title="A passé">passé</i>}
          {levelTag && <i className="tag tag--bot" title={`Bot ${player.level}`}>{levelTag}</i>}
        </span>
      </div>
      <div className="seat__back" aria-label={`${cardsLeft} cartes`}>
        {Array.from({ length: Math.min(5, Math.max(0, cardsLeft)) }).map((_, i) => (
          <CardBack key={i} size="xs" className="seat__back-card" style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
      {thinking && <span className="seat__thinking">réfléchit…</span>}
    </div>
  );
}

/* --------------------------------------------------------------- pli central */

function TricksHistoryStrip({ view, me }: { view: GameView; me: Seat }) {
  const myTeam = TEAM_OF[me];
  const recent = view.tricks.slice(-3).reverse();
  return (
    <div className="history-strip">
      <span className="history-strip__title">Plis récents</span>
      {recent.length === 0 && <span className="history-strip__empty">—</span>}
      {recent.map((t) => {
        const us = TEAM_OF[t.winner] === myTeam;
        return (
          <div key={`${t.cards[0]?.card.id}-${t.winner}`} className={`history-row ${us ? 'is-us' : 'is-them'}`}>
            <span className="history-row__mini">
              {t.cards.map((tc) => (
                <PlayingCard key={tc.card.id} card={tc.card} size="xs" static isTrump={view.trump === tc.card.suit} />
              ))}
            </span>
            <span className="history-row__meta">
              <b>{us ? 'Nous' : 'Eux'}</b>
              <i>+{t.points}</i>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- la main */

export function HandFan({
  cards, trump, legalIds, selected, onSelect, onPlay, disabled, me, dealing, cardsLeft,
}: {
  cards: Card[]; trump: Suit | null; legalIds: string[]; selected: Card | null;
  onSelect: (c: Card) => void; onPlay: (c: Card) => void; disabled: boolean; me: Seat; dealing: boolean; cardsLeft: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = cards.length;
  const cardW = Math.max(38, Math.min(78, width / Math.max(4.6, n * 0.62)));
  const cardH = cardW * 1.42;
  const step = n > 1 ? Math.min(cardW * 0.92, (width - cardW - 8) / (n - 1)) : 0;
  const total = cardW + step * (n - 1);
  const startX = Math.max(2, (width - total) / 2);

  return (
    <div className="hand-fan" ref={ref} style={{ height: cardH + 26 }}>
      {cards.map((c, i) => {
        const playable = legalIds.includes(c.id);
        const isSel = selected?.id === c.id;
        const mid = (n - 1) / 2;
        const arc = n > 1 ? ((i - mid) / Math.max(1, mid)) : 0;
        const lift = isSel ? -20 : 0;
        const y = Math.abs(arc) * Math.min(10, cardH * 0.09) + lift;
        const rot = arc * Math.min(7, 3 + n * 0.5);
        return (
          <div
            key={c.id}
            className={`hand-fan__slot ${dealing ? 'is-dealing' : ''}`}
            style={{
              left: startX + i * step,
              top: y,
              width: cardW,
              zIndex: isSel ? 60 : i,
              '--deal-delay': `${i * 55}ms`,
            } as React.CSSProperties}
          >
            <PlayingCard
              card={c}
              size="md"
              selected={isSel}
              disabled={disabled || !playable}
              dimmed={!playable && !disabled}
              isTrump={trump === c.suit}
              belote={!!trump && c.suit === trump && (c.rank === 'K' || c.rank === 'Q')}
              onClick={(card) => onSelect(card)}
              className="hand-fan__card"
              style={
                {
                  '--rot': `${rot}deg`,
                  width: cardW,
                  height: cardH,
                  transform: `rotate(${rot}deg)${isSel ? ' translateY(-6px)' : ''}`,
                  transformOrigin: '50% 130%',
                } as React.CSSProperties
              }
            />
          </div>
        );
      })}
      <span className="hand-fan__count" aria-hidden>{cardsLeft} cartes</span>
    </div>
  );
}

/* --------------------------------------------------------------- barre d'action */

export function ActionBar({
  view, me, selected, onPlay, onSelectHint, canPlay,
}: {
  view: GameView; me: Seat; selected: Card | null; onPlay: () => void; onSelectHint: () => void; canPlay: boolean;
}) {
  const myTeam = TEAM_OF[me];
  const declaring = view.declaringTeam !== null && view.declaringTeam === myTeam;
  const isTurn = view.turn === me && view.phase === 'playing';
  const waiting = view.phase === 'playing' && !isTurn && !view.pendingCollect;
  return (
    <div className={`actionbar ${isTurn ? 'is-my-turn' : ''}`}>
      <div className="actionbar__status">
        {view.phase === 'playing' && (
          <>
            <span className="actionbar__pli">Pli {Math.min(8, view.tricksPlayed + (view.pendingCollect ? 1 : 1))} / 8</span>
            {isTurn ? (
              <span className="actionbar__turn is-you">À vous de jouer</span>
            ) : view.pendingCollect ? (
              <span className="actionbar__turn">Pli ramassé…</span>
            ) : waiting ? (
              <span className="actionbar__turn">
                {view.players.find((p) => p.seat === view.turn)?.name ?? ''} joue…
              </span>
            ) : null}
            <span className={`actionbar__contract ${declaring ? 'is-us' : 'is-them'}`}>
              {declaring ? 'Contrat : Nous' : 'Contrat : Eux'}
            </span>
          </>
        )}
        {view.phase === 'contract' && <span className="actionbar__turn">Choisissez le contrat</span>}
      </div>
      <button
        type="button"
        className="btn btn--play"
        disabled={!canPlay}
        onClick={selected ? onPlay : onSelectHint}
      >
        {selected ? <>Jouer cette carte <b>{RANK_LABEL[selected.rank]}{SUIT_SYMBOL[selected.suit]}</b></> : 'Sélectionnez une carte'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ le tapis */

export function Felt({
  view, me, children, banner, trickWin, dealing,
}: {
  view: GameView; me: Seat; children?: React.ReactNode; banner: Banner | null; trickWin: TrickWinFx | null; dealing?: boolean;
}) {
  const rel = (s: Seat) => relSeat(s, me);
  const myTeam = TEAM_OF[me];
  const inTrick = new Set(view.trick.map((t) => t.seat));
  const passedSeats = useMemo(() => {
    if (view.phase !== 'contract' || !view.contract) return new Set<Seat>();
    const out = new Set<Seat>();
    view.contract.passes.forEach((p, i) => { if (p) out.add(i as Seat); });
    return out;
  }, [view.phase, view.contract]);

  return (
    <div className={`felt ${banner ? `felt--${banner.kind}` : ''} ${trickWin ? 'felt--win' : ''}`}>
      <div className="felt__pattern" aria-hidden />
      <div className={`felt__inner ${dealing ? 'is-dealing' : ''}`}>
        {([0, 1, 2, 3] as Seat[]).filter((s) => s !== me).map((s) => (
          <SeatBox
            key={s}
            view={view}
            seat={s}
            rel={rel(s)}
            thinking={view.turn === s && view.phase !== 'handOver'}
            isDealer={view.dealer === s}
            isDeclaring={view.declaringTeam !== null && TEAM_OF[s] === view.declaringTeam}
            cardsLeft={view.players[s].cards}
            passed={passedSeats.has(s)}
          />
        ))}

        <div className="trick">
          {view.trick.map((tc) => {
            const r = rel(tc.seat);
            const win = view.trick.length === 4 && trickWin && trickWin.seat === tc.seat && trickWin.points >= 0;
            return (
              <div key={tc.card.id} className={`trick__slot trick__slot--${POSITIONS[r]} ${win ? 'is-win' : ''}`}>
                <PlayingCard
                  card={tc.card}
                  size="lg"
                  static
                  className="trick__card"
                  isTrump={view.trump === tc.card.suit}
                />
              </div>
            );
          })}
          {view.trick.length === 0 && (
            <div className="trick__empty">
              {view.tricksPlayed > 0 && view.lastTrick ? (
                <>
                  <span className="trick__empty-label">Dernier pli</span>
                  <span className={`trick__empty-winner ${TEAM_OF[view.lastTrick.winner] === myTeam ? 'is-us' : 'is-them'}`}>
                    {TEAM_OF[view.lastTrick.winner] === myTeam ? 'Nous' : 'Eux'} +{view.lastTrick.points}
                  </span>
                </>
              ) : (
                <span className="trick__empty-label">
                  {view.phase === 'contract' ? 'Contrat en cours…' : 'À vous d’ouvrir le pli'}
                </span>
              )}
            </div>
          )}
          {trickWin && view.trick.length === 4 && (
            <div className={`trick__win-badge ${TEAM_OF[trickWin.seat] === myTeam ? 'is-us' : 'is-them'}`}>
              {TEAM_OF[trickWin.seat] === myTeam ? 'Nous' : 'Eux'} +{trickWin.points}
            </div>
          )}
        </div>

        <TricksHistoryStrip view={view} me={me} />
        {children}
      </div>
      {banner && (
        <div className={`banner banner--${banner.kind}`} key={banner.id}>
          <span className="banner__text">{banner.text}</span>
          {banner.sub && <span className="banner__sub">{banner.sub}</span>}
        </div>
      )}
      {inTrick.size === 0 && view.phase === 'contract' && <span className="felt__watermark">BELOTE TUNISIE</span>}
    </div>
  );
}

export { SEATS, strength };
