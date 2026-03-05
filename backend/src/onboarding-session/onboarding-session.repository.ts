import { Inject, Injectable } from '@nestjs/common';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module';
import {
  onboardingSessions,
  type OnboardingSessionStatus,
} from '../../db/drizzle/schema';

@Injectable()
export class OnboardingSessionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: any) {}

  /** Normalize website for storage: empty string → null. */
  private normalizeWebsite(website: string | undefined | null): string | null {
    if (website == null || website.trim() === '') return null;
    return website.trim();
  }

  /**
   * Finds an existing submission with the same email, company and website
   * (from step-1). Used to block duplicate form submissions.
   */
  async findByEmailCompanyWebsite(
    email: string,
    company: string,
    website: string | undefined | null,
  ) {
    const websiteNorm = this.normalizeWebsite(website);
    const [row] = await this.db
      .select()
      .from(onboardingSessions)
      .where(
        and(
          eq(onboardingSessions.email, email.trim().toLowerCase()),
          eq(onboardingSessions.company, company.trim()),
          websiteNorm === null
            ? isNull(onboardingSessions.website)
            : eq(onboardingSessions.website, websiteNorm),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async create(data: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    website?: string | null;
    ipCreated?: string;
    maxRequestsPerMin?: number;
    onboardingStage?: string | null;
  }) {
    const [row] = await this.db
      .insert(onboardingSessions)
      .values({
        email: data.email,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        company: data.company ?? null,
        website: this.normalizeWebsite(data.website),
        ipCreated: data.ipCreated ?? null,
        maxRequestsPerMin: data.maxRequestsPerMin ?? 60,
        onboardingStage: data.onboardingStage ?? null,
      })
      .returning();
    return row;
  }

  async findByTokenHash(tokenHash: string) {
    const [row] = await this.db
      .select()
      .from(onboardingSessions)
      .where(eq(onboardingSessions.tokenHash, tokenHash))
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

  async updateOnboardingStage(id: string, stage: string): Promise<void> {
    await this.db
      .update(onboardingSessions)
      .set({ onboardingStage: stage })
      .where(eq(onboardingSessions.id, id));
  }

  async updateLastUsed(
    id: string,
    data: {
      lastUsedAt: Date;
      ipLastUsed?: string;
      status?: OnboardingSessionStatus;
    },
  ) {
    const [row] = await this.db
      .update(onboardingSessions)
      .set({
        lastUsedAt: data.lastUsedAt,
        ...(data.ipLastUsed != null && { ipLastUsed: data.ipLastUsed }),
        ...(data.status != null && { status: data.status }),
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
}
