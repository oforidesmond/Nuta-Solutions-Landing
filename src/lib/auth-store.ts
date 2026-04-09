import { atom } from 'nanostores';

/** Shared with the dashboard app if same origin (localStorage). */
export const REFRESH_TOKEN_STORAGE_KEY = 'tradepulse_refresh_token';

export const accessTokenAtom = atom<string | null>(null);
export const userAtom = atom<Record<string, unknown> | null>(null);

export function setTokens(access: string, refresh?: string | null): void {
  accessTokenAtom.set(access);
  if (refresh) {
    try {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refresh);
    } catch {
      /* ignore quota / private mode */
    }
  }
}

export function setUser(user: Record<string, unknown> | null): void {
  userAtom.set(user);
}

export function clearAuth(): void {
  accessTokenAtom.set(null);
  userAtom.set(null);
  try {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}
