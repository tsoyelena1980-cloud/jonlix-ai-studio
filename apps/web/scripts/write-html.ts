import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from '../src/render/page.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteUrl = process.env.VITE_SITE_URL || 'https://jonlix.uz';
const shared = {
  siteUrl,
  apiUrl: process.env.VITE_API_URL || '',
  telegram: process.env.VITE_TG_USERNAME || 'jonlix_studio',
  instagram: process.env.VITE_INSTAGRAM || 'jonlix',
  phone: process.env.VITE_PHONE || '',
  gaId: process.env.VITE_GA_ID || '',
  ymId: process.env.VITE_YM_ID || '',
  pixelId: process.env.VITE_META_PIXEL_ID || '',
};

const pages = [
  ['index.html', 'ru', 'home'],
  ['quiz/index.html', 'ru', 'home'],
  ['privacy/index.html', 'ru', 'privacy'],
] as const;

for (const [file, lang, kind] of pages) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, renderPage({ ...shared, lang, kind, quizEntry: file.startsWith('quiz/') }), 'utf8');
}

console.log('HTML pages written');
