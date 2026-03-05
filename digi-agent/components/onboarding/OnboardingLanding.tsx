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
      // Decodificar el token si está codificado en la URL
      const decodedToken = decodeURIComponent(token);
      console.log('[OnboardingLanding] Validating token from URL');
      
      done.current = true;
      fetch(`${getApiBaseUrl()}/onboarding/session/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...defaultFetchOptions,
        body: JSON.stringify({ token: decodedToken }),
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            console.log('[OnboardingLanding] Session validated:', {
              email: data.email,
              stage: data.onboardingStage,
            });
            
            // Verificar si la cookie se estableció (solo en cliente)
            if (typeof document !== 'undefined') {
              const hasCookie = document.cookie.includes('onboarding_session');
              if (!hasCookie) {
                console.warn('[OnboardingLanding] Cookie not detected after validation');
              }
            }
            
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
            const errorText = await res.text();
            let errorMessage = errorText;
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage = errorJson.message || errorText;
            } catch {
              // Usar errorText tal cual
            }
            console.error('[OnboardingLanding] Validation failed:', {
              status: res.status,
              error: errorMessage,
            });
            router.replace("/onboarding/step-1");
          }
        })
        .catch((error) => {
          console.error('[OnboardingLanding] Network error:', error);
          router.replace("/onboarding/step-1");
        });
    } else {
      done.current = true;
      router.replace("/onboarding/step-1");
    }
  }, [searchParams, router, setUserInfo]);

  return <div className="min-h-screen bg-background" aria-busy="true" />;
}
