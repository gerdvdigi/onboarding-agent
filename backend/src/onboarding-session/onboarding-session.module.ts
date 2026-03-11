import { Module } from '@nestjs/common';
import { OnboardingSessionController } from './onboarding-session.controller';
import { ConversationsController } from './conversations.controller';
import { OnboardingSessionService } from './onboarding-session.service';
import { OnboardingSessionRepository } from './onboarding-session.repository';
import { ConversationRepository } from './conversation.repository';
import { ClerkSessionGuard } from './clerk-session.guard';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { HubSpotModule } from '../hubspot/hubspot.module';

@Module({
  imports: [HubSpotModule],
  controllers: [OnboardingSessionController, ConversationsController],
  providers: [
    OnboardingSessionRepository,
    ConversationRepository,
    OnboardingSessionService,
    ClerkSessionGuard,
    ClerkAuthGuard,
  ],
  exports: [
    OnboardingSessionService,
    ClerkSessionGuard,
    ConversationRepository,
  ],
})
export class OnboardingSessionModule {}
