/**
 * Utilidades para pasar la sesión al backend en requests server-side.
 * En cross-domain, la cookie del backend no llega; usamos onboarding_session_id
 * (cookie del frontend) como header.
 */

export function parseSessionIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|; )onboarding_session_id=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function buildSessionHeaders(cookieHeader: string | null): Record<string, string> {
  const sessionId = parseSessionIdFromCookie(cookieHeader);
  if (sessionId) {
    return { 'X-Onboarding-Session-Id': sessionId };
  }
  return {};
}
