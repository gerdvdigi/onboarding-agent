import { SessionSync } from '@/components/onboarding/SessionSync';

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SessionSync />
      {children}
    </>
  );
}
