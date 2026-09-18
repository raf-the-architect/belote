/* ============================================================================
 * « Comment jouer » — règles complètes avec exemples visuels.
 * ==========================================================================*/

import type { Card, Rank, Suit } from '../../game/types';
import { RANKS, SUIT_NAME_FR, SUIT_SYMBOL, SUITS } from '../../game/types';
import { PLAIN_ORDER, PLAIN_POINTS, TRUMP_ORDER, TRUMP_POINTS } from '../../game/rules';
import { PlayingCard } from '../Card';

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank, id: `${suit}-${rank}` });

function ValueRow({ rank, trump }: { rank: Rank; trump: boolean }) {
  const pts = trump ? TRUMP_POINTS[rank] : PLAIN_POINTS[rank];
  return (
    <div className={`value-row ${pts >= 10 ? 'is-strong' : pts === 0 ? 'is-weak' : ''}`}>
      <PlayingCard card={c('S', rank)} size="xs" static />
      <span className="value-row__rank">{rank === 'J' ? 'Valet' : rank === 'Q' ? 'Dame' : rank === 'K' ? 'Roi' : rank === 'A' ? 'As' : rank}</span>
      <b>{pts} pts</b>
    </div>
  );
}

export function RulesScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen screen--rules">
      <header className="screen__head">
        <button type="button" className="btn btn--back" onClick={onBack}>← Retour</button>
        <h2>Comment jouer</h2>
        <p>Belote Classique — Règles Tunisiennes. 32 cartes, 4 joueurs, 2 équipes.</p>
      </header>

      <section className="rule">
        <h3>1. Le jeu et les joueurs</h3>
        <p>
          Un jeu de <b>32 cartes</b> : ♠ Pique, ♥ Cœur, ♦ Carreau, ♣ Trèfle — du <b>7</b> à l’<b>As</b>.
          Vous jouez avec votre <b>partenaire</b> (assis en face) contre deux adversaires. Chacun reçoit <b>8 cartes</b>.
        </p>
        <div className="rule__deck">
          {SUITS.map((s) => (
            <div key={s} className="rule__suit">
              <span className={s === 'H' || s === 'D' ? 'red' : ''}>{SUIT_SYMBOL[s]} {SUIT_NAME_FR[s]}</span>
              <span className="rule__suit-ranks">{RANKS.map((r) => (r === 'J' ? 'V' : r === 'Q' ? 'D' : r === 'K' ? 'R' : r)).join(' · ')}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rule">
        <h3>2. La valeur des cartes</h3>
        <p>Le classement <b>change selon que la couleur est atout ou non</b>. C’est la règle la plus importante.</p>
        <div className="rule__tables">
          <div className="rule__table">
            <h4>À l’atout</h4>
            <div className="rule__order">{TRUMP_ORDER.map((r) => (r === 'J' ? 'V' : r === 'Q' ? 'D' : r === 'K' ? 'R' : r)).join(' > ')}</div>
            {TRUMP_ORDER.map((r) => <ValueRow key={r} rank={r} trump />)}
          </div>
          <div className="rule__table">
            <h4>Hors atout</h4>
            <div className="rule__order">{PLAIN_ORDER.map((r) => (r === 'J' ? 'V' : r === 'Q' ? 'D' : r === 'K' ? 'R' : r)).join(' > ')}</div>
            {PLAIN_ORDER.map((r) => <ValueRow key={r} rank={r} trump={false} />)}
          </div>
        </div>
        <p className="rule__example">
          Exemple : à l’atout ♠, le <b>Valet</b> bat le <b>9</b>, qui bat l’<b>As</b>, qui bat le <b>10</b>.
          Hors atout, l’<b>As</b> bat le <b>10</b>, qui bat le <b>Roi</b>… et le <b>Valet</b> ne vaut que 2 points.
        </p>
      </section>

      <section className="rule">
        <h3>3. La distribution et le contrat</h3>
        <ol className="rule__list">
          <li>Le donneur distribue <b>5 cartes</b> à chacun, puis retourne une carte.</li>
          <li>
            <b>Premier tour</b> : chacun à son tour peut <b>prendre</b> (accepter la couleur retournée comme atout) ou <b>passer</b>.
          </li>
          <li>
            <b>Deuxième tour</b> : si tout le monde a passé, chaque joueur peut choisir <b>une autre couleur</b> —
            jamais celle qui vient d’être refusée.
          </li>
          <li>Si tout le monde passe encore, on <b>redistribue</b> les cartes (le donneur change).</li>
          <li>
            Dès qu’une couleur est prise, le donneur complète : <b>3 cartes</b> par joueur, le preneur reçoit la carte
            retournée et 2 cartes. Tout le monde joue avec <b>8 cartes</b>.
          </li>
        </ol>
        <div className="rule__callout">
          <b>Le contrat : 82 points.</b> L’équipe qui prend doit totaliser au moins <b>82 points</b> dans la manche.
          Sinon elle est <b>« dedans »</b> : l’équipe adverse marque <b>162 points</b> (+ ses belotes) et le preneur ne marque rien.
        </div>
      </section>

      <section className="rule">
        <h3>4. Jouer les huit plis</h3>
        <p>
          Le preneur entame le premier pli ; ensuite, <b>le gagnant du pli entame le suivant</b>. On joue dans le sens
          des aiguilles d’une montre. Chaque pli contient 4 cartes.
        </p>
        <div className="rule__examples">
          <div>
            <h5>Fournir la couleur</h5>
            <div className="rule__mini-cards">
              <PlayingCard card={c('H', 'A')} size="xs" static />
              <PlayingCard card={c('H', '7')} size="xs" static />
              <PlayingCard card={c('D', '10')} size="xs" static />
            </div>
            <p>Le ♥ est demandé : si vous avez du ♥, vous <b>devez</b> en jouer un.</p>
          </div>
          <div>
            <h5>Couper (trumper)</h5>
            <div className="rule__mini-cards">
              <PlayingCard card={c('H', 'A')} size="xs" static />
              <PlayingCard card={c('H', '10')} size="xs" static />
              <PlayingCard card={c('S', '7')} size="xs" static isTrump />
            </div>
            <p>Sans ♥, vous pouvez <b>couper</b> avec un atout : le plus petit atout bat la plus forte carte.</p>
          </div>
          <div>
            <h5>Monter sur l’atout</h5>
            <div className="rule__mini-cards">
              <PlayingCard card={c('S', '9')} size="xs" static isTrump />
              <PlayingCard card={c('S', 'A')} size="xs" static isTrump />
              <PlayingCard card={c('S', 'J')} size="xs" static isTrump />
            </div>
            <p>
              Un adversaire a déjà coupé : vous devez <b>monter</b> si vous pouvez. Le partenaire du maître, lui,
              reste libre (« pisser »).
            </p>
          </div>
        </div>
      </section>

      <section className="rule">
        <h3>5. Belote-Rebelote</h3>
        <p>
          Si vous détenez le <b>Roi</b> et la <b>Dame d’atout</b>, vous avez la <b>Belote</b> : vous l’annoncez en jouant la
          première des deux cartes, puis <b>Rebelote</b> en jouant la seconde.
        </p>
        <div className="rule__belote">
          <PlayingCard card={c('H', 'K')} size="sm" static isTrump belote />
          <PlayingCard card={c('H', 'Q')} size="sm" static isTrump belote />
          <span className="rule__belote-badge">+20 points</span>
        </div>
        <p className="rule__example">Le Roi et la Dame d’une couleur <b>normale</b> ne donnent aucun bonus.</p>
      </section>

      <section className="rule">
        <h3>6. Le décompte</h3>
        <ul className="rule__list">
          <li><b>152 points</b> de cartes dans le jeu.</li>
          <li><b>+10 points</b> pour l’équipe qui remporte le <b>dernier pli</b>.</li>
          <li><b>+20 points</b> pour la belote-rebelote.</li>
          <li>Soit <b>162 points</b> par manche, belote en plus.</li>
        </ul>
        <div className="rule__sample">
          <div className="rule__sample-col">
            <h5>Équipe Nous</h5>
            <span>Points des cartes<b>72</b></span>
            <span>Belote-Rebelote<b>+20</b></span>
            <span>Dernier pli<b>+10</b></span>
            <span className="total">Total de la manche<b>102</b></span>
          </div>
          <div className="rule__sample-col">
            <h5>Équipe Eux</h5>
            <span>Points des cartes<b>60</b></span>
            <span className="total">Total de la manche<b>60</b></span>
          </div>
        </div>
        <p className="rule__example">
          Ici, l’équipe « Nous » a pris et totalise 102 points ≥ 82 : <b>contrat réussi</b>.
        </p>
      </section>

      <section className="rule">
        <h3>7. Gagner le match</h3>
        <p>
          Les points de chaque manche s’additionnent. La première équipe à atteindre l’<b>objectif</b>
          (501, 701, 1001 ou 1501 points selon la partie) remporte le match. On enchaîne les manches,
          le donneur tourne à chaque fois.
        </p>
        <div className="rule__callout">
          <b>Astuces de base :</b> prenez avec une couleur longue et bien atoutée (Valet + 9 d’atout, des As à côté) ;
          tirez les atouts adverses quand vous êtes maître du contrat ; ne gaspillez pas vos maîtresses pour un pli vide ;
          et pensez au <b>dernier pli</b>, il vaut 10 points.
        </div>
      </section>

      <button type="button" className="btn btn--primary btn--xl" onClick={onBack}>J’ai compris</button>
    </div>
  );
}
