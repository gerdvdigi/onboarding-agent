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
        ...defaultFetchOptions,
        headers: {
          "Content-Type": "application/json",
          ...(defaultFetchOptions.headers as Record<string, string>),
        },
        body: JSON.stringify({ token: decodedToken }),
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            console.log('[OnboardingLanding] Session validated:', {
              email: data.email,
              stage: data.onboardingStage,
            });
            
            // Cross-domain: la cookie del backend no llega al frontend.
            // Establecer cookie en el dominio del FRONTEND para que Next.js la reciba
            // en requests server-side y pueda pasarla al backend.
            if (typeof document !== 'undefined' && data.sessionId) {
              const maxAge = 60 * 60 * 24 * 3; // 3 días
              document.cookie = `onboarding_session_id=${data.sessionId}; path=/; max-age=${maxAge}; SameSite=Lax`;
              localStorage.setItem('onboarding_session_id', data.sessionId);
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
