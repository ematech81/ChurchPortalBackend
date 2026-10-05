import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** The ONLY fields a user may change about themselves. Role, church, verification, tokens etc. are server-controlled. */
export class UpdateMeDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(80) lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^\+?[\d\s\-()]{7,20}$/, { message: 'Enter a valid phone number.' })
  phone?: string;

  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) avatarUrl?: string;
}
