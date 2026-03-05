import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { OnboardingSessionService } from './onboarding-session.service';
import {
  OnboardingSessionGuard,
  getOnboardingSessionFromRequest,
  ONBOARDING_SESSION_COOKIE,
} from './onboarding-session.guard';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { ValidateSessionDto } from './dto/validate-session.dto';
import { SubmitStep1Dto } from './dto/submit-step1.dto';
import { PlanApprovedDto } from './dto/plan-approved.dto';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import {
  HubSpotService,
  isStageBeyondDiscovery,
} from '../hubspot/hubspot.service';
import { formatNotePlanApproved } from '../hubspot/hubspot-note-format';
import { ConversationRepository } from './conversation.repository';

/** Expiración unificada: sesión e invitación. */
const SESSION_EXPIRES_DAYS = 3;
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * SESSION_EXPIRES_DAYS;

@Controller('onboarding')
export class OnboardingSessionController {
  constructor(
    private readonly sessionService: OnboardingSessionService,
    private readonly guard: OnboardingSessionGuard,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly hubSpotService: HubSpotService,
    private readonly conversationRepo: ConversationRepository,
  ) {}

  /**
   * Step-1 form submit (public): creates invitation, sends magic link by email.
   * Does not require a session.
   * Rate limited: 5 requests per minute per IP.
   */
  @Post('step-1/submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async submitStep1(@Body() dto: SubmitStep1Dto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress;
    const expiresInDays =
      this.config.get<number>('INVITATION_EXPIRES_DAYS') ??
      SESSION_EXPIRES_DAYS;
    const result = await this.sessionService.createInvitation({
      email: dto.email,
      firstName: dto.name,
      lastName: dto.lastName,
      company: dto.company,
      website: dto.website || undefined,
      ipCreated: ip,
      expiresInDays,
    });
    await this.mailService.sendMagicLink(
      dto.email,
      result.magicLink,
      expiresInDays,
    );
    await this.hubSpotService.createOrUpdateContact({
      email: dto.email,
      firstname: dto.name,
      lastname: dto.lastName,
      company: dto.company,
      website: dto.website,
      onboarding_stage: 'form_sent',
    });
    return {
      message: 'Check your email to continue. We sent you an access link.',
    };
  }

