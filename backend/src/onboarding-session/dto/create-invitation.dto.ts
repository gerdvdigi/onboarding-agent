import { IsEmail, IsInt, IsOptional, Min, Max } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number = 3;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  maxRequestsPerMin?: number = 60;
}
