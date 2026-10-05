import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JourneyStatus } from '../follow-up-journey.entity';

export class StartJourneyDto {
  @ApiProperty() @IsUUID() memberId: string;
  @ApiProperty() @IsString() @MaxLength(60) decisionType: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() assignedWorkerId?: string;
}

export class AssignWorkerDto {
  @ApiProperty() @IsUUID() workerId: string;
}

export class UpdateJourneyStatusDto {
  @ApiProperty({ enum: JourneyStatus }) @IsEnum(JourneyStatus) status: JourneyStatus;
}

export class NotifyWorkerDto {
  @ApiProperty({ enum: ['whatsapp', 'sms', 'call'] })
  @IsEnum(['whatsapp', 'sms', 'call'])
  channel: 'whatsapp' | 'sms' | 'call';

  @ApiProperty({ required: false }) @IsOptional() @IsUUID() journeyId?: string;
}
