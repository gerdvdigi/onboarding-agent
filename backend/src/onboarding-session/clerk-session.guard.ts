import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import { Request } from 'express';
import { OnboardingSessionService } from './onboarding-session.service';

/**
 * Guard que verifica el token de Clerk y obtiene la sesión de onboarding por clerkUserId.
 * Reemplaza OnboardingSessionGuard: ya no usamos cookie ni X-Onboarding-Session-Id.
 */
@Injectable()
export class ClerkSessionGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly sessionService: OnboardingSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      throw new UnauthorizedException('Token de Clerk requerido');
    }

    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    try {
      const result = await verifyToken(token, {
        secretKey: secretKey ?? undefined,
        authorizedParties: [frontendUrl.replace(/\/$/, '')],
      });

      const data = (result as { data?: { sub?: string } }).data ?? result;
      const clerkUserId = data?.sub;

      if (!clerkUserId) {
        throw new UnauthorizedException('Token inválido');
      }

      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress;
      const session = await this.sessionService.getValidSessionByClerkUserId(
        clerkUserId,
        ip,
      );

      if (!session) {
        throw new UnauthorizedException(
          'Sesión de onboarding no encontrada. Completa el registro en /onboarding/sync',
        );
      }

      this.sessionService.checkRateLimit(session.id, session.maxRequestsPerMin);

      (req as any).onboardingSession = session;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Token de Clerk inválido o expirado');
    }
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
  return {
    ...s,
    status: '',
    onboardingStage: null,
    userInfo: {
      ...s.userInfo,
      company: '',
      website: '',
    },
  };
}
