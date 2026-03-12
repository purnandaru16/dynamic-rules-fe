import { create } from 'zustand';

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