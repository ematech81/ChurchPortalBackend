import { IsDateString, IsEnum, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VisitStatus } from '../visit.entity';

export class CreateVisitDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsDateString() scheduledAt: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() memberId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsLatitude() latitude?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsLongitude() longitude?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) context?: string;
}

export class UpdateVisitDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() scheduledAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) address?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) context?: string;
  @ApiProperty({ required: false, enum: VisitStatus }) @IsOptional() @IsEnum(VisitStatus) status?: VisitStatus;
}
