import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserInfo } from '../types/onboarding.types';

export class MessageDto {
  @IsString()
  role: string;

  @IsString()
  content: string;
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

export class ChatRequestDto {
  @IsArray()
  @Type(() => MessageDto)
  messages: MessageDto[];

  @ValidateNested()
  @Type(() => UserInfoDto)
  userInfo: UserInfoDto;

  @IsObject()
  @IsOptional()
  context?: Record<string, any>;
}
