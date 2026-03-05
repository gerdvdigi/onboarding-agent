"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getApiBaseUrl, defaultFetchOptions } from "@/lib/config/api";

const STAGES_BEYOND_DISCOVERY = ["plan_approved", "pdf_downloaded"];

/**
 * Envuelve step-1. Si el usuario tiene sesión y ya pasó el step 1:
 * - plan_approved/pdf_downloaded → redirige a step-3
 * - magic_link_used/discovery_started → redirige al dashboard
 * Si no tiene sesión, muestra el formulario.
 */
export function Step1Guard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "show" | "redirecting">(
    "loading"
  );
  const router = useRouter();

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/onboarding/session/me`, {
        ...defaultFetchOptions,
      });
      if (res.ok) {
        const data = await res.json();
        const stage = data.onboardingStage;
        if (stage && STAGES_BEYOND_DISCOVERY.includes(stage)) {
          return "step3";
        }
        return "step2";
      }
      return "show";
    } catch {
      return "show";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    check().then((result) => {
      if (cancelled) return;
      if (result === "step3") {
        setState("redirecting");
        router.replace("/onboarding/step-3");
      } else if (result === "step2") {
        setState("redirecting");
        router.replace("/onboarding/dashboard");
      } else {
        setState("show");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [check, router]);

  if (state === "loading" || state === "redirecting") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2
          className="h-10 w-10 animate-spin text-muted-foreground"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
