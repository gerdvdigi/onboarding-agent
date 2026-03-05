/**
 * Obtiene el header de sesión para usar en requests al backend.
 * Intenta usar la cookie primero, y si no está disponible, usa localStorage como fallback.
 * 
 * Esto es necesario cuando las cookies no funcionan en cross-domain (SameSite: 'none' bloqueado).
 */

export function getSessionHeader(): string | null {
  if (typeof window === 'undefined') {
    // Server-side: no hay acceso a cookies ni localStorage
    return null;
  }

  // Primero intentar obtener el sessionId de localStorage (fallback para cross-domain)
  const sessionId = localStorage.getItem('onboarding_session_id');
  if (sessionId) {
    return sessionId;
  }

  // Si no hay sessionId en localStorage, las cookies deberían funcionar
  // El navegador enviará las cookies automáticamente con credentials: 'include'
  return null;
}

/**
 * Obtiene el header completo para incluir en requests fetch.
 * Retorna un objeto con headers a agregar al request.
 */
export function getSessionHeaders(): Record<string, string> {
  const sessionId = getSessionHeader();
  if (sessionId) {
    return {
      'X-Onboarding-Session-Id': sessionId,
    };
  }
  return {};
}
