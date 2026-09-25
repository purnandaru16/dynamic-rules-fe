import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  isLoggedIn: boolean;
  isInitialized: boolean;
  setToken: (token: string) => void;
  logout: () => void;
  initAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  isLoggedIn: false,
  isInitialized: false,
  initAuth: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) {
        set({ accessToken: token, isLoggedIn: true, isInitialized: true });
        return;
      }
    }
    set({ accessToken: null, isLoggedIn: false, isInitialized: true });
  },
  setToken: (token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', token);
    }
    set({ accessToken: token, isLoggedIn: true, isInitialized: true });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
    }
    set({ accessToken: null, isLoggedIn: false, isInitialized: true });
  },
}));
