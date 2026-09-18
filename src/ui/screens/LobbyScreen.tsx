/* ============================================================================
 * Lobby : partie solo (difficulté) et salle multijoueur.
 * ==========================================================================*/

import { useEffect, useState } from 'react';
import type { BotLevel } from '../../game/types';
import { SUIT_SYMBOL } from '../../game/types';
import type { RoomInfo } from '../../net/protocol';
import { LEVEL_DESC, LEVEL_LABEL, TARGET_OPTIONS } from '../settings';
import { PlayingCard, CardBack } from '../Card';

const LEVELS: BotLevel[] = ['facile', 'normal', 'expert'];

export function SoloLobby({
  level, target, onLevel, onTarget, onStart, onBack, name, onName, partnerName,
}: {
  level: BotLevel; target: number; onLevel: (l: BotLevel) => void; onTarget: (t: number) => void;
  onStart: () => void; onBack: () => void; name: string; onName: (n: string) => void; partnerName: string;
}) {
  return (
    <div className="screen screen--lobby">
      <header className="screen__head">
        <button type="button" className="btn btn--back" onClick={onBack}>← Accueil</button>
        <h2>Préparer la partie</h2>
        <p>Vous et votre partenaire <b>{partnerName}</b> contre deux adversaires.</p>
      </header>

      <section className="lobby__table">
        <div className="lobby__seat lobby__seat--nord">
          <CardBack size="sm" />
          <span><b>{partnerName}</b><small>Partenaire · bot {LEVEL_LABEL[level]}</small></span>
        </div>
        <div className="lobby__seat lobby__seat--ouest">
          <CardBack size="sm" />
          <span><b>Ouest</b><small>Adversaire · bot {LEVEL_LABEL[level]}</small></span>
        </div>
        <div className="lobby__seat lobby__seat--est">
          <CardBack size="sm" />
          <span><b>Est</b><small>Adversaire · bot {LEVEL_LABEL[level]}</small></span>
        </div>
        <div className="lobby__center">
          <span className="lobby__logo">Belote Tunisie</span>
          <span className="lobby__hint">Équipe Nous : Vous &amp; Partenaire — Équipe Eux : Ouest &amp; Est</span>
        </div>
        <div className="lobby__seat lobby__seat--sud">
          <PlayingCard card={{ suit: 'H', rank: 'A', id: 'H-A' }} size="sm" static />
          <span><b>{name || 'Vous'}</b><small>Vous jouez en Sud</small></span>
        </div>
      </section>

      <section className="lobby__block">
        <h3>Niveau des bots</h3>
        <div className="level-grid">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`level-card ${level === l ? 'is-active' : ''}`}
              onClick={() => onLevel(l)}
            >
              <b>{LEVEL_LABEL[l]}</b>
              <small>{LEVEL_DESC[l]}</small>
              <span className="level-card__stars">{l === 'facile' ? '★' : l === 'normal' ? '★★' : '★★★'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="lobby__block">
        <h3>Objectif du match</h3>
        <div className="target-row">
          {TARGET_OPTIONS.map((t) => (
            <button key={t} type="button" className={`chip ${target === t ? 'is-active' : ''}`} onClick={() => onTarget(t)}>
              {t} pts
            </button>
          ))}
        </div>
        <p className="lobby__note">Le match se joue en plusieurs manches, jusqu’à ce qu’une équipe atteigne l’objectif.</p>
      </section>

      <section className="lobby__block">
        <h3>Votre nom</h3>
        <input
          className="input"
          value={name}
          placeholder="Votre prénom"
          maxLength={16}
          onChange={(e) => onName(e.target.value)}
        />
      </section>

      <button type="button" className="btn btn--primary btn--xl" onClick={onStart}>
        <span className="btn__icon">{SUIT_SYMBOL.H}</span>
        <span><b>Commencer la partie</b><small>Distribution immédiate — 5 cartes puis la retournée</small></span>
      </button>
    </div>
  );
}

