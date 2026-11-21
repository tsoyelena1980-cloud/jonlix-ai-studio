export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function sheetText(value: string): string {
  if (!value) return '';
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function sheetPhone(phone: string): string {
  return `'${phone}`;
}

export function maskPhone(phone: string): string {
  if (phone.length < 8) return '***';
  return `${phone.slice(0, 6)}***${phone.slice(-4)}`;
}

export function displayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 12) return phone;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
}

export function normalizeTelegram(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}
