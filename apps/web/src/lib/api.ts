export interface LeadResponse {
  lead_id: string;
  working_hours: boolean;
  sla_min: number;
  estimate: {
    kind: 'fixed' | 'range' | 'from' | 'individual';
    totalMin: number | null;
    totalMax: number | null;
    prepaymentMin: number | null;
    prepaymentMax: number | null;
    urgencyPct: number;
    discountPct: number;
  };
}

export async function postLead(apiBase: string, payload: unknown): Promise<{ status: number; body: LeadResponse | { errors?: { path: string; code: string }[] } }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiBase}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as LeadResponse;
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function getPortfolio(apiBase: string, lang: string): Promise<{ items: PortfolioItem[] } | null> {
  try {
    const response = await fetch(`${apiBase}/api/portfolio?lang=${lang}`);
    if (!response.ok) return null;
    return (await response.json()) as { items: PortfolioItem[] };
  } catch {
    return null;
  }
}

export interface PortfolioItem {
  id: string;
  category: string;
  title: string;
  before: string;
  after: string;
  media: 'image' | 'video';
  rotate: number;
}
