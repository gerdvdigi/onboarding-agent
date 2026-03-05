import { Inject, Injectable } from '@nestjs/common';
import { eq, asc, and } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import { onboardingConversations } from '../../db/drizzle/schema';

export interface ConversationRow {
  id: string;
  sessionId: string;
  title: string;
  hubspotNoteId?: string | null;
  answersCollected?: Record<string, string> | null;
  discoveryPercentage?: number | null;
  hubs?: string | null;
  planSnapshot?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ConversationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async findBySessionId(sessionId: string): Promise<ConversationRow[]> {
    return this.db
      .select()
      .from(onboardingConversations)
      .where(eq(onboardingConversations.sessionId, sessionId))
      .orderBy(asc(onboardingConversations.createdAt));
  }

  async findById(id: string): Promise<ConversationRow | null> {
    const [row] = await this.db
      .select()
      .from(onboardingConversations)
      .where(eq(onboardingConversations.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByIdAndSession(
    id: string,
    sessionId: string,
  ): Promise<ConversationRow | null> {
    const [row] = await this.db
      .select()
      .from(onboardingConversations)
      .where(
        and(
          eq(onboardingConversations.id, id),
          eq(onboardingConversations.sessionId, sessionId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async countBySessionId(sessionId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(onboardingConversations)
      .where(eq(onboardingConversations.sessionId, sessionId));
    return rows.length;
  }

  async create(sessionId: string, title?: string): Promise<ConversationRow> {
    const count = await this.countBySessionId(sessionId);
    const finalTitle = title ?? `Conversation ${count + 1}`;
    const [row] = await this.db
      .insert(onboardingConversations)
      .values({
        sessionId,
        title: finalTitle,
      })
      .returning();
    return row;
  }

  async updateHubspotNoteId(
    conversationId: string,
    hubspotNoteId: string,
  ): Promise<void> {
    await this.db
      .update(onboardingConversations)
      .set({ hubspotNoteId, updatedAt: new Date() })
      .where(eq(onboardingConversations.id, conversationId));
  }

  async updateDiscoveryData(
    conversationId: string,
    data: {
      answersCollected?: Record<string, string>;
      discoveryPercentage?: number;
      hubs?: string;
    },
  ): Promise<void> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.answersCollected !== undefined) {
      updates.answersCollected = data.answersCollected;
    }
    if (data.discoveryPercentage !== undefined) {
      updates.discoveryPercentage = data.discoveryPercentage;
    }
    if (data.hubs !== undefined) {
      updates.hubs = data.hubs;
    }
    if (Object.keys(updates).length <= 1) return;
    await this.db
      .update(onboardingConversations)
      .set(updates)
      .where(eq(onboardingConversations.id, conversationId));
  }

  async updatePlanSnapshot(
    conversationId: string,
    planSnapshot: Record<string, unknown>,
  ): Promise<void> {
    await this.db
      .update(onboardingConversations)
      .set({ planSnapshot, updatedAt: new Date() })
      .where(eq(onboardingConversations.id, conversationId));
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(onboardingConversations)
      .where(eq(onboardingConversations.id, id));
  }
}
