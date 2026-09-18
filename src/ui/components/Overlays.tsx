/* ============================================================================
 * Panneaux : contrat, décompte de manche, victoire, menu, messages.
 * ==========================================================================*/

import { useMemo } from 'react';
import type { HandResult, Seat, Suit } from '../../game/types';
import { SEATS, SUIT_NAME_FR, SUIT_SYMBOL, TEAM_OF } from '../../game/types';
import type { GameView } from '../../game/views';
import { PlayingCard, SuitBadge } from '../Card';

/* ------------------------------------------------------------ contrat ----- */

export function ContractPanel({
  view, me, onAccept, onPass, onTake, compact,
}: {
  view: GameView; me: Seat; onAccept: () => void; onPass: () => void; onTake: (s: Suit) => void; compact?: boolean;
}) {
  const c = view.contract;
  const myTeam = TEAM_OF[me];
  const firstRound = c?.firstRound ?? true;
  const proposed = c?.proposed;
  const myTurn = c?.turn === me;
  const speaker = view.players.find((p) => p.seat === c?.turn);
  const passed = useMemo(() => {
    const out: Seat[] = [];
    c?.passes.forEach((p, i) => { if (p && view.contract?.firstRound) out.push(i as Seat); });
    return out;
  }, [c?.passes, view.contract?.firstRound]);

  const label = (s: Seat) => (s === me ? 'Vous' : view.players[s].name);

  return (
    <div className={`contract-panel ${myTurn ? 'is-active' : ''} ${compact ? 'is-compact' : ''}`}>
      <div className="contract-panel__head">
        <div className="contract-panel__card">
          {c?.faceUp && <PlayingCard card={c.faceUp} size={compact ? 'sm' : 'md'} static />}
        </div>
        <div className="contract-panel__text">
          {firstRound ? (
            <>
              <strong>Carte retournée&nbsp;: {c?.faceUp ? `${c.faceUp.rank === '10' ? '10' : c.faceUp.rank}${SUIT_SYMBOL[c.faceUp.suit]}` : ''}</strong>
              <span>Couleur proposée&nbsp;: <b>{proposed ? SUIT_NAME_FR[proposed] : ''} {proposed ? SUIT_SYMBOL[proposed] : ''}</b></span>
              {passed.length > 0 && (
                <span className="contract-panel__passes">
                  Passent : {passed.map((s) => label(s)).join(', ')}
                </span>
              )}
            </>
          ) : (
            <>
              <strong>Deuxième tour</strong>
              <span>
                {passed.length + view.contract!.secondCandidates.length >= 4 || passed.length > 0
                  ? `Couleur refusée : ${SUIT_NAME_FR[proposed!]} ${SUIT_SYMBOL[proposed!]} — choisissez une autre couleur.`
                  : 'Personne n’a pris : choisissez une autre couleur.'}
              </span>
            </>
          )}
        </div>
      </div>

      {myTurn ? (
        <div className="contract-panel__actions">
          {firstRound ? (
            <>
              <button type="button" className="btn btn--take" onClick={onAccept}>
                Prendre à {SUIT_SYMBOL[proposed!]} <small>atout {SUIT_NAME_FR[proposed!]}</small>
              </button>
              <button type="button" className="btn btn--ghost" onClick={onPass}>Passer</button>
            </>
          ) : (
            <>
              <div className="contract-panel__suits">
                {(Object.keys(SUIT_SYMBOL) as Suit[]).map((s) => (
                  <SuitBadge
                    key={s}
                    suit={s}
                    size="lg"
                    label={SUIT_NAME_FR[s]}
                    disabled={s === proposed}
                    active={false}
                    onClick={s === proposed ? undefined : () => onTake(s)}
                  />
                ))}
              </div>
              <button type="button" className="btn btn--ghost" onClick={onPass}>Passer</button>
            </>
          )}
        </div>
      ) : (
        <div className="contract-panel__waiting">
          <span className="dot-pulse" />
          {speaker ? `${label(speaker.seat)} ${speaker.seat === me ? 'devez' : 'doit'} décider…` : 'Attente…'}
          {TEAM_OF[c!.turn] === myTeam ? ' — votre équipe' : ' — équipe adverse'}
        </div>
      )}
      <p className="contract-panel__hint">
        Contrat à 82 points. Prendre engage votre équipe : il faut 82 points pour ne pas être « dedans ».
      </p>
    </div>
  );
}

