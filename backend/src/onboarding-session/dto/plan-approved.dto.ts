import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ModuleDto } from '../../common/dto/pdf.dto';

export class PlanApprovedBodyDto {
  @IsString()
  company: string;

  @IsArray()
  @IsString({ each: true })
  objectives: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuleDto)
  modules: ModuleDto[];

  @IsString()
  timeline: string;

  @IsArray()
  @IsString({ each: true })
  recommendations: string[];

  /** Hubs activos (de parseActiveHubs). Usado para HubSpot. */
  @IsOptional()
  @IsBoolean()
  hub_sales?: boolean;

  @IsOptional()
  @IsBoolean()
  hub_marketing?: boolean;

  @IsOptional()
  @IsBoolean()
  hub_services?: boolean;
}

export class PlanApprovedDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PlanApprovedBodyDto)
  plan: PlanApprovedBodyDto;

  /** ID of the conversation where the plan was approved (for HubSpot Note). */
  @IsOptional()
  @IsString()
  conversationId?: string;

  /** Answers collected during discovery (for HubSpot Note). */
  @IsOptional()
  @IsObject()
  answersCollected?: Record<string, string>;

  /** Discovery progress percentage at approval time (0-100). */
  @IsOptional()
  @IsNumber()
  discoveryPercentage?: number;

  /** Conversation messages for the HubSpot note. */
  @IsOptional()
  @IsArray()
  messages?: Array<{ role: string; content: string }>;
}
