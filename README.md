# BELOTE TUNISIE — Belote Classique, règles tunisiennes

Jeu de belote complet et jouable dans le navigateur : 4 joueurs (1 humain + 3 bots), 2 équipes,
8 plis par manche, contrat, Belote-Rebelote, dedans, plusieurs manches jusqu'au score cible —
plus un **mode multijoueur en ligne réel** (rooms, chat, reprise de session).

Mobile d'abord (portrait, jouable à une main), soigné sur desktop : feutrine vert profond,
bois sombre, cartes ivoire, dorures, motifs géométriques tunisiens discrets.

## Lancer

```bash
npm install
npm run dev        # http://localhost:3000  (serveur + Vite en middleware, HMR)

npm run build      # bundle de production dans dist/
npm start          # sert dist/ + fallback SPA, même serveur WS, NODE_ENV=production
```

Autres commandes :

```bash
npm run typecheck  # tsc --noEmit
npm test           # 20 tests moteur (règles, belote, dedans, redonne, illégalité)
npx tsx tests/ui-smoke.tsx        # test UI jsdom : lobby → manche → décompte → victoire
npx tsx scripts/ws-smoke.ts       # smoke test multijoueur (rooms + vues par siège)
npx tsx scripts/abtest.ts         # force des bots facile / normal / expert
```

Paramètres d'URL pratiques : `?level=expert&target=701&fast=1&sound=0&name=Sami`.

## Règles implémentées

- **32 cartes** (7, 8, 9, 10, V, D, R, A). Distribution : 5 cartes à chacun, carte retournée
  proposée, puis acceptation ou passe à tour de rôle ; si tout le monde passe, second tour sur une
  autre couleur ; si tout le monde repasse, on redonne. Le preneur reçoit la carte retournée :
  **8 cartes par joueur, toujours**.
- **Ordres et valeurs** — atout : V 20, 9 14, A 11, 10 10, R 4, D 3, 8 et 7 = 0.
  Hors atout : A 11, 10 10, R 4, D 3, V 2, 9, 8, 7 = 0. Jamais l'un à la place de l'autre.
- **Jeu** : fournir la couleur demandée, sinon n'importe quelle carte, **surcoupe obligatoire**
  quand le pli est déjà coupé et que l'équipe ne le maîtrise pas. Toute carte illégale est
  impossible à sélectionner et la raison est expliquée.
- **Pli** : plus haut atout sinon plus haute carte de la couleur demandée ; le vainqueur ramasse
  (montre le gain, les points, le score, enchaîne).
- **Belote-Rebelote** : R + D d'atout → +20, annoncée BELOTE puis REBELOTE, une seule fois, jamais
  hors atout.
- **Décompte** par manche : points des cartes (152) + dernier pli (10) + belote (20) = 162 max ;
  contrat réussi → points de l'équipe preneuse ; contrat chuté → **dedans** : l'équipe adverse
  marque 162 + ses belotes, le preneur marque 0. Match jusqu'au score cible (501 / 1001 / 1501).

## Bots

Trois niveaux (`facile`, `normal`, `expert`) qui jouent de vraies cartes de belote : fournissent la
couleur, coupent, surcoupent, comptent les atouts, retiennent les grosses cartes déjà tombées,
repèrent les vides, ne gaspillent pas leurs forces quand le partenaire tient le pli, et prennent des
décisions de contrat argumentées. Les bots **ne voient jamais les cartes cachées** : leurs décisions
ne dépendent que de l'information publique (`Memory`) plus une recherche de fin de manche Monte-Carlo
sur les cartes inconnues. A/B mesuré sur 500 donnes : expert 89,2 pts/manche contre facile 77,5.

## Multijoueur en ligne

Le serveur est autoritaire : il tient l'état de la partie et n'envoie à chaque siège qu'une vue
filtrée (`buildView`) — les cartes des adversaires ne quittent jamais le serveur. Rooms à code de
4 caractères, hôte (niveau, cible, lancement), places libres remplies par des bots, déconnexion
reprise par un bot puis reprise de session (`resume` + reconnexion automatique), chat, compte à
rebours de 7 s avant la manche suivante.

## Structure

```
src/game/    moteur pur : types, règles, rng, engine, bots, views
src/net/     protocole client/serveur, room autoritaire
src/ui/      composants React, écrans, hooks (solo + en ligne), styles
server/      http + WebSocket (/ws), Vite en middleware, /api/health, /api/rooms
tests/, scripts/
```

Le même écran de jeu sert le solo et le online via l'interface `GameApi` ; tout le son est
synthétisé (WebAudio), aucun asset audio — le jeu est entièrement jouable sans son.
