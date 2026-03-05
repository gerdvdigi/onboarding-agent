/**
 * Returns the API base URL for backend requests.
 * Falls back to http://localhost:3001 when NEXT_PUBLIC_API_URL is not set.
 * Trims trailing slashes to avoid double slashes in paths.
 */
export function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001";
  return url.replace(/\/$/, "");
}

import { getSessionHeaders } from './api/get-session-header';

/** Opciones por defecto para llamadas al backend: incluir cookies (sesión onboarding). */
export function getDefaultFetchOptions(): RequestInit {
  const sessionHeaders = getSessionHeaders();
  return {
    credentials: "include",
    headers: {
      ...sessionHeaders,
    },
  };
}

/** @deprecated Usa getDefaultFetchOptions() en su lugar para soporte de cross-domain */
export const defaultFetchOptions: RequestInit = {
  credentials: "include",
};
