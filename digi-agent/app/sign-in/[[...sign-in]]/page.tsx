import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-section-bg flex items-center justify-center p-4">
      <SignIn
        forceRedirectUrl="/onboarding/sync"
        signUpUrl="/sign-up"
      />
    </div>
  );
}
