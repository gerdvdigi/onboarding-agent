/**
 * Server-side fetch for onboarding conversations.
 * Forwards cookies from the incoming request to the backend.
 * Returns null on auth failure (401) so the client can fetch/redirect as needed.
 */

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

  const res = await fetch(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: 'no-store',
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.conversations ?? [];
}
