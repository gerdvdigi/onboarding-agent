import { validateOnboardingSession } from '@/lib/auth/validate-onboarding-session';
import { fetchConversationsServer } from '@/lib/api/fetch-conversations';
import { SessionHydrator } from '@/components/onboarding/SessionHydrator';
import { ConversationsDashboard } from '@/components/onboarding/ConversationsDashboard';

export default async function DashboardPage() {
  const [session, initialConversations] = await Promise.all([
    validateOnboardingSession(),
    fetchConversationsServer(),
  ]);

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
