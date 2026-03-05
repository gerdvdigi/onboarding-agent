import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { OnboardingSessionRepository } from './onboarding-session.repository';
import type { OnboardingSessionStatus } from '../../db/drizzle/schema';

const TOKEN_BYTES = 32;
const HASH_ALGORITHM = 'sha256';

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
  constructor(
    private readonly repo: OnboardingSessionRepository,
    private readonly config: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return createHash(HASH_ALGORITHM).update(token, 'utf8').digest('hex');
  }

  private constantTimeCompare(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, 'hex');
      const bufB = Buffer.from(b, 'hex');
      return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  /** Crea una invitación: token aleatorio, hash en DB, devuelve el magic link (solo para uso interno/admin). */
  async createInvitation(params: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    website?: string | null;
    expiresInDays?: number;
    maxRequestsPerMin?: number;
    ipCreated?: string;
    baseUrl?: string;
  }): Promise<{ magicLink: string; expiresAt: Date; sessionId: string }> {
    const company = params.company?.trim() ?? null;
    const website =
      params.website == null || params.website.toString().trim() === ''
        ? null
        : params.website.toString().trim();

    if (company != null) {
      const existing = await this.repo.findByEmailCompanyWebsite(
        params.email,
        company,
        website,
      );
      if (existing) {
        // Idempotent: return success to avoid email enumeration; user already has magic link
        const baseUrl =
          params.baseUrl ??
          this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ??
          'http://localhost:3000';
        const existingToken = existing.token; // We don't have raw token, need to create new
        // Create new token for existing session if expired, else return generic success
        const expiresAtMs = new Date(existing.expiresAt).getTime();
        if (expiresAtMs > Date.now()) {
          return {
            magicLink: `${baseUrl}/onboarding?token=${encodeURIComponent(existing.token ?? '')}`,
            expiresAt: existing.expiresAt,
            sessionId: existing.id,
          };
        }
        // Expired: fall through to create new invitation below
      }
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresInDays = params.expiresInDays ?? 3;
    // Explicit UTC-based expiration (avoids timezone bugs with setDate)
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );

    const row = await this.repo.create({
      email: params.email,
      tokenHash,
      expiresAt,
      firstName: params.firstName?.trim() || null,
      lastName: params.lastName?.trim() || null,
      company,
      website,
      ipCreated: params.ipCreated,
      maxRequestsPerMin: params.maxRequestsPerMin ?? 60,
      onboardingStage: 'form_sent',
    });

    if (!row) {
      throw new ConflictException('No se pudo crear la sesión de invitación');
    }

    const baseUrl =
      params.baseUrl ??
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ??
      'http://localhost:3000';
    const magicLink = `${baseUrl}/onboarding?token=${encodeURIComponent(token)}`;

    return {
      magicLink,
      expiresAt,
      sessionId: row.id,
    };
  }

  /**
   * Actualiza el onboarding_stage en DB. Usado por plan-approved, chat, pdf.
   */
  async updateOnboardingStage(
    sessionId: string,
    stage: 'discovery_started' | 'plan_approved' | 'pdf_downloaded',
  ): Promise<void> {
    await this.repo.updateOnboardingStage(sessionId, stage);
  }

  /**
   * Valida el token del magic link: busca por hash, comprueba estado y expiración,
   * actualiza lastUsedAt y pasa a 'active' si estaba 'invited'.
   */
  async validateToken(params: { token: string; ipLastUsed?: string }): Promise<{
    sessionId: string;
    email: string;
    status: OnboardingSessionStatus;
    onboardingStage?: string;
    userInfo: {
      name: string;
      lastName: string;
      email: string;
      company: string;
      website: string;
    };
  }> {
    const tokenHash = this.hashToken(params.token);
    const row = await this.repo.findByTokenHash(tokenHash);

    if (!row) {
      throw new UnauthorizedException(
        'Enlace de invitación inválido o expirado',
      );
    }

    const now = new Date();
    const expiresAtMs = new Date(row.expiresAt).getTime();
    if (expiresAtMs <= now.getTime()) {
      throw new UnauthorizedException('Enlace de invitación expirado');
    }

    if (row.status === 'revoked') {
      throw new UnauthorizedException('Esta invitación ha sido revocada');
    }

    const newStatus: OnboardingSessionStatus =
      row.status === 'invited' ? 'active' : row.status;

    await this.repo.updateLastUsed(row.id, {
      lastUsedAt: now,
      ipLastUsed: params.ipLastUsed,
      status: newStatus,
    });

    const r = row;
    if (!isStageBeyondDiscovery(r.onboardingStage)) {
      await this.repo.updateOnboardingStage(row.id, 'magic_link_used');
    }
    const stageAfterUpdate = isStageBeyondDiscovery(r.onboardingStage)
      ? r.onboardingStage
      : 'magic_link_used';

    return {
      sessionId: row.id,
      email: row.email,
      status: newStatus,
      userInfo: {
        name: r.firstName ?? '',
        lastName: r.lastName ?? '',
        email: row.email,
        company: row.company ?? '',
        website: row.website ?? '',
      },
      onboardingStage: stageAfterUpdate,
    };
  }

  /**
   * Obtiene la sesión por ID (por ejemplo desde cookie firmada) y verifica que no esté expirada.
   */
  async getValidSession(
    sessionId: string,
    ip?: string,
  ): Promise<{
    id: string;
    email: string;
    status: string;
    maxRequestsPerMin: number;
    onboardingStage?: string | null;
    userInfo: {
      name: string;
      lastName: string;
      email: string;
      company: string;
      website: string;
    };
  } | null> {
    const now = new Date();
    const row = await this.repo.findValidById(sessionId, now);
    if (!row) return null;

    if (row.status === 'revoked') return null;

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
      status: row.status,
      maxRequestsPerMin: row.maxRequestsPerMin,
      onboardingStage: r.onboardingStage ?? null,
      userInfo: {
        name: r.firstName ?? '',
        lastName: r.lastName ?? '',
        email: row.email,
        company: row.company ?? '',
        website: row.website ?? '',
      },
    };
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
        'Demasiadas solicitudes. Intenta de nuevo en un minuto.',
      );
    }
    cleanupStaleRateLimitEntries();
  }
}
