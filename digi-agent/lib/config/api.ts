/**
 * Returns the API base URL for backend requests.
 * Falls back to http://localhost:3001 when NEXT_PUBLIC_API_URL is not set.
 * Trims trailing slashes to avoid double slashes in paths.
 */
export function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
  return url.replace(/\/$/, '');
}

/**
 * Opciones de fetch con Bearer token de Clerk.
 * El backend usa el token para identificar al usuario y obtener la sesión de onboarding.
 *
 * @param getToken - Función de Clerk useAuth().getToken
 */
export async function getAuthFetchOptions(
  getToken: () => Promise<string | null>,
): Promise<RequestInit> {
  const token = await getToken();
  return {
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}
