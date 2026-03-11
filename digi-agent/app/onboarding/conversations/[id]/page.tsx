import { redirect } from 'next/navigation';
import { validateOnboardingSession } from '@/lib/auth/validate-onboarding-session';
import { SessionHydrator } from '@/components/onboarding/SessionHydrator';
import { ConversationChat } from '@/components/onboarding/ConversationChat';
import { fetchConversationMetadataServer } from '@/lib/api/fetch-conversations';

const STAGES_BEYOND_DISCOVERY = ['plan_approved', 'pdf_downloaded'];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { id } = await params;
  const [session, metadata] = await Promise.all([
    validateOnboardingSession(),
    fetchConversationMetadataServer(id),
  ]);

  if (!metadata) {
    redirect('/onboarding/dashboard');
  }

  if (STAGES_BEYOND_DISCOVERY.includes(metadata.stage)) {
    redirect('/onboarding/step-3');
  }

  return (
    <SessionHydrator userInfo={session.userInfo}>
      <ConversationChat conversationId={id} />
    </SessionHydrator>
  );
}
