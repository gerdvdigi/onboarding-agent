"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Redirects to the conversations dashboard. Step-2 chat is now at /onboarding/conversations/[id].
 */
export function Step2Redirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/onboarding/dashboard");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
    </div>
  );
}
