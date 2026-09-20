import { create } from 'zustand';

// Decode JWT payload tanpa verifikasi — cukup utk baca identitas (sub / client_id)
export const decodeJwtPayload = (token: string | null): Record<string, unknown> | null => {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
};

// Identitas untuk ditampilkan di UI (mis. sidebar)
export const getClientIdentity = (token: string | null): { name: string; initial: string } => {
  const payload = decodeJwtPayload(token);
  const raw = (payload?.client_id ?? payload?.sub ?? payload?.appName ?? '') as string;
  const name = raw ? String(raw) : 'Client App';
  return { name, initial: name.charAt(0).toUpperCase() };
};

interface AuthState {
  accessToken: string | null;
  isLoggedIn: boolean;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,  // ← selalu null saat SSR
  isLoggedIn: false,  // ← selalu false saat SSR
  setToken: (token) => {
    localStorage.setItem('access_token', token);
    set({ accessToken: token, isLoggedIn: true });
  },
  logout: () => {
    localStorage.removeItem('access_token');
    set({ accessToken: null, isLoggedIn: false });
  },
}));