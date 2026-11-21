import type { QuizState } from './machine.js';

const KEY = 'jx_quiz_state';

export function loadState(): QuizState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuizState;
    if (parsed.version !== 1 || !parsed.clientRequestId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: QuizState | null): void {
  if (!state) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(state));
}

export function flag(name: string, value?: string): string | null {
  if (value === undefined) return localStorage.getItem(name);
  localStorage.setItem(name, value);
  return value;
}
