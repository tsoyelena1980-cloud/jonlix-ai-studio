type Params = Record<string, unknown>;

interface Boot {
  ga?: string;
  ym?: string;
  pixel?: string;
}

export function installAnalytics(boot: Boot): void {
  if (boot.ga) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(boot.ga)}`;
    document.head.append(script);
    const w = window as Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag(...args: unknown[]) {
      w.dataLayer?.push(args);
    };
    w.gtag('js', new Date());
    w.gtag('config', boot.ga);
  }
  if (boot.ym) {
    const w = window as Window & { ym?: (...args: unknown[]) => void };
    w.ym = w.ym || function ym(...args: unknown[]) {
      ((w.ym as unknown as { a?: unknown[] }).a = (w.ym as unknown as { a?: unknown[] }).a || []).push(args);
    };
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.append(script);
    w.ym(Number(boot.ym), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
  }
  if (boot.pixel) {
    const w = window as Window & { fbq?: (...args: unknown[]) => void };
    if (!w.fbq) {
      const fbq = function fbq(...args: unknown[]) {
        (fbq as unknown as { queue: unknown[] }).queue.push(args);
      } as ((...args: unknown[]) => void) & { queue: unknown[] };
      fbq.queue = [];
      w.fbq = fbq;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.append(script);
    w.fbq?.('init', boot.pixel);
  }
}

export function track(name: string, params: Params = {}): void {
  const w = window as Window & {
    gtag?: (...args: unknown[]) => void;
    ym?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    __JONLIX?: { ym?: string };
  };
  w.gtag?.('event', name, params);
  if (w.__JONLIX?.ym && w.ym) w.ym(Number(w.__JONLIX.ym), 'reachGoal', name, params);
  if (name === 'lead_success') w.fbq?.('track', 'Lead', { value: params.value, currency: 'UZS' });
  else w.fbq?.('trackCustom', name, params);
}
