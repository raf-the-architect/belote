/* ============================================================================
 * Prépare le dossier `docs/` publié par GitHub Pages.
 *
 * Pages peut servir une branche + un dossier (`/docs`) sans exécuter d'action :
 * c'est la voie la plus simple quand on n'a qu'un téléphone.
 *
 *   npm run build:pages
 * ==========================================================================*/
import { cp, mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const docs = join(root, 'docs');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ est vide : lancez d\'abord `npx vite build --base=./`');
  process.exit(1);
}

await rm(docs, { recursive: true, force: true });
await mkdir(docs, { recursive: true });
await cp(dist, docs, { recursive: true });

// Pages sert 404.html pour les URL inconnues : on renvoie vers la table.
const notFound = join(root, 'static', '404.html');
if (existsSync(notFound)) await copyFile(notFound, join(docs, '404.html'));

// Empêche Jekyll d'ignorer les fichiers commençant par un souligné.
await writeFile(join(docs, '.nojekyll'), '');

console.log(`docs/ prêt — publiez la branche avec le dossier /docs (${docs})`);
