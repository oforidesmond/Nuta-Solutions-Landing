import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  accessTokenAtom,
  clearAuth,
  getRefreshToken,
  setTokens,
} from '@/lib/auth-store';

const baseURL =
  (import.meta.env.PUBLIC_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:3000';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = accessTokenAtom.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetryConfig = InternalAxiosRequestConfig & { _tpRetry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    if (!original) return Promise.reject(error);

    const reqUrl = String(original.url ?? '');
    const isRefresh = reqUrl.includes('/auth/refresh');

    if (error.response?.status !== 401 || original._tpRetry || isRefresh) {
      return Promise.reject(error);
    }

    original._tpRetry = true;
    const rt = getRefreshToken();
    if (!rt) {
      clearAuth();
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post<{
        accessToken?: string;
        refreshToken?: string;
      }>(
        `${baseURL}/auth/refresh`,
        { refreshToken: rt },
        {
          headers: { 'Content-Type': 'application/json' },
          withCredentials: true,
        }
      );

      if (data?.accessToken) {
        setTokens(data.accessToken, data.refreshToken ?? null);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      }

      clearAuth();
      return Promise.reject(error);
    } catch {
      clearAuth();
      return Promise.reject(error);
    }
  }
);

export { baseURL as apiBaseURL };
