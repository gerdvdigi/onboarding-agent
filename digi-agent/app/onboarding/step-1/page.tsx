import { redirect } from 'next/navigation';

/**
 * Step 1 eliminado: redirige al dashboard.
 * El flujo actual es: invitación Clerk → sync → dashboard con conversaciones.
 */
export default function Step1Page() {
  redirect('/onboarding/dashboard');
}
