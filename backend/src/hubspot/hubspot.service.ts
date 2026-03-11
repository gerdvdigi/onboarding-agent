import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const HUBSPOT_API_BASE = 'https://api.hubspot.com';


/** HubSpot propiedades "Date" exigen medianoche UTC; devuelve ms desde epoch para hoy 00:00:00 UTC */
function toHubSpotDateAtMidnightUtc(d: Date = new Date()): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface HubSpotContactInput {
  email: string;
  firstname: string;
  lastname: string;
}

/**
 * Integración con HubSpot CRM API v3 (Contacts + Notes).
 * Crea/actualiza contactos con propiedades estándar y personalizadas de onboarding.
 * Crea Notes asociadas al Contact en hitos clave (Opción C: Contact + Notes).
 * Si HUBSPOT_ACCESS_TOKEN no está definido, las operaciones se omiten sin fallar.
 *
 * ## Propiedades de Contact (crear en HubSpot: Settings > Properties > Contact)
 *
 * | Nombre interno                | Tipo       | Descripción                                      |
 * | ----------------------------- | ---------- | ------------------------------------------------ |
 * | onboarding_stage             | dropdown   | Form Sent \| Magic Link Used \| Discovery Started \| Plan Approved \| Pdf Downloaded |
 * | last_onboarding_activity_at   | date       | Última actividad global (medianoche UTC)         |
 * | last_conversation_at         | date       | Última actividad en cualquier conversación       |
 * | pdf_generated_at             | date       | Fecha de descarga del PDF                        |
 * | conversations_count         | number     | Total de conversaciones creadas                 |
 * | hub_sales, hub_marketing, hub_services | boolean | Hubs del plan aprobado más reciente |
 * | discovery_summary           | multi-line | Resumen del discovery (objectives)               |
 *
 * ## Notes format (prefix [Onboarding], all in English)
 *
 * Each note includes: Status, Date, Time UTC, and stage-specific details.
 * - Created: Conversation title
 * - Discovery Started: Note that user began AI discovery chat
 * - Plan Approved: Hubs selected, timeline, modules/recommendations count, objectives summary
 * - PDF Downloaded: Confirmation of PDF download for company
 *
 * ## Scopes requeridos (Private App)
 *
 * - crm.objects.contacts.read
 * - crm.objects.contacts.write
 * - crm.objects.notes.write
 *
 * @see https://developers.hubspot.com/docs/api/crm/contacts
 * @see https://developers.hubspot.com/docs/api/crm/engagements/notes
 */
@Injectable()
export class HubSpotService {
  private readonly logger = new Logger(HubSpotService.name);

  constructor(private readonly config: ConfigService) {}

  private getAccessToken(): string | undefined {
    return (
      this.config.get<string>('HUBSPOT_ACCESS_TOKEN') ??
      this.config.get<string>('HUBSPOT_PRIVATE_APP_ACCESS_TOKEN')
    );
  }

