import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { OnboardingSessionService } from './onboarding-session.service';
import {
  ClerkSessionGuard,
  getOnboardingSessionFromRequest,
} from './clerk-session.guard';
import { ClerkAuthGuard, getClerkAuthFromRequest } from './clerk-auth.guard';
import { PlanApprovedDto } from './dto/plan-approved.dto';
import { HubSpotService } from '../hubspot/hubspot.service';
import { formatNotePlanApproved } from '../hubspot/hubspot-note-format';
import { ConversationRepository } from './conversation.repository';

@Controller('onboarding')
export class OnboardingSessionController {
  constructor(
    private readonly sessionService: OnboardingSessionService,
    private readonly hubSpotService: HubSpotService,
    private readonly conversationRepo: ConversationRepository,
  ) {}

  /**
   * El usuario aprobó el plan en el chat. Actualiza HubSpot: etapa plan_approved,
   * resumen del discovery (objectives), hubs elegidos. Requiere sesión.
   */
  @Post('plan-approved')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClerkSessionGuard)
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

    await this.hubSpotService.updateContactProperties(session.email, {
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
   * Crea o recupera sesión de onboarding para usuario autenticado con Clerk.
   * Requiere Authorization: Bearer <clerk_session_token>.
   * El frontend debe enviar el token obtenido con getToken() de Clerk.
   */
  @Post('session/from-clerk')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ClerkAuthGuard)
  async sessionFromClerk(@Req() req: Request) {
    const clerkAuth = getClerkAuthFromRequest(req);
    const result = await this.sessionService.createOrGetSessionForClerk({
      clerkUserId: clerkAuth.userId,
      email: clerkAuth.email,
      firstName: clerkAuth.firstName || null,
      lastName: clerkAuth.lastName || null,
    });

    await this.hubSpotService.createOrUpdateContact({
      email: clerkAuth.email,
      firstname: clerkAuth.firstName,
      lastname: clerkAuth.lastName,
    });

    return {
      ok: true,
      sessionId: result.sessionId,
      userInfo: result.userInfo,
    };
  }

  /**
   * Cierra la sesión. Con Clerk ya no usamos cookies; el logout real es de Clerk.
   */
  @Post('session/logout')
  @HttpCode(HttpStatus.OK)
  logout() {
    return { ok: true };
  }

  /**
   * Session health check: requiere Bearer token de Clerk.
   */
  @Get('session/me')
  @UseGuards(ClerkSessionGuard)
  me(@Req() req: Request) {
    const session = (req as any).onboardingSession;
    return {
      sessionId: session.id,
      email: session.email,
      userInfo: session.userInfo,
    };
  }
}
