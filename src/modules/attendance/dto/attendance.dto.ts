import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ServiceType } from '../service-event.entity';

export class CreateEventDto {
  @ApiProperty() @IsString() @MaxLength(150) title: string;
  @ApiProperty({ enum: ServiceType }) @IsEnum(ServiceType) type: ServiceType;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

/** Exactly one of memberId / visitorName. */
export class CheckInDto {
  @ApiProperty({ required: false })
  @ValidateIf((o) => !o.visitorName)
  @IsUUID()
  memberId?: string;

  @ApiProperty({ required: false })
  @ValidateIf((o) => !o.memberId)
  @IsString()
  @MaxLength(120)
  visitorName?: string;
}