/* ------------------------------------------------------- décompte de manche */

function ScoreLine({ title, line, highlight, isUs }: {
  title: string; line: { cards: number; belote: number; lastTrick: number; dedans: number; total: number }; highlight?: boolean; isUs?: boolean;
}) {
  return (
    <div className={`scoreline ${isUs ? 'is-us' : 'is-them'} ${highlight ? 'is-highlight' : ''}`}>
      <h4>{title}</h4>
      <div className="scoreline__row"><span>Points des cartes</span><b>{line.cards}</b></div>
      {line.belote > 0 && <div className="scoreline__row"><span>Belote-Rebelote</span><b>+{line.belote}</b></div>}
      {line.lastTrick > 0 && <div className="scoreline__row"><span>Dernier pli</span><b>+{line.lastTrick}</b></div>}
      {line.dedans > 0 && <div className="scoreline__row is-dedans"><span>Adversaire « dedans »</span><b>+{line.dedans}</b></div>}
      {line.dedans === 0 && line.total === 0 && <div className="scoreline__row is-zero"><span>Contrat manqué</span><b>0</b></div>}
      <div className="scoreline__row scoreline__total"><span>Total de la manche</span><b>{line.total}</b></div>
    </div>
  );
}

export function ScoreBreakdown({
  view, me, onNext, canNext,
}: {
  view: GameView; me: Seat; onNext: () => void; canNext: boolean;
}) {
  const result: HandResult | undefined = view.history[view.history.length - 1];
  const myTeam = TEAM_OF[me];
  if (!result) return null;
  const winnerTeam = result.nous.total >= result.eux.total ? 0 : 1;
  const takerName = result.taker !== undefined ? view.players[result.taker].name : '—';
  return (
    <div className="overlay overlay--score">
      <div className="panel panel--score">
        <header className="panel__head">
          <span className="panel__eyebrow">Manche {result.hand} terminée</span>
          <h2>{result.contract === 'reussi' ? 'Contrat réussi' : 'Contrat manqué — Dedans !'}</h2>
          <p className="panel__sub">
            Atout <b>{result.trump ? `${SUIT_NAME_FR[result.trump]} ${SUIT_SYMBOL[result.trump]}` : '—'}</b>
            {' · '}Preneur <b>{takerName}</b>
            {' · '}Équipe <b>{TEAM_OF[result.taker ?? 0] === myTeam ? 'Nous' : 'Eux'}</b>
          </p>
        </header>
        <div className="scorelines">
          <ScoreLine
            title={`Équipe Nous${myTeam === 0 ? '' : ''}`}
            line={result.nous}
            isUs={myTeam === 0}
            highlight={winnerTeam === 0}
          />
          <ScoreLine title="Équipe Eux" line={result.eux} isUs={myTeam === 1} highlight={winnerTeam === 1} />
        </div>
        <div className="panel__match">
          <span>Match</span>
          <b className={myTeam === 0 ? 'is-us' : 'is-them'}>{result.matchNous}</b>
          <em>—</em>
          <b className={myTeam === 1 ? 'is-us' : 'is-them'}>{result.matchEux}</b>
          <span className="panel__target">/ {view.matchTarget}</span>
        </div>
        <button type="button" className="btn btn--primary" onClick={onNext} disabled={!canNext}>
          {view.phase === 'matchOver' ? 'Voir le résultat' : 'Manche suivante'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ victoire */

export function VictoryScreen({
  view, me, onPlayAgain, onLobby,
}: {
  view: GameView; me: Seat; onPlayAgain: () => void; onLobby: () => void;
}) {
  const myTeam = TEAM_OF[me];
  const won = view.winnerTeam === myTeam;
  const stats = useMemo(() => {
    const hands = view.history.length;
    let belotes = 0;
    let dedans = 0;
    let nousPts = 0;
    let euxPts = 0;
    for (const h of view.history) {
      if (h.nous.belote) belotes++;
      if (h.eux.belote) belotes++;
      if (h.contract === 'dedans') dedans++;
      nousPts += h.nous.total;
      euxPts += h.eux.total;
    }
    return {
      hands,
      belotes,
      dedans,
      avgNous: hands ? Math.round(nousPts / hands) : 0,
      avgEux: hands ? Math.round(euxPts / hands) : 0,
    };
  }, [view.history]);

  return (
    <div className={`overlay overlay--victory ${won ? 'is-win' : 'is-lose'}`}>
      {won && (
        <div className="confetti" aria-hidden>
          {Array.from({ length: 26 }).map((_, i) => (
            <i key={i} style={{ '--i': i, '--x': `${(i * 37) % 100}%`, '--d': `${(i % 7) * 0.35}s` } as React.CSSProperties} />
          ))}
        </div>
      )}
      <div className="panel panel--victory">
        <span className="panel__eyebrow">Fin du match</span>
        <h2 className="victory__title">
          {won ? 'Victoire !' : 'Défaite'}
        </h2>
        <p className="victory__sub">
          {won ? 'Bravo, votre équipe remporte la partie.' : 'L’équipe adverse remporte la partie. Revanche ?'}
        </p>
        <div className="victory__score">
          <div className={`victory__team ${myTeam === 0 ? 'is-us' : 'is-them'}`}>
            <span>Équipe Nous</span>
            <b>{view.scores[myTeam]}</b>
          </div>
          <div className="victory__vs">—</div>
          <div className={`victory__team ${myTeam === 1 ? 'is-us' : 'is-them'}`}>
            <span>Équipe Eux</span>
            <b>{view.scores[1 - myTeam]}</b>
          </div>
        </div>

        <div className="victory__stats">
          <div><b>{stats.hands}</b><span>manches</span></div>
          <div><b>{stats.belotes}</b><span>belotes</span></div>
          <div><b>{stats.dedans}</b><span>dedans</span></div>
          <div><b>{stats.avgNous}</b><span>pts Nous / manche</span></div>
          <div><b>{stats.avgEux}</b><span>pts Eux / manche</span></div>
        </div>

        <div className="victory__history">
          <h4>Historique des manches</h4>
          <div className="victory__table">
            <div className="victory__table-head">
              <span>#</span><span>Atout</span><span>Preneur</span><span>Résultat</span><span>Nous</span><span>Eux</span>
            </div>
            {[...view.history].reverse().map((h) => (
              <div className="victory__table-row" key={h.hand}>
                <span>{h.hand}</span>
                <span className={`suit-${h.trump === 'H' || h.trump === 'D' ? 'red' : 'black'}`}>
                  {h.trump ? SUIT_SYMBOL[h.trump] : '—'}
                </span>
                <span>{h.taker !== undefined ? view.players[h.taker].name : '—'}</span>
                <span className={h.contract === 'reussi' ? 'ok' : 'ko'}>
                  {h.contract === 'reussi' ? 'réussi' : 'dedans'}
                </span>
                <span>{h.nous.total}</span>
                <span>{h.eux.total}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel__actions">
          <button type="button" className="btn btn--primary" onClick={onPlayAgain}>Rejouer</button>
          <button type="button" className="btn btn--ghost" onClick={onLobby}>Retour au lobby</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- menu */

export function MenuOverlay({
  onResume, onRules, onSettings, onQuit,
}: {
  onResume: () => void; onRules: () => void; onSettings: () => void; onQuit: () => void;
}) {
  return (
    <div className="overlay overlay--menu" onClick={onResume}>
      <div className="panel panel--menu" onClick={(e) => e.stopPropagation()}>
        <h3>Menu</h3>
        <button type="button" className="btn btn--primary" onClick={onResume}>Reprendre la partie</button>
        <button type="button" className="btn btn--ghost" onClick={onRules}>Comment jouer</button>
        <button type="button" className="btn btn--ghost" onClick={onSettings}>Paramètres</button>
        <button type="button" className="btn btn--danger" onClick={onQuit}>Quitter la partie</button>
      </div>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return (
    <div className="toast" role="status">
      <span>⚠</span> {text}
    </div>
  );
}

export function BeloteHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="belote-hint">
      <b>Belote</b> — vous détenez le Roi et la Dame d’atout : +20 points pour votre équipe.
    </div>
  );
}

export { SEATS };
