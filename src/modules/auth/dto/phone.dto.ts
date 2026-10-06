import { IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

const PHONE_RE = /^\+?[\d\s\-()]{7,20}$/;

export class PhoneDto {
  @ApiProperty({ example: '+2348031234567' })
  @IsString()
  @Matches(PHONE_RE, { message: 'Enter a valid phone number.' })
  phone: string;
}

export class VerifyPhoneOtpDto extends PhoneDto {
  @ApiProperty({ example: 'X4K9M2', description: '6 letters/digits, case-insensitive' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(6, 6)
  @Matches(/^[A-Z0-9]{6}$/, { message: 'Code must be 6 letters or digits.' })
  code: string;
}
