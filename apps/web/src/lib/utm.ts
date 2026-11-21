export interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

export function captureUtm(): Utm {
  const existing = sessionStorage.getItem('jx_utm');
  if (existing) {
    try {
      return JSON.parse(existing) as Utm;
    } catch {
      sessionStorage.removeItem('jx_utm');
    }
  }
  const params = new URLSearchParams(location.search);
  const utm: Utm = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term'] as const) {
    const value = params.get(`utm_${key}`);
    if (value) utm[key] = value.slice(0, 100);
  }
  if (Object.keys(utm).length) sessionStorage.setItem('jx_utm', JSON.stringify(utm));
  return utm;
}
