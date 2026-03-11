'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/config/api';
import { useOnboardingStore } from '@/lib/store/onboarding-store';

/**
 * Página de sincronización: crea sesión de onboarding desde Clerk y redirige al dashboard.
 * Se usa tras el sign-up con invitación Clerk.
 * Con Clerk ya no usamos cookies ni localStorage; el token identifica al usuario.
 */
export default function OnboardingSyncPage() {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const setUserInfo = useOnboardingStore((s) => s.setUserInfo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace('/');
      return;
    }

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

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || 'Error al sincronizar la sesión.');
          return;
        }

        if (cancelled) return;

        const data = await res.json();
        if (data.userInfo) {
          setUserInfo({
            ...data.userInfo,
            terms: true,
          });
        }

        if (!cancelled) {
          window.location.href = '/onboarding/dashboard';
        }
      } catch {
        if (!cancelled) {
          setError('Error de conexión. Intenta de nuevo.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, setUserInfo, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="rounded-xl border border-border bg-card p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-heading">Error</h1>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/onboarding/dashboard')}
            className="mt-6 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
