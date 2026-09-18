/* ============================================================================
 * Écran d'accueil — BELOTE TUNISIE
 * ==========================================================================*/

import type { Card, Suit } from '../../game/types';
import { PlayingCard } from '../Card';

const demo = (suit: Suit, rank: Card['rank']): Card => ({ suit, rank, id: `${suit}-${rank}` });

export function StartScreen({
  onSolo, onMultiplayer, onRules, onSettings, name, hasSavedSession, onResumeOnline,
}: {
  onSolo: () => void;
  onMultiplayer: () => void;
  onRules: () => void;
  onSettings: () => void;
  name: string;
  hasSavedSession: boolean;
  onResumeOnline: () => void;
}) {
  return (
    <div className="screen screen--start">
      <div className="start__glow" aria-hidden />
      <div className="start__pattern" aria-hidden />
      <div className="start__deco" aria-hidden>
        <PlayingCard card={demo('S', '7')} size="md" static className="start__deco-card" style={{ '--r': '-18deg', '--x': '-104px' } as React.CSSProperties} />
        <PlayingCard card={demo('D', '10')} size="md" static className="start__deco-card" style={{ '--r': '-9deg', '--x': '-52px' } as React.CSSProperties} />
        <PlayingCard card={demo('H', 'J')} size="lg" static isTrump className="start__deco-card start__deco-card--main" style={{ '--r': '0deg', '--x': '0px' } as React.CSSProperties} />
        <PlayingCard card={demo('H', 'Q')} size="md" static isTrump belote className="start__deco-card" style={{ '--r': '9deg', '--x': '52px' } as React.CSSProperties} />
        <PlayingCard card={demo('C', 'A')} size="md" static className="start__deco-card" style={{ '--r': '18deg', '--x': '104px' } as React.CSSProperties} />
      </div>

      <header className="start__title">
        <h1>
          BELOTE <span>TUNISIE</span>
        </h1>
        <p>Belote Classique — Règles Tunisiennes</p>
        <div className="start__chips">
          <span>32 cartes</span>
          <span>8 plis</span>
          <span>162 points</span>
          <span>Belote-Rebelote</span>
        </div>
      </header>

      <nav className="start__buttons">
        <button type="button" className="btn btn--primary btn--xl" onClick={onSolo}>
          <span className="btn__icon">♠</span>
          <span>
            <b>Jouer contre les bots</b>
            <small>Partie complète · 1 à 3 niveaux · manches enchaînées</small>
          </span>
        </button>
        <button type="button" className="btn btn--gold btn--xl" onClick={onMultiplayer}>
          <span className="btn__icon">♣</span>
          <span>
            <b>Multijoueur</b>
            <small>Créez une salle ou rejoignez vos amis avec un code</small>
          </span>
        </button>
        {hasSavedSession && (
          <button type="button" className="btn btn--ghost" onClick={onResumeOnline}>
            Reprendre la partie en ligne
          </button>
        )}
        <div className="start__row">
          <button type="button" className="btn btn--ghost" onClick={onRules}>Comment jouer</button>
          <button type="button" className="btn btn--ghost" onClick={onSettings}>Paramètres</button>
        </div>
      </nav>

      <footer className="start__footer">
        {name ? <span>Joueur : <b>{name}</b></span> : <span>Bienvenue à la table</span>}
        <span className="start__footer-dot">•</span>
        <span>Roi + Dame d’atout = Belote (+20)</span>
      </footer>
    </div>
  );
}
