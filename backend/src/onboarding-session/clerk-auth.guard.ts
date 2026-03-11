import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { Request } from 'express';

export interface ClerkAuthPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private clerk: ReturnType<typeof createClerkClient>;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    this.clerk = createClerkClient({ secretKey: secretKey ?? '' });
  }

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
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    try {
      const result = await verifyToken(token, {
        secretKey: secretKey ?? undefined,
        authorizedParties: [frontendUrl.replace(/\/$/, '')],
      });

      const data = (result as { data?: { sub?: string } }).data ?? result;
      const userId = data?.sub;

      if (!userId) {
        throw new UnauthorizedException('Token inválido');
      }

      const user = await this.clerk.users.getUser(userId);
      const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
      const email = primaryEmail?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? '';

      (req as any).clerkAuth = {
        userId,
        email,
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
      } as ClerkAuthPayload;

      return true;
    } catch {
      throw new UnauthorizedException('Token de Clerk inválido o expirado');
    }
  }
}

export function getClerkAuthFromRequest(req: Request): ClerkAuthPayload {
  const auth = (req as any).clerkAuth;
  if (!auth) {
    throw new UnauthorizedException('Autenticación Clerk requerida');
  }
  return auth;
}
