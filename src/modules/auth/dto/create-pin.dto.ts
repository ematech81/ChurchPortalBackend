import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePinDto {
  @ApiProperty({ example: '1234' })
  @IsString()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits.' })
  @Matches(/^\d{4}$/, { message: 'PIN must contain only digits.' })
  pin: string;

  @ApiProperty({ example: '1234' })
  @IsString()
  @Length(4, 4, { message: 'Confirm PIN must be exactly 4 digits.' })
  @Matches(/^\d{4}$/, { message: 'Confirm PIN must contain only digits.' })
  confirmPin: string;
}
