import { Module } from '@nestjs/common';
import { HubSpotService } from './hubspot.service';

@Module({
  providers: [HubSpotService],
  exports: [HubSpotService],
})
export class HubSpotModule {}
