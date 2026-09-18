/* ============================================================================
 * Adresse du serveur de jeu.
 *
 * L'application fonctionne en solo sans aucun serveur (tout est dans la page).
 * Le mode en ligne, lui, a besoin d'un serveur WebSocket. Priorité :
 *   1. `?server=…` dans l'URL (mémorisé pour les visites suivantes)
 *   2. l'adresse enregistrée dans le navigateur
 *   3. la même origine que la page (cas normal : Vite ou Node sert l'app)
 * ==========================================================================*/

const SERVER_KEY = 'belote-tunisie:server';

/** Hébergeurs statiques connus : ils ne peuvent pas parler WebSocket par défaut. */
const STATIC_HOSTS = [
  '.github.io', '.netlify.app', '.vercel.app', '.pages.dev', '.surge.sh',
  '.firebaseapp.com', '.web.app', '.gitlab.io', '.render.com', '.onrender.com',
];

/** Complète et normalise une adresse saisie par un joueur. */
export function normalizeServerUrl(raw: string): string {
  let v = raw.trim();
  if (!v) return '';
  if (/^https:\/\//i.test(v)) v = `wss://${v.slice(8)}`;
  else if (/^http:\/\//i.test(v)) v = `ws://${v.slice(7)}`;
  else if (!/^wss?:\/\//i.test(v)) {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:';
    v = `${secure ? 'wss' : 'ws'}://${v}`;
  }
  v = v.replace(/\/+$/, '');
  if (!/\/ws$/i.test(v)) v += '/ws';
  return v;
}

export function storedServerUrl(): string {
  try { return localStorage.getItem(SERVER_KEY) ?? ''; } catch { return ''; }
}

export function setStoredServerUrl(url: string): void {
  try {
    if (url) localStorage.setItem(SERVER_KEY, url);
    else localStorage.removeItem(SERVER_KEY);
  } catch { /* navigation privée */ }
}

/** Adresse effective du serveur (toujours un `ws://` ou `wss://` complet). */
export function resolveServerUrl(): string {
  if (typeof location !== 'undefined') {
    const fromQuery = new URLSearchParams(location.search).get('server');
    if (fromQuery) {
      const url = normalizeServerUrl(fromQuery);
      setStoredServerUrl(url);
      return url;
    }
  }
  const stored = storedServerUrl();
  if (stored) return normalizeServerUrl(stored);
  return sameOriginUrl();
}

export function sameOriginUrl(): string {
  if (typeof location === 'undefined') return '';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** Vrai si la page est servie par un hébergeur statique (donc sans serveur de jeu). */
export function isStaticDeployment(): boolean {
  if (typeof location === 'undefined') return false;
  const host = location.hostname.toLowerCase();
  return STATIC_HOSTS.some((s) => host.endsWith(s));
}

/** Libellé court d'une adresse, pour l'afficher sur mobile. */
export function shortServerLabel(url: string): string {
  return url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '');
}
