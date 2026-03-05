import {
  IsBoolean,
  IsEmail,
  IsString,
  IsUrl,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SubmitStep1Dto {
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  name: string;

  @IsString()
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2, { message: 'La empresa es obligatoria' })
  company: string;

  @ValidateIf((o) => o.website !== '' && o.website != null)
  @IsUrl()
  website?: string;

  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 'on' || value === 1)
      return true;
    if (value === false || value === 'false' || value === '' || value === 0)
      return false;
    return value;
  })
  @IsBoolean()
  terms: boolean;
}
