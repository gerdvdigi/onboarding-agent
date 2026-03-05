import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    jsonb,
    uniqueIndex,
    index,
  } from "drizzle-orm/pg-core";
  
  // Tipado TS (no crea nada en DB, solo te protege en el código)
  export const ONBOARDING_SESSION_STATUSES = [
    "invited",
    "active",
    "revoked",
    "expired",
  ] as const;
  
  export type OnboardingSessionStatus =
    (typeof ONBOARDING_SESSION_STATUSES)[number];
  
  export const onboardingSessions = pgTable(
    "onboarding_sessions",
    {
      id: uuid("id").notNull().defaultRandom().primaryKey(),

      email: text("email").notNull(),

      /** From step-1 form; used to hydrate userInfo when opening magic link on different device. */
      firstName: text("first_name"),
      lastName: text("last_name"),

      /** Company and website from step-1 form; used to block duplicate submissions. */
      company: text("company"),
      website: text("website"),

      // En DB es TEXT + CHECK, así que acá también es TEXT
      status: text("status").notNull().default("invited"),

      /** Onboarding stage: form_sent | magic_link_used | discovery_started | plan_approved | pdf_downloaded. Fuente de verdad para guards de step. */
      onboardingStage: text("onboarding_stage"),

      tokenHash: text("token_hash").notNull(),

      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),

      lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

      ipCreated: text("ip_created"),
      ipLastUsed: text("ip_last_used"),

      maxRequestsPerMin: integer("max_requests_per_min").notNull().default(60),
    },
    (t) => ({
      tokenHashUq: uniqueIndex("onboarding_sessions_token_hash_uq").on(t.tokenHash),
      emailIdx: index("onboarding_sessions_email_idx").on(t.email),
      expiresAtIdx: index("onboarding_sessions_expires_at_idx").on(t.expiresAt),
      emailStatusIdx: index("onboarding_sessions_email_status_idx").on(t.email, t.status),
      emailCompanyWebsiteIdx: index("onboarding_sessions_email_company_website_idx").on(
        t.email,
        t.company,
        t.website,
      ),
    })
  );

  /** Conversations within an onboarding session. One session can have many conversations. */
  export const onboardingConversations = pgTable(
    "onboarding_conversations",
    {
      id: uuid("id").notNull().defaultRandom().primaryKey(),
      sessionId: uuid("session_id")
        .notNull()
        .references(() => onboardingSessions.id, { onDelete: "cascade" }),
      title: text("title").notNull().default("Conversation 1"),
      /** HubSpot Note ID asociada a esta conversación (se actualiza en cada hito). */
      hubspotNoteId: text("hubspot_note_id"),
      /** Answers collected during discovery (company_info, hubs_included, etc.). */
      answersCollected: jsonb("answers_collected").$type<Record<string, string>>(),
      /** Discovery progress percentage (0-100) at last update. */
      discoveryPercentage: integer("discovery_percentage"),
      /** Hubs selected (e.g. "Sales Hub, Marketing Hub"). */
      hubs: text("hubs"),
      /** Plan snapshot when approved (objectives, modules, etc.). */
      planSnapshot: jsonb("plan_snapshot").$type<Record<string, unknown>>(),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      sessionIdIdx: index("onboarding_conversations_session_id_idx").on(t.sessionId),
      sessionCreatedIdx: index("onboarding_conversations_session_created_idx").on(
        t.sessionId,
        t.createdAt,
      ),
    })
  );

  /** Chat messages per conversation (belongs to onboarding_conversations). */
  export const onboardingChatMessages = pgTable(
    "onboarding_chat_messages",
    {
      id: uuid("id").notNull().defaultRandom().primaryKey(),
      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => onboardingConversations.id, { onDelete: "cascade" }),
      role: text("role").notNull(), // 'user' | 'assistant'
      content: text("content").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      conversationIdIdx: index("onboarding_chat_messages_conversation_id_idx").on(
        t.conversationId,
      ),
    })
  );
