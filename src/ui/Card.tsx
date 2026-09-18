/* ============================================================================
 * Rendu des cartes — 100 % CSS, lisible sur petit écran.
 * ==========================================================================*/

import type { Card, Suit } from '../game/types';
import { RANK_LABEL, SUIT_SYMBOL } from '../game/types';

const RED: Record<Suit, boolean> = { H: true, D: true, C: false, S: false };

export interface CardProps {
  card: Card;
  /** petite taille (historique, mini-plis) */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
  /** anneau doré belote (R/D d'atout) */
  belote?: boolean;
  isTrump?: boolean;
  onClick?: (card: Card) => void;
  style?: React.CSSProperties;
  className?: string;
  /** aperçu non interactif */
  static?: boolean;
  title?: string;
}

export function PlayingCard({
  card, size = 'md', selected, disabled, dimmed, belote, isTrump, onClick, style, className = '', static: isStatic, title,
}: CardProps) {
  const red = RED[card.suit];
  const sym = SUIT_SYMBOL[card.suit];
  const label = RANK_LABEL[card.rank];
  const isCourt = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  const cls = [
    'card',
    `card--${size}`,
    red ? 'card--red' : 'card--black',
    selected ? 'is-selected' : '',
    disabled ? 'is-disabled' : '',
    dimmed ? 'is-dimmed' : '',
    isTrump ? 'is-trump' : '',
    belote ? 'is-belote' : '',
    className,
  ].filter(Boolean).join(' ');

  const content = (
    <>
      <span className="card__corner card__corner--tl">
        <b>{label}</b>
        <i>{sym}</i>
      </span>
      <span className="card__center">
        {isCourt ? (
          <span className={`card__court card__court--${card.rank.toLowerCase()}`}>
            <span className="card__court-letter">{label}</span>
            <span className="card__court-suit">{sym}</span>
          </span>
        ) : (
          <span className="card__pip">{sym}</span>
        )}
      </span>
      <span className="card__corner card__corner--br">
        <b>{label}</b>
        <i>{sym}</i>
      </span>
      {isTrump && <span className="card__trump-dot" aria-hidden />}
    </>
  );

  if (isStatic || !onClick) {
    return (
      <span className={cls} style={style} title={title} role="img" aria-label={`${label}${sym}`}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      style={style}
      title={title}
      aria-label={`${label}${sym}`}
      aria-pressed={selected}
      onClick={() => !disabled && onClick(card)}
    >
      {content}
    </button>
  );
}

/** Dos de carte : liseré doré + motif tunisien discret. */
export function CardBack({ size = 'sm', className = '', style }: { size?: 'xs' | 'sm' | 'md'; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`card card--${size} card--back ${className}`} style={style} aria-hidden>
      <span className="card__back-pattern" />
    </span>
  );
}

/** Petit badge de couleur (atout, propositions…). */
export function SuitBadge({
  suit, active, onClick, label, disabled, size = 'md',
}: {
  suit: Suit; active?: boolean; onClick?: () => void; label?: string; disabled?: boolean; size?: 'sm' | 'md' | 'lg';
}) {
  const red = RED[suit];
  return (
    <button
      type="button"
      className={`suit-badge suit-badge--${size} ${red ? 'is-red' : 'is-black'} ${active ? 'is-active' : ''}`}
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label={label ?? suit}
    >
      <span className="suit-badge__sym">{SUIT_SYMBOL[suit]}</span>
      {label && <span className="suit-badge__label">{label}</span>}
    </button>
  );
}
