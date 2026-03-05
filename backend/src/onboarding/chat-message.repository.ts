import { Inject, Injectable } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import { onboardingChatMessages } from '../../db/drizzle/schema';

export interface ChatMessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
}

@Injectable()
export class ChatMessageRepository {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async findByConversationId(
    conversationId: string,
  ): Promise<ChatMessageRow[]> {
    const rows = await this.db
      .select()
      .from(onboardingChatMessages)
      .where(eq(onboardingChatMessages.conversationId, conversationId))
      .orderBy(asc(onboardingChatMessages.createdAt));
    return rows;
  }

  async insert(
    conversationId: string,
    role: string,
    content: string,
  ): Promise<ChatMessageRow> {
    const [row] = await this.db
      .insert(onboardingChatMessages)
      .values({ conversationId, role, content })
      .returning();
    return row;
  }

  /** Replaces all messages for a conversation (sync from client). */
  async replaceAllForConversation(
    conversationId: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<void> {
    await this.db
      .delete(onboardingChatMessages)
      .where(eq(onboardingChatMessages.conversationId, conversationId));
    if (messages.length === 0) return;
    await this.db.insert(onboardingChatMessages).values(
      messages.map((m) => ({
        conversationId,
        role: m.role,
        content: m.content,
      })),
    );
  }
}
