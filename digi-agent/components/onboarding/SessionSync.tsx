'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { usePathname, useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/config/api';
import { useOnboardingStore } from '@/lib/store/onboarding-store';

/**
 * Sincroniza la sesión de onboarding con el backend cuando el usuario está autenticado con Clerk.
 * Llama a from-clerk una vez para crear/obtener la sesión. Con Clerk ya no usamos cookies ni localStorage.
 * No corre en /onboarding/sync porque esa página ya maneja la sincronización (evita doble llamada).
 */
export function SessionSync() {
  const { getToken, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const setUserInfo = useOnboardingStore((s) => s.setUserInfo);
  const synced = useRef(false);

  useEffect(() => {
    if (!isSignedIn || synced.current || pathname === '/onboarding/sync') return;

    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch(`${getApiBaseUrl()}/onboarding/session/from-clerk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (!res.ok || cancelled) return;

        const data = await res.json();
        if (cancelled) return;

        if (data.userInfo) {
          setUserInfo({
            ...data.userInfo,
            terms: true,
          });
        }

        synced.current = true;
        router.refresh();
      } catch {
        // Silently fail - user can retry on next navigation
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken, setUserInfo, router, pathname]);

  return null;
}
