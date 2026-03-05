/**
 * Server-side fetch for onboarding session.
 * Forwards cookies from the incoming request to the backend.
 * En cross-domain: extrae onboarding_session_id (cookie del frontend) y la envía como header.
 */

import type { UserInfo } from '@/lib/langchain/agent';

export interface SessionMeResponse {
  ok: boolean;
  userInfo?: UserInfo;
  onboardingStage?: string;
}

import { parseSessionIdFromCookie, buildSessionHeaders } from './session-headers';

export async function fetchSessionMe(
  cookieHeader: string | null
): Promise<SessionMeResponse> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
  const url = baseUrl.replace(/\/$/, '') + '/onboarding/session/me';

  try {
    const headers: HeadersInit = {
      'Cache-Control': 'no-store',
      ...buildSessionHeaders(cookieHeader),
    };
    if (!parseSessionIdFromCookie(cookieHeader) && cookieHeader) {
      headers['cookie'] = cookieHeader;
    }

    const res = await fetch(url, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
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
