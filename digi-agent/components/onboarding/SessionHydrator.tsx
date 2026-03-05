'use client';

import { useEffect } from 'react';
import { useOnboardingStore } from '@/lib/store/onboarding-store';
import type { UserInfo } from '@/lib/langchain/agent';

interface SessionHydratorProps {
  userInfo: UserInfo;
  children: React.ReactNode;
}

/**
 * Hydrates the onboarding store with userInfo from server-validated session.
 * Use when session was validated server-side and we need client components to have userInfo.
 */
export function SessionHydrator({ userInfo, children }: SessionHydratorProps) {
  const setUserInfo = useOnboardingStore((s) => s.setUserInfo);

  useEffect(() => {
    setUserInfo(userInfo);
  }, [userInfo, setUserInfo]);

  return <>{children}</>;
}