  /**
   * Crea o actualiza un contacto en HubSpot por email (upsert).
   * No lanza error si el token no está configurado o si HubSpot falla,
   * para no bloquear el flujo de onboarding.
   */
  async createOrUpdateContact(input: HubSpotContactInput): Promise<void> {
    const token = this.getAccessToken();
    if (!token) {
      this.logger.debug(
        'HUBSPOT_ACCESS_TOKEN not set; skipping HubSpot contact sync',
      );
      return;
    }

    const properties: Record<string, string> = {
      email: input.email,
      firstname: input.firstname,
      lastname: input.lastname,
    };

    properties.lifecyclestage = 'lead';
    properties.last_onboarding_activity_at = String(
      toHubSpotDateAtMidnightUtc(),
    );

    const body = {
      inputs: [
        {
          id: input.email,
          idProperty: 'email',
          properties,
        },
      ],
    };

    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/batch/upsert`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(
          `HubSpot contact upsert failed (${res.status}): ${text}`,
        );
        return;
      }
      this.logger.log(`HubSpot contact upserted: ${input.email}`);
    } catch (err) {
      this.logger.warn(
        `HubSpot contact upsert error for ${input.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Actualiza propiedades del contacto (estándar y personalizadas de onboarding).
   * No lanza si no hay token o HubSpot falla.
   */
  async updateContactProperties(
    email: string,
    properties: Record<string, string | number | boolean>,
  ): Promise<void> {
    const token = this.getAccessToken();
    if (!token) {
      this.logger.debug('HUBSPOT_ACCESS_TOKEN not set');
      return;
    }
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(properties)) {
      if (v === undefined || v === null) continue;

      if (
        k === 'last_onboarding_activity_at' ||
        k === 'last_conversation_at' ||
        k === 'pdf_generated_at'
      ) {
        const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
        body[k] = String(toHubSpotDateAtMidnightUtc(d));
        continue;
      }
      body[k] = typeof v === 'boolean' ? String(v) : String(v);
    }
    if (Object.keys(body).length === 0) return;
    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`;
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: body }),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(
          `HubSpot contact update failed (${res.status}): ${text}`,
        );
        try {
          const json = JSON.parse(text) as {
            errors?: Array<{ code?: string }>;
          };
          if (
            res.status === 400 &&
            json.errors?.some((e) => e.code === 'PROPERTY_DOESNT_EXIST')
          ) {
            this.logger.warn(
              'Crea en HubSpot las propiedades de contacto: Settings > Properties > Contact > Create property. Nombres internos: onboarding_stage (dropdown), last_onboarding_activity_at (date), last_conversation_at (date), pdf_generated_at (date), conversations_count (number), hub_sales, hub_marketing, hub_services (checkbox), discovery_summary (multi-line text).',
            );
          }
        } catch {
          // ignore
        }
        return;
      }
      this.logger.log(`HubSpot contact updated: ${email}`);
    } catch (err) {
      this.logger.warn(
        `HubSpot contact update error for ${email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Crea una Note en HubSpot asociada al Contact por email.
   * Requiere scope crm.objects.contacts.read y crm.objects.notes.write en la Private App.
   * @returns El ID de la Note creada o null si no hay token, el contacto no existe o HubSpot falla.
   */
  async createNote(contactEmail: string, body: string): Promise<string | null> {
    const token = this.getAccessToken();
    if (!token) {
      this.logger.debug('HUBSPOT_ACCESS_TOKEN not set; skipping HubSpot note');
      return null;
    }
    const contact = await this.findContactByEmail(contactEmail);
    if (!contact || typeof contact.id !== 'string') {
      this.logger.debug(
        `Contact not found for ${contactEmail}; skipping HubSpot note`,
      );
      return null;
    }
    const contactId = String(contact.id);
    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/notes`;
    const payload = {
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_note_body: body.slice(0, 65536),
      },
      associations: [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED' as const,
              associationTypeId: 202,
            },
          ],
        },
      ],
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(`HubSpot note create failed (${res.status}): ${text}`);
        return null;
      }
      const data = (await res.json()) as { id?: string };
      const noteId = data?.id != null ? String(data.id) : null;
      if (noteId) {
        this.logger.log(`HubSpot note created for contact: ${contactEmail}`);
      }
      return noteId;
    } catch (err) {
      this.logger.warn(
        `HubSpot note create error for ${contactEmail}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Actualiza una Note existente en HubSpot.
   * No lanza si no hay token o HubSpot falla.
   */
  async updateNote(noteId: string, body: string): Promise<void> {
    const token = this.getAccessToken();
    if (!token) {
      this.logger.debug('HUBSPOT_ACCESS_TOKEN not set; skipping HubSpot note update');
      return;
    }
    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/notes/${encodeURIComponent(noteId)}`;
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            hs_timestamp: new Date().toISOString(),
            hs_note_body: body.slice(0, 65536),
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(
          `HubSpot note update failed (${res.status}): ${text}`,
        );
        return;
      }
      this.logger.log(`HubSpot note updated: ${noteId}`);
    } catch (err) {
      this.logger.warn(
        `HubSpot note update error for ${noteId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Busca un contacto en HubSpot por email (para verificar que se creó).
   * Requiere scope crm.objects.contacts.read en la Private App.
   * @returns El contacto con sus properties o null si no existe / no hay token / error
   */
  async findContactByEmail(
    email: string,
  ): Promise<Record<string, unknown> | null> {
    const token = this.getAccessToken();
    if (!token) {
      this.logger.debug('HUBSPOT_ACCESS_TOKEN not set');
      return null;
    }
    const url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email&properties=email,firstname,lastname,company,website,lifecyclestage,createdate,onboarding_stage,last_onboarding_activity_at,pdf_generated_at,hub_sales,hub_marketing,hub_services,discovery_summary`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        this.logger.warn(
          `HubSpot get contact failed (${res.status}): ${await res.text()}`,
        );
        return null;
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      this.logger.warn(
        `HubSpot get contact error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
