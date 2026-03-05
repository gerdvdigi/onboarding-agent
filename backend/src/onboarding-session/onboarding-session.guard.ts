import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { OnboardingSessionService } from './onboarding-session.service';

export const ONBOARDING_SESSION_COOKIE = 'onboarding_session';

@Injectable()
export class OnboardingSessionGuard implements CanActivate {
  constructor(
    private readonly sessionService: OnboardingSessionService,
    private readonly config: ConfigService,
  ) {}

  private getSecret(): string {
    const secret = this.config.get<string>('ONBOARDING_SESSION_SECRET');
    if (!secret || secret.length < 16) {
      throw new Error(
        'ONBOARDING_SESSION_SECRET must be set and at least 16 characters',
      );
    }
    return secret;
  }

  private sign(sessionId: string): string {
    const secret = this.getSecret();
    const sig = createHmac('sha256', secret)
      .update(sessionId, 'utf8')
      .digest('hex');
    return `${sessionId}.${sig}`;
  }

  private verify(cookieValue: string): string | null {
    const i = cookieValue.lastIndexOf('.');
    if (i <= 0) return null;
    const sessionId = cookieValue.slice(0, i);
    const sig = cookieValue.slice(i + 1);
    const expected = createHmac('sha256', this.getSecret())
      .update(sessionId, 'utf8')
      .digest('hex');
    try {
      if (
        sig.length !== expected.length ||
        !timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
      ) {
        return null;
      }
    } catch {
      return null;
    }
    return sessionId;
  }

  getSignedCookieValue(sessionId: string): string {
    return this.sign(sessionId);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    
    // Intentar obtener la cookie primero
    let cookieValue = req.cookies?.[ONBOARDING_SESSION_COOKIE];
    
    // Si no hay cookie, intentar desde header (fallback para cross-domain)
    if (!cookieValue) {
      cookieValue = req.headers['x-onboarding-session'] as string;
    }
    
    // Si aún no hay cookie, intentar desde header con sessionId directo (último fallback)
    // Esto permite que el frontend envíe el sessionId directamente cuando las cookies no funcionan
    let sessionId: string | null = null;
    
    if (cookieValue) {
      // Si tenemos cookieValue, verificar la firma
      sessionId = this.verify(cookieValue);
      if (!sessionId) {
        throw new UnauthorizedException('Sesión inválida o expirada');
      }
    } else {
      // Si no hay cookie, intentar obtener sessionId directamente del header
      const sessionIdHeader = req.headers['x-onboarding-session-id'] as string;
      if (sessionIdHeader) {
        sessionId = sessionIdHeader;
      }
    }

    if (!sessionId) {
      throw new UnauthorizedException('Sesión de onboarding requerida');
    }

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress;
    const session = await this.sessionService.getValidSession(sessionId, ip);
    if (!session) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    this.sessionService.checkRateLimit(sessionId, session.maxRequestsPerMin);

    (req as any).onboardingSession = session;
    return true;
  }
}

export function getOnboardingSessionFromRequest(req: Request): {
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
} {
  const s = (req as any).onboardingSession;
  if (!s) {
    throw new UnauthorizedException('Sesión de onboarding requerida');
  }
  return s;
}
