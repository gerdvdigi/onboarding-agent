/**
 * Lista todas las propiedades de contacto en HubSpot para verificar nombres internos.
 * Útil cuando PROPERTY_DOESNT_EXIST indica que una propiedad no existe.
 *
 * Uso:
 *   cd backend && pnpm run list-hubspot-properties
 *
 * Requiere HUBSPOT_ACCESS_TOKEN en .env y scope crm.schemas.contacts.read (o crm.objects.contacts.read).
 */

import 'dotenv/config';

const HUBSPOT_API_BASE = 'https://api.hubspot.com';

async function main() {
  const token =
    process.env.HUBSPOT_ACCESS_TOKEN ??
    process.env.HUBSPOT_PRIVATE_APP_ACCESS_TOKEN;
  if (!token) {
    console.error('Falta HUBSPOT_ACCESS_TOKEN en .env');
    process.exit(1);
  }

  const url = `${HUBSPOT_API_BASE}/crm/v3/properties/contacts`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error('Error de HubSpot:', res.status, await res.text());
    process.exit(1);
  }

  const data = (await res.json()) as {
    results: Array<{
      name: string;
      label: string;
      type: string;
      fieldType: string;
    }>;
  };
  const props = data.results ?? [];

  const onboardingProps = [
    'onboarding_stage',
    'last_onboarding_activity_at',
    'pdf_generated_at',
    'hub_sales',
    'hub_marketing',
    'hub_services',
    'discovery_summary',
  ];

  console.log('=== Propiedades de onboarding que el backend espera ===\n');
  for (const name of onboardingProps) {
    const found = props.find((p) => p.name === name);
    if (found) {
      console.log(
        `  ✅ ${name} (label: "${found.label}", type: ${found.type}/${found.fieldType})`,
      );
    } else {
      const similar = props.filter(
        (p) =>
          p.name.toLowerCase().includes(name.replace(/_/g, '')) ||
          p.label.toLowerCase().includes(name.replace(/_/g, ' ')),
      );
      console.log(`  ❌ ${name} NO EXISTE`);
      if (similar.length > 0) {
        console.log(
          `     Posibles similares: ${similar.map((s) => s.name).join(', ')}`,
        );
      }
    }
  }

  console.log(
    '\n=== Todas las propiedades de contacto (custom + default) ===\n',
  );
  const custom = props.filter((p) => !p.name.startsWith('hs_'));
  for (const p of custom.slice(0, 50)) {
    console.log(`  ${p.name} → "${p.label}" (${p.type}/${p.fieldType})`);
  }
  if (custom.length > 50) {
    console.log(`  ... y ${custom.length - 50} más`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