export function OnlineLobby({
  room, you, name, onName, onReady, onStart, onLeave, onCreate, onJoin, error, chat, onChat, level, onLevel, target, onTarget,
  connecting, connected, serverUrl, onServer, onRetry,
}: {
  room: RoomInfo | null;
  you: string | null;
  name: string;
  onName: (n: string) => void;
  onReady: (r: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  error: string | null;
  chat: { from: string; text: string; at: number }[];
  onChat: (text: string) => void;
  level: BotLevel;
  onLevel: (l: BotLevel) => void;
  target: number;
  onTarget: (t: number) => void;
  connecting: boolean;
  connected: boolean;
  serverUrl: string;
  onServer: (url: string) => void;
  onRetry: () => void;
}) {
  const [code, setCode] = useState('');
  const [server, setServer] = useState(serverUrl);
  useEffect(() => { setServer(serverUrl); }, [serverUrl]);
  const [msg, setMsg] = useState('');
  const isHost = !!room && room.hostId === you;
  const me = room?.players.find((p) => p.id === you);
  const seats = [0, 1, 2, 3].map((s) => room?.players.find((p) => p.seat === s && !p.isBot) ?? null);

  useEffect(() => {
    if (!room) setCode('');
  }, [room]);

  if (!room) {
    return (
      <div className="screen screen--lobby">
        <header className="screen__head">
          <button type="button" className="btn btn--back" onClick={onLeave}>← Accueil</button>
          <h2>Multijoueur</h2>
          <p>Jouez à 4 sur le même tapis : créez une salle et partagez le code, ou rejoignez une table.</p>
        </header>

        {error && <div className="alert">{error}</div>}

        <section className="lobby__block">
          <h3>Votre nom</h3>
          <input className="input" value={name} placeholder="Votre prénom" maxLength={16} onChange={(e) => onName(e.target.value)} />
        </section>

        <section className="lobby__block lobby__block--server">
          <h3>Serveur de jeu</h3>
          <p className="lobby__note">
            Le mode multijoueur relie les joueurs par un petit serveur de jeu (WebSocket).
            {' '}<b>Jouer contre les bots ne demande aucun serveur.</b>
          </p>
          <div className={`server-state ${connected ? 'is-on' : connecting ? 'is-wait' : 'is-off'}`}>
            <span className="server-state__dot" aria-hidden />
            {connected ? 'Connecté au serveur' : connecting ? 'Connexion en cours…' : 'Serveur non joignable'}
          </div>
          <div className="join-row">
            <input
              className="input"
              value={server}
              placeholder="wss://mon-serveur.exemple/ws"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setServer(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--gold"
              onClick={() => { onServer(server.trim()); onRetry(); }}
              disabled={connecting}
            >
              Relier
            </button>
          </div>
          <p className="lobby__hint">
            Adresse du serveur Node du jeu (par exemple <code>ws://192.168.1.20:3000</code> sur votre réseau,
            ou l'adresse d'un serveur hébergé). Elle est retenue pour les prochaines visites.
          </p>
        </section>

        <section className="lobby__block">
          <h3>Créer une salle</h3>
          <div className="level-grid level-grid--compact">
            {LEVELS.map((l) => (
              <button key={l} type="button" className={`level-card ${level === l ? 'is-active' : ''}`} onClick={() => onLevel(l)}>
                <b>{LEVEL_LABEL[l]}</b>
                <span className="level-card__stars">{l === 'facile' ? '★' : l === 'normal' ? '★★' : '★★★'}</span>
                <small>sièges vides remplis par des bots</small>
              </button>
            ))}
          </div>
          <div className="target-row">
            {TARGET_OPTIONS.map((t) => (
              <button key={t} type="button" className={`chip ${target === t ? 'is-active' : ''}`} onClick={() => onTarget(t)}>
                {t} pts
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--primary btn--xl" onClick={onCreate} disabled={connecting}>
            <span className="btn__icon">＋</span>
            <span><b>Créer la salle</b><small>Vous serez le maître de table</small></span>
          </button>
        </section>

        <section className="lobby__block">
          <h3>Rejoindre avec un code</h3>
          <div className="join-row">
            <input
              className="input input--code"
              value={code}
              placeholder="CODE"
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <button type="button" className="btn btn--gold" onClick={() => onJoin(code)} disabled={code.length < 4 || connecting}>
              Rejoindre
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="screen screen--lobby">
      <header className="screen__head">
        <button type="button" className="btn btn--back" onClick={onLeave}>← Quitter</button>
        <h2>Salle {room.code}</h2>
        <p>Partagez ce code : les sièges libres seront tenus par des bots ({LEVEL_LABEL[room.level]}).</p>
      </header>

      <div className="room-code">
        <span>Code de la salle</span>
        <b>{room.code}</b>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => { void navigator.clipboard?.writeText(room.code); }}
        >
          Copier
        </button>
      </div>

      <section className="room-seats">
        {seats.map((p, i) => (
          <div key={i} className={`room-seat ${p ? 'is-taken' : ''}`}>
            <span className="room-seat__pos">{['Sud', 'Ouest', 'Nord', 'Est'][i]}</span>
            {p ? (
              <>
                <b>{p.name}{p.id === you ? ' (vous)' : ''}</b>
                <small className={p.ready ? 'is-ready' : ''}>{p.ready ? 'Prêt' : 'En attente'}</small>
              </>
            ) : (
              <>
                <b>Bot {LEVEL_LABEL[room.level]}</b>
                <small>à la prise du jeu</small>
              </>
            )}
          </div>
        ))}
      </section>

      <section className="lobby__block">
        <h3>Discussion</h3>
        <div className="chat">
          {chat.slice(-30).map((c, i) => (
            <div className="chat__line" key={`${c.at}-${i}`}><b>{c.from}</b> {c.text}</div>
          ))}
          {chat.length === 0 && <p className="chat__empty">Dites bonjour à vos adversaires…</p>}
        </div>
        <form
          className="chat__form"
          onSubmit={(e) => { e.preventDefault(); if (msg.trim()) { onChat(msg.trim()); setMsg(''); } }}
        >
          <input className="input" value={msg} placeholder="Message…" maxLength={160} onChange={(e) => setMsg(e.target.value)} />
          <button type="submit" className="btn btn--ghost btn--sm">Envoyer</button>
        </form>
      </section>

      <div className="lobby__actions">
        <button type="button" className={`btn ${me?.ready ? 'btn--ghost' : 'btn--primary'}`} onClick={() => onReady(!me?.ready)}>
          {me?.ready ? 'Annuler « Prêt »' : 'Je suis prêt'}
        </button>
        {isHost && (
          <button type="button" className="btn btn--gold" onClick={onStart}>
            Lancer la partie
          </button>
        )}
      </div>
      {!isHost && <p className="lobby__note">En attente du maître de table pour lancer la partie…</p>}
    </div>
  );
}
