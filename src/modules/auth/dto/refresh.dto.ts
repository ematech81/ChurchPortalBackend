import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  /** Ignored by the server (the user id comes from the verified token); kept so older app builds still validate. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  refreshToken: string;
}
