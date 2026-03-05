import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ValidateSessionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(16, { message: 'Token inválido' })
  token: string;
}
