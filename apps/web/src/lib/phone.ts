export function formatPhoneInput(raw: string): { display: string; e164: string } {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('998')) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  let display = '+998';
  if (digits.length > 0) display += ` (${digits.slice(0, 2)}`;
  if (digits.length >= 2) display += ')';
  if (digits.length > 2) display += ` ${digits.slice(2, 5)}`;
  if (digits.length > 5) display += `-${digits.slice(5, 7)}`;
  if (digits.length > 7) display += `-${digits.slice(7, 9)}`;
  return { display, e164: `+998${digits}` };
}

export function isCompletePhone(e164: string): boolean {
  return /^\+998\d{9}$/.test(e164);
}
