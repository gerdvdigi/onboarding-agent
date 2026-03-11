/**
 * Server-side fetch for onboarding conversations.
 * Usa el token de Clerk para autenticación.
 */

import { auth } from '@clerk/nextjs/server';

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  stage?: 'discovery' | 'plan_approved' | 'pdf_downloaded';
}

export interface ConversationMetadata {
  id: string;
  title: string;
  createdAt: string;
  stage: 'discovery' | 'plan_approved' | 'pdf_downloaded';
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { getToken } = await auth();
  const token = await getToken();
  return {
    'Cache-Control': 'no-store',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchConversationMetadataServer(
  conversationId: string,
): Promise<ConversationMetadata | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
  const url =
    baseUrl.replace(/\/$/, '') + `/onboarding/conversations/${conversationId}`;

  const headers = await getAuthHeaders();
  if (!('Authorization' in headers)) {
    return null;
  }

  const res = await fetch(url, {
    headers,
    cache: 'no-store',
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

export async function fetchConversationsServer(): Promise<Conversation[] | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
  const url = baseUrl.replace(/\/$/, '') + '/onboarding/conversations';

  const headers = await getAuthHeaders();
  if (!('Authorization' in headers)) {
    return null;
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
