import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPinDto {
  @ApiProperty({ description: 'Account password (Senior Pastor) or OTP code (Branch Pastor)' })
  @IsString()
  credential: string;

  @ApiProperty({ example: '1234' })
  @IsString()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits.' })
  @Matches(/^\d{4}$/, { message: 'PIN must contain only digits.' })
  newPin: string;

  @ApiProperty({ example: '1234' })
  @IsString()
  @Length(4, 4, { message: 'Confirm PIN must be exactly 4 digits.' })
  @Matches(/^\d{4}$/, { message: 'Confirm PIN must contain only digits.' })
  confirmPin: string;
}
