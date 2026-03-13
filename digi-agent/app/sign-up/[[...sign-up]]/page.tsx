import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-section-bg flex items-center justify-center p-4">
      <SignUp
        forceRedirectUrl="/onboarding/sync"
        signInUrl="/sign-in"
      />
    </div>
  );
}
