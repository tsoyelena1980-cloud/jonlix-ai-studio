export interface TelegramProfile {
  username: string;
  id: string;
}

export function isTelegramApp(): boolean {
  const app = window.Telegram?.WebApp;
  if (!app?.platform || app.platform === 'unknown') return false;
  return true;
}

export function telegramProfile(): TelegramProfile {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const raw = user?.username?.replace(/^@/, '') ?? '';
  return {
    username: raw ? `@${raw}` : '',
    id: user?.id ? String(user.id) : '',
  };
}

export function openManagerChat(username: string): void {
  const url = `https://t.me/${username.replace(/^@/, '')}`;
  const app = isTelegramApp() ? window.Telegram?.WebApp : undefined;
  if (app?.openTelegramLink) {
    app.openTelegramLink(url);
    return;
  }
  window.location.href = url;
}
