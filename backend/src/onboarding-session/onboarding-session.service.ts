import {
  Injectable,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

import { OnboardingSessionRepository } from './onboarding-session.repository';



/** Solo actualizar lastUsedAt si pasaron al menos estos minutos desde la última vez. */
const LAST_USED_THROTTLE_MIN = 5;

/** In-memory rate limit: sessionId -> { count, windowStartMs } */
const rateLimitMap = new Map<
  string,
  { count: number; windowStartMs: number }
>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_CLEANUP_THRESHOLD = 500;
const RATE_LIMIT_STALE_MS = 2 * 60 * 1000; // 2 min

const STAGES_BEYOND_DISCOVERY = ['plan_approved', 'pdf_downloaded'];

function isStageBeyondDiscovery(stage: string | null | undefined): boolean {
  return stage != null && STAGES_BEYOND_DISCOVERY.includes(stage);
}

function cleanupStaleRateLimitEntries(): void {
  if (rateLimitMap.size < RATE_LIMIT_CLEANUP_THRESHOLD) return;
  const now = Date.now();
  const keysToDelete: string[] = [];
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStartMs > RATE_LIMIT_STALE_MS) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    rateLimitMap.delete(key);
  }
}

function getRequestCountInWindow(
  sessionId: string,
  windowMs: number,
  maxPerWindow: number,
): { allowed: boolean; count: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(sessionId);

  if (!entry) {
    rateLimitMap.set(sessionId, { count: 1, windowStartMs: now });
    return { allowed: true, count: 1 };
  }

  if (now - entry.windowStartMs >= windowMs) {
    rateLimitMap.set(sessionId, { count: 1, windowStartMs: now });
    return { allowed: true, count: 1 };
  }

  entry.count += 1;
  const allowed = entry.count <= maxPerWindow;
  return { allowed, count: entry.count };
}

@Injectable()
export class OnboardingSessionService {
  constructor(private readonly repo: OnboardingSessionRepository) {}

  /**
   * Obtiene la sesión por clerkUserId (desde token Clerk) y verifica que no esté expirada.
   */
  async getValidSessionByClerkUserId(
    clerkUserId: string,
    ip?: string,
  ): Promise<{
    id: string;
    email: string;
    maxRequestsPerMin: number;
    userInfo: {
      name: string;
      lastName: string;
      email: string;
    };
  } | null> {
    const now = new Date();
    const row = await this.repo.findValidByClerkUserId(clerkUserId, now);
    if (!row) return null;

    if (ip) {
      const throttleMs = LAST_USED_THROTTLE_MIN * 60 * 1000;
      const lastUsedMs = row.lastUsedAt
        ? new Date(row.lastUsedAt).getTime()
        : 0;
      if (now.getTime() - lastUsedMs >= throttleMs) {
        await this.repo.updateLastUsed(row.id, {
          lastUsedAt: now,
          ipLastUsed: ip,
        });
      }
    }

    return {
      id: row.id,
      email: row.email,
      maxRequestsPerMin: row.maxRequestsPerMin,
      userInfo: {
        name: row.firstName ?? '',
        lastName: row.lastName ?? '',
        email: row.email,
      },
    };
  }

  /**
   * Obtiene la sesión por ID (legacy, para compatibilidad) y verifica que no esté expirada.
   */
  async getValidSession(
    sessionId: string,
    ip?: string,
  ): Promise<{
    id: string;
    email: string;
    maxRequestsPerMin: number;
    userInfo: {
      name: string;
      lastName: string;
      email: string;  
    };
  } | null> {
    const now = new Date();
    const row = await this.repo.findValidById(sessionId, now);
    if (!row) return null;

    if (ip) {
      const throttleMs = LAST_USED_THROTTLE_MIN * 60 * 1000;
      const lastUsedMs = row.lastUsedAt
        ? new Date(row.lastUsedAt).getTime()
        : 0;
      if (now.getTime() - lastUsedMs >= throttleMs) {
        await this.repo.updateLastUsed(row.id, {
          lastUsedAt: now,
          ipLastUsed: ip,
        });
      }
    }

    const r = row;
    return {
      id: row.id,
      email: row.email,
      maxRequestsPerMin: row.maxRequestsPerMin,
      userInfo: {
        name: r.firstName ?? '',
        lastName: r.lastName ?? '',
        email: row.email,
      },
    };
  }

  /**
   * Crea o recupera sesión de onboarding para un usuario de Clerk.
   * Usado cuando el usuario se registra vía invitación Clerk.
   */
  async createOrGetSessionForClerk(params: {
    clerkUserId: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<{
    sessionId: string;
    userInfo: {
      name: string;
      lastName: string;
      email: string;
    };
  }> {
    const existing = await this.repo.findByClerkUserId(params.clerkUserId);
    if (existing) {
      const now = new Date();
      const valid = await this.repo.findValidById(existing.id, now);
      if (valid) {
        return {
          sessionId: valid.id,
          userInfo: {
            name: valid.firstName ?? '',
            lastName: valid.lastName ?? '',
            email: valid.email,
          },
        };
      }
    }

    const expiresAt = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000,
    );

    try {
      const row = await this.repo.create({
        email: params.email.trim().toLowerCase(),
        expiresAt,
        firstName: params.firstName?.trim() || null,
        lastName: params.lastName?.trim() || null,
        clerkUserId: params.clerkUserId,
      });

      if (!row) {
        throw new ConflictException('No se pudo crear la sesión');
      }

      return {
        sessionId: row.id,
        userInfo: {
          name: row.firstName ?? '',
          lastName: row.lastName ?? '',
          email: row.email,
        },
      };
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : err &&
              typeof err === 'object' &&
              'cause' in err &&
              err.cause &&
              typeof err.cause === 'object' &&
              'code' in err.cause
            ? (err.cause as { code?: string }).code
            : undefined;
      const isDuplicateKey = code === '23505';

      if (!isDuplicateKey) throw err;

      if (existing) {
        const now = new Date();
        const valid = await this.repo.findValidById(existing.id, now);
        if (valid) {
          return {
            sessionId: valid.id,
            userInfo: {
              name: valid.firstName ?? '',
              lastName: valid.lastName ?? '',
              email: valid.email,
            },
          };
        }
      }

      const retry = await this.repo.findByClerkUserId(params.clerkUserId);
      if (retry) {
        const now = new Date();
        const valid = await this.repo.findValidById(retry.id, now);
        if (valid) {
          return {
            sessionId: valid.id,
            userInfo: {
              name: valid.firstName ?? '',
              lastName: valid.lastName ?? '',
              email: valid.email,
            },
          };
        }
      }

      throw new ConflictException('Could not create session');
    }
  }

  /**
   * Comprueba rate limit por sesión (ventana 1 minuto).
   * Lanza ForbiddenException si se supera el límite.
   */
  checkRateLimit(sessionId: string, maxRequestsPerMin: number): void {
    const { allowed } = getRequestCountInWindow(
      sessionId,
      RATE_LIMIT_WINDOW_MS,
      maxRequestsPerMin,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Too many requests. Try again in a minute.',
      );
    }
    cleanupStaleRateLimitEntries();
  }
}
