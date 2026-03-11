/**
 * Server-side fetch for onboarding session.
 * Usa el token de Clerk para autenticación.
 */

import { auth } from '@clerk/nextjs/server';
import type { UserInfo } from '@/lib/langchain/agent';

export interface SessionMeResponse {
  ok: boolean;
  userInfo?: UserInfo;
  onboardingStage?: string;
}

export async function fetchSessionMe(): Promise<SessionMeResponse> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
  const url = baseUrl.replace(/\/$/, '') + '/onboarding/session/me';

  try {
    const { getToken } = await auth();
    const token = await getToken();
    if (!token) {
      return { ok: false };
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-store',
      },
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
