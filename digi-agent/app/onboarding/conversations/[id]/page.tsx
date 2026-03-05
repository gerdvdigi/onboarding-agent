import { validateOnboardingSession } from '@/lib/auth/validate-onboarding-session';
import { SessionHydrator } from '@/components/onboarding/SessionHydrator';
import { ConversationChat } from '@/components/onboarding/ConversationChat';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { id } = await params;
  const session = await validateOnboardingSession({
    redirectToStep3IfPlanApproved: true,
  });

  return (
    <SessionHydrator userInfo={session.userInfo}>
      <ConversationChat conversationId={id} />
    </SessionHydrator>
  );
}