  /**
   * Creates an invitation and returns the magic link.
   * In production, protect with API key or admin auth.
   */
  @Post('invitations')
  async createInvitation(
    @Body() dto: CreateInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.sessionService.createInvitation({
      email: dto.email,
      expiresInDays: dto.expiresInDays,
      maxRequestsPerMin: dto.maxRequestsPerMin,
    });
    return {
      sessionId: result.sessionId,
      magicLink: result.magicLink,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  /**
   * Validates the magic link token, sets the session cookie, and returns session data.
   */
  @Post('session/validate')
  @HttpCode(HttpStatus.OK)
  async validateSession(
    @Body() dto: ValidateSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (res.req?.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      res.req?.socket?.remoteAddress;
    const session = await this.sessionService.validateToken({
      token: dto.token,
      ipLastUsed: ip,
    });

    const cookieValue = this.guard.getSignedCookieValue(session.sessionId);
    const isProd = process.env.NODE_ENV === 'production';
    
    // Configuración de cookie para producción
    // Si COOKIE_DOMAIN está configurado, úsalo (ej: '.example.com' para subdominios)
    // Si frontend y backend están en dominios diferentes, SameSite debe ser 'none' con Secure: true
    const cookieDomain = this.config.get<string>('COOKIE_DOMAIN');
    
    // Determinar SameSite basado en si están en el mismo dominio
    let sameSite: 'lax' | 'none' | 'strict' = 'lax';
    if (isProd && cookieDomain) {
      // Si hay un dominio compartido, usar 'lax' está bien
      sameSite = 'lax';
    } else if (isProd) {
      // Si no hay dominio compartido, necesitamos 'none' para cross-domain
      // Pero 'none' requiere Secure: true y HTTPS
      sameSite = 'none';
    }
    
    const cookieOptions: any = {
      httpOnly: true,
      secure: isProd, // En producción siempre true para HTTPS
      sameSite,
      maxAge: COOKIE_MAX_AGE_SEC * 1000,
      path: '/',
    };
    
    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
    }

    res.cookie(ONBOARDING_SESSION_COOKIE, cookieValue, cookieOptions);

    await this.hubSpotService.updateContactProperties(session.email, {
      ...(isStageBeyondDiscovery(session.onboardingStage)
        ? {}
        : { onboarding_stage: 'magic_link_used' }),
      last_onboarding_activity_at: new Date().toISOString(),
    });

    return {
      ok: true,
      sessionId: session.sessionId,
      email: session.email,
      status: session.status,
      userInfo: session.userInfo,
      onboardingStage: session.onboardingStage ?? undefined,
    };
  }

  /**
   * El usuario aprobó el plan en el chat. Actualiza HubSpot: etapa plan_approved,
   * resumen del discovery (objectives), hubs elegidos. Requiere sesión.
   */
  @Post('plan-approved')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OnboardingSessionGuard)
  async planApproved(@Body() dto: PlanApprovedDto, @Req() req: Request) {
    const session = getOnboardingSessionFromRequest(req);
    const { plan, conversationId, answersCollected, discoveryPercentage, messages } =
      dto;
    // Usar flags directos del plan (de parseActiveHubs) o fallback a inferir desde modules
    const hubSales =
      plan.hub_sales ??
      plan.modules?.some((m) => /sales/i.test(m.name)) ??
      false;
    const hubMarketing =
      plan.hub_marketing ??
      plan.modules?.some((m) => /marketing/i.test(m.name)) ??
      false;
    const hubService =
      plan.hub_services ??
      plan.modules?.some((m) => /service/i.test(m.name)) ??
      false;
    const discoverySummary =
      Array.isArray(plan.objectives) && plan.objectives.length > 0
        ? plan.objectives.join('\n').slice(0, 32000)
        : '';
    const hubs = [
      hubSales && 'Sales',
      hubMarketing && 'Marketing',
      hubService && 'Service',
    ]
      .filter(Boolean)
      .join(', ');
    const hubTypes = [
      hubSales && 'Sales Hub',
      hubMarketing && 'Marketing Hub',
      hubService && 'Service Hub',
    ]
      .filter(Boolean)
      .join(', ');
    const conv = conversationId
      ? await this.conversationRepo.findByIdAndSession(
          conversationId,
          session.id,
        )
      : null;
    const conversationTitle = conv?.title ?? 'Conversation';
    const hubspotNoteId = (conv as { hubspotNoteId?: string | null } | null)
      ?.hubspotNoteId;

    await this.sessionService.updateOnboardingStage(
      session.id,
      'plan_approved',
    );
    await this.hubSpotService.updateContactProperties(session.email, {
      onboarding_stage: 'plan_approved',
      last_onboarding_activity_at: new Date().toISOString(),
      hub_sales: hubSales,
      hub_marketing: hubMarketing,
      hub_services: hubService,
      ...(discoverySummary ? { discovery_summary: discoverySummary } : {}),
    });
    const modulesCount = plan.modules?.length ?? 0;
    const recsCount = plan.recommendations?.length ?? 0;
    const noteBody = formatNotePlanApproved({
      conversationTitle,
      website: session.userInfo?.website?.trim() || undefined,
      hubs,
      hubTypes: hubTypes || undefined,
      timeline: plan.timeline ?? undefined,
      modulesCount,
      recommendationsCount: recsCount,
      discoverySummary: discoverySummary || undefined,
      answersCollected:
        answersCollected && Object.keys(answersCollected).length > 0
          ? answersCollected
          : undefined,
      discoveryPercentage,
      messages:
        messages && messages.length > 0
          ? messages.map((m) => ({ role: m.role, content: m.content }))
          : undefined,
    });
    if (conversationId) {
      await this.conversationRepo.updateDiscoveryData(conversationId, {
        answersCollected:
          answersCollected && Object.keys(answersCollected).length > 0
            ? answersCollected
            : undefined,
        discoveryPercentage: discoveryPercentage,
        hubs: hubTypes || undefined,
      });
      await this.conversationRepo.updatePlanSnapshot(conversationId, {
        company: plan.company,
        objectives: plan.objectives,
        modules: plan.modules,
        timeline: plan.timeline,
        recommendations: plan.recommendations,
        hub_sales: hubSales,
        hub_marketing: hubMarketing,
        hub_services: hubService,
      });
    }
    if (hubspotNoteId) {
      await this.hubSpotService.updateNote(hubspotNoteId, noteBody);
    } else {
      const noteId = await this.hubSpotService.createNote(
        session.email,
        noteBody,
      );
      if (noteId && conversationId) {
        await this.conversationRepo.updateHubspotNoteId(
          conversationId,
          noteId,
        );
      }
    }
    return { ok: true };
  }

  /**
   * Cierra la sesión borrando la cookie. No requiere sesión activa.
   * La sesión en DB sigue válida; el usuario puede volver con el magic link.
   */
  @Post('session/logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ONBOARDING_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  /**
   * Session health check: requires a valid cookie.
   * Includes onboarding_stage from DB (fuente de verdad) para step guards.
   */
  @Get('session/me')
  @UseGuards(OnboardingSessionGuard)
  me(@Res({ passthrough: true }) res: Response) {
    const session = (res.req as any).onboardingSession;
    return {
      sessionId: session.id,
      email: session.email,
      status: session.status,
      userInfo: session.userInfo,
      onboardingStage: session.onboardingStage ?? undefined,
    };
  }
}
