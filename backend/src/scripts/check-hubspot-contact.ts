/**
 * Verifica si un contacto existe en HubSpot por email (para comprobar que el onboarding lo creó).
 *
 * Uso:
 *   pnpm exec ts-node -r tsconfig-paths/register src/scripts/check-hubspot-contact.ts <email>
 * Ejemplo:
 *   pnpm exec ts-node -r tsconfig-paths/register src/scripts/check-hubspot-contact.ts usuario@ejemplo.com
 *
 * Requiere HUBSPOT_ACCESS_TOKEN en .env y scope crm.objects.contacts.read en la Private App.
 */

import 'dotenv/config';

const HUBSPOT_API_BASE = 'https://api.hubspot.com';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error(
      'Uso: pnpm exec ts-node -r tsconfig-paths/register src/scripts/check-hubspot-contact.ts <email>',
    );
    process.exit(1);
  }

  const token =
    process.env.HUBSPOT_ACCESS_TOKEN ??
    process.env.HUBSPOT_PRIVATE_APP_ACCESS_TOKEN;
  if (!token) {
    console.error('Falta HUBSPOT_ACCESS_TOKEN en .env');
    process.exit(1);
  }

  const url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email&properties=email,firstname,lastname,company,website,lifecyclestage,createdate,onboarding_stage,last_onboarding_activity_at,pdf_generated_at,hub_sales,hub_marketing,hub_services,discovery_summary`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) {
    console.log(
      '❌ No se encontró ningún contacto en HubSpot con ese email:',
      email,
    );
    process.exit(0);
  }

  if (!res.ok) {
    console.error('Error de HubSpot:', res.status, await res.text());
    process.exit(1);
  }

  const contact = (await res.json()) as {
    id: string;
    properties: Record<string, string>;
  };
  console.log('✅ Contacto encontrado en HubSpot:\n');
  console.log('  ID:', contact.id);
  console.log('  Propiedades:', JSON.stringify(contact.properties, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
