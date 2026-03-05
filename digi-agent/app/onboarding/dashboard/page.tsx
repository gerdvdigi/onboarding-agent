import { headers } from 'next/headers';
import { validateOnboardingSession } from '@/lib/auth/validate-onboarding-session';
import { fetchConversationsServer } from '@/lib/api/fetch-conversations';
import { SessionHydrator } from '@/components/onboarding/SessionHydrator';
import { ConversationsDashboard } from '@/components/onboarding/ConversationsDashboard';

export default async function DashboardPage() {
  const session = await validateOnboardingSession({
    redirectToStep3IfPlanApproved: true,
  });

  const headersList = await headers();
  const cookie = headersList.get('cookie');
  const initialConversations = await fetchConversationsServer(cookie);

  return (
    <SessionHydrator userInfo={session.userInfo}>
      <div className="min-h-screen bg-background">
        <ConversationsDashboard
          initialConversations={initialConversations ?? undefined}
        />
      </div>
    </SessionHydrator>
  );
}
