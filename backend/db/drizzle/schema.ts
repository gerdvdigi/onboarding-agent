import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    jsonb,
    index,
  } from "drizzle-orm/pg-core";
  


  
  export const onboardingSessions = pgTable(
    "onboarding_sessions",
    {
      id: uuid("id").notNull().defaultRandom().primaryKey(),

      email: text("email").notNull(),

      firstName: text("first_name"),
      lastName: text("last_name"),

      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),

      lastUsedAt: timestamp("last_used_at", { withTimezone: true }),

      ipCreated: text("ip_created"),
      ipLastUsed: text("ip_last_used"),

      maxRequestsPerMin: integer("max_requests_per_min").notNull().default(60),

      /** Clerk user ID for sessions created via Clerk sign-in/sign-up. Índice único parcial en migración 002 evita duplicados. */
      clerkUserId: text("clerk_user_id"),
    },
    (t) => ({
      clerkUserIdIdx: index("onboarding_sessions_clerk_user_id_idx").on(t.clerkUserId),
      emailIdx: index("onboarding_sessions_email_idx").on(t.email),
      expiresAtIdx: index("onboarding_sessions_expires_at_idx").on(t.expiresAt),
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
      /** URL del PDF generado almacenado en Supabase Storage. */
      pdfUrl: text("pdf_url"),
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
