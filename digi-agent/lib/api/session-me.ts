/**
 * Server-side fetch for onboarding session.
 * Forwards cookies from the incoming request to the backend.
 */

import type { UserInfo } from '@/lib/langchain/agent';

export interface SessionMeResponse {
  ok: boolean;
  userInfo?: UserInfo;
  onboardingStage?: string;
}

export async function fetchSessionMe(
  cookieHeader: string | null
): Promise<SessionMeResponse> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
  const url = baseUrl.replace(/\/$/, '') + '/onboarding/session/me';

  try {
    const headers: HeadersInit = {
      'Cache-Control': 'no-store',
    };
    
    if (cookieHeader) {
      headers['cookie'] = cookieHeader;
    }
    
    const res = await fetch(url, {
      headers,
      cache: 'no-store',
      // En server-side fetch, las cookies deben pasarse explícitamente en headers
      // No usar credentials: 'include' porque no funciona en server-side
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[fetchSessionMe] Backend returned error:', {
        status: res.status,
        statusText: res.statusText,
        error: errorText.substring(0, 200),
        hasCookieHeader: !!cookieHeader,
        cookiePreview: cookieHeader?.substring(0, 50) || 'none',
      });
      return { ok: false };
    }

    const data = await res.json();
    return {
      ok: true,
      userInfo: data.userInfo,
      onboardingStage: data.onboardingStage,
    };
  } catch {
    return { ok: false };
  }
}
