/**
 * Server-side fetch for onboarding conversations.
 * Forwards cookies from the incoming request to the backend.
 * En cross-domain usa X-Onboarding-Session-Id desde la cookie del frontend.
 */

import { buildSessionHeaders } from './session-headers';

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

export async function fetchConversationsServer(
  cookieHeader: string | null
): Promise<Conversation[] | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
  const url = baseUrl.replace(/\/$/, '') + '/onboarding/conversations';

  const sessionHeaders = buildSessionHeaders(cookieHeader);
  const headers: HeadersInit = {
    'Cache-Control': 'no-store',
    ...sessionHeaders,
  };
  if (!sessionHeaders['X-Onboarding-Session-Id'] && cookieHeader) {
    (headers as Record<string, string>)['cookie'] = cookieHeader;
  }

  const res = await fetch(url, {
    headers,
    cache: 'no-store',
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.conversations ?? [];
}
