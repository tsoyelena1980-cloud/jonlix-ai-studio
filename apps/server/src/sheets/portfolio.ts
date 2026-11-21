import type { sheets_v4 } from 'googleapis';
import type { Lang } from '@jonlix/shared';
import { quoteTab } from './client.js';

export interface PortfolioItem {
  id: string;
  category: 'photo' | 'animation' | 'video' | 'business';
  title: string;
  before: string;
  after: string;
  media: 'image' | 'video';
  rotate: number;
}

const CATEGORIES = new Set(['photo', 'animation', 'video', 'business']);
const ROTATIONS = [-1.5, -0.8, 0.6, 1.2];

export function directDriveUrl(url: string): string {
  const file = /drive\.google\.com\/file\/d\/([^/]+)/.exec(url);
  const open = /[?&]id=([^&]+)/.exec(url);
  const id = file?.[1] ?? (url.includes('drive.google.com') ? open?.[1] : undefined);
  if (!id) return url;
  return `https://drive.google.com/uc?export=view&id=${id}`;
}

export function mediaKind(url: string): 'image' | 'video' {
  const clean = url.split('?')[0]?.toLowerCase() ?? '';
  return clean.endsWith('.mp4') || clean.endsWith('.webm') ? 'video' : 'image';
}

export function mapPortfolioRows(rows: string[][], lang: Lang): { items: PortfolioItem[]; skipped: number } {
  const items: (PortfolioItem & { order: number })[] = [];
  let skipped = 0;
  rows.forEach((row, index) => {
    if (!row.some((cell) => (cell ?? '').trim())) return;
    const category = (row[0] ?? '').trim().toLowerCase();
    const after = (row[5] ?? '').trim();
    const show = (row[7] ?? '').trim().toLowerCase();
    if (!CATEGORIES.has(category) || !after) {
      skipped += 1;
      return;
    }
    if (!['да', 'yes', 'ha', '1', 'true'].includes(show)) return;
    const ru = (row[1] ?? '').trim();
    const uz = (row[2] ?? '').trim();
    const en = (row[3] ?? '').trim();
    const title = lang === 'uz' ? uz || ru : lang === 'en' ? en || ru : ru;
    const afterUrl = directDriveUrl(after);
    items.push({
      id: `row-${index + 2}`,
      category: category as PortfolioItem['category'],
      title: title || ru || 'Jonlix',
      before: directDriveUrl((row[4] ?? '').trim()),
      after: afterUrl,
      media: mediaKind(after),
      rotate: ROTATIONS[index % ROTATIONS.length] ?? 0,
      order: Number(row[6] ?? index) || index,
    });
  });
  items.sort((a, b) => a.order - b.order);
  return { items: items.map(({ order: _order, ...item }) => item), skipped };
}

export async function readPortfolio(sheets: sheets_v4.Sheets, sheetId: string, tab: string): Promise<string[][]> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${quoteTab(tab)}!A2:H`,
  });
  return (response.data.values ?? []) as string[][];
}
