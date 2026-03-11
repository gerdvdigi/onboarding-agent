import { Inject, Injectable } from '@nestjs/common';
import { eq, and, gt } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import {
  onboardingSessions,
} from '../../db/drizzle/schema';

@Injectable()
export class OnboardingSessionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  async create(data: {
    email: string;
    expiresAt: Date;
    firstName?: string | null;
    lastName?: string | null;

    ipCreated?: string;
    maxRequestsPerMin?: number;

    clerkUserId?: string | null;

  }) {
    const [row] = await this.db
      .insert(onboardingSessions)
      .values({
        email: data.email,
        expiresAt: data.expiresAt,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        ipCreated: data.ipCreated ?? null,
        maxRequestsPerMin: data.maxRequestsPerMin ?? 60,
        clerkUserId: data.clerkUserId ?? null,
      })
      .returning();
    return row;
  }

  async findByClerkUserId(clerkUserId: string) {
    const [row] = await this.db
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.clerkUserId, clerkUserId))
      .limit(1);
    return row ?? null;
  }



  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.id, id))
      .limit(1);
    return row ?? null;
  }

  async updateLastUsed(
    id: string,
    data: {
      lastUsedAt: Date;
      ipLastUsed?: string;
    },
  ) {
    const [row] = await this.db
      .update(onboardingSessions)
      .set({
        lastUsedAt: data.lastUsedAt,
        ...(data.ipLastUsed != null && { ipLastUsed: data.ipLastUsed }),
      })
      .where(eq(onboardingSessions.id, id))
      .returning();
    return row ?? null;
  }

  async findValidById(id: string, now: Date) {
    const [row] = await this.db
      .select()
      .from(onboardingSessions)
      .where(
        and(
          eq(onboardingSessions.id, id),
          gt(onboardingSessions.expiresAt, now),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findValidByClerkUserId(clerkUserId: string, now: Date) {
    const [row] = await this.db
      .select()
      .from(onboardingSessions)
      .where(
        and(
          eq(onboardingSessions.clerkUserId, clerkUserId),
          gt(onboardingSessions.expiresAt, now),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
