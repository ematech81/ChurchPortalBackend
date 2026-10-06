import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FollowUpFlagDto {
  @ApiProperty({ description: 'true = flag for follow-up, false = remove the flag' })
  @IsBoolean()
  flag: boolean;

  @ApiProperty({ required: false, example: 'Backsliding' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
