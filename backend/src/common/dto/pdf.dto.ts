import { IsArray, IsBoolean, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ImplementationPlan, UserInfo } from '../types/onboarding.types';

export class ModuleDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  priority: 'high' | 'medium' | 'low';
}

export class ImplementationPlanDto implements ImplementationPlan {
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
}

export class UserInfoDto implements UserInfo {
  @IsString()
  name: string;

  @IsString()
  lastName: string;

  @IsString()
  email: string;

  @IsString()
  company: string;

  @IsString()
  website: string;

  @IsBoolean()
  terms: boolean;
}

export class GeneratePdfRequestDto {
  @ValidateNested()
  @Type(() => ImplementationPlanDto)
  plan: ImplementationPlanDto;

  @ValidateNested()
  @Type(() => UserInfoDto)
  userInfo: UserInfoDto;

  /** Full plan text as shown in chat (Markdown). If provided, PDF "The Implementation Plan" section uses this so it matches the chat. */
  @IsOptional()
  @IsString()
  fullPlanText?: string;
}
