import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Creates the caller's own (headquarters) church during onboarding.
 * Branches are created via POST /churches/branch; a client can never choose
 * a parent church here, so nobody can attach themselves to someone else's tree.
 */
export class CreateChurchDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  denomination?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(250)
  address?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  logoUrl?: string;
}
