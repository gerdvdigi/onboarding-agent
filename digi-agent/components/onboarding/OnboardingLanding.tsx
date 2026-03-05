"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { getApiBaseUrl, defaultFetchOptions } from "@/lib/config/api";
import { useOnboardingStore } from "@/lib/store/onboarding-store";

/**
 * Solo para la ruta /onboarding: si hay token en URL, valida y redirige al dashboard.
 * Si no hay token, redirige a step-1.
 * Si la respuesta incluye userInfo, lo guarda en el store (para magic link en otro dispositivo).
 */
export function OnboardingLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUserInfo = useOnboardingStore((s) => s.setUserInfo);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const token = searchParams.get("token");
    if (token) {
      done.current = true;
      fetch(`${getApiBaseUrl()}/onboarding/session/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...defaultFetchOptions,
        body: JSON.stringify({ token }),
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.userInfo) {
              setUserInfo({
                ...data.userInfo,
                terms: true,
              });
            }
            const stage = data.onboardingStage;
            const alreadyApproved =
              stage && ["plan_approved", "pdf_downloaded"].includes(stage);
            router.replace(
              alreadyApproved ? "/onboarding/step-3" : "/onboarding/dashboard"
            );
          } else {
            router.replace("/onboarding/step-1");
          }
        })
        .catch(() => router.replace("/onboarding/step-1"));
    } else {
      done.current = true;
      router.replace("/onboarding/step-1");
    }
  }, [searchParams, router, setUserInfo]);

  return <div className="min-h-screen bg-background" aria-busy="true" />;
}
