import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { FIELD_TYPES } from '../event-form.entity';

export class FormFieldDto {
  @ApiProperty({ required: false, description: 'Keep the existing id when editing so earlier answers stay attached' })
  @IsOptional() @IsString() @MaxLength(40) id?: string;

  @ApiProperty({ enum: FIELD_TYPES }) @IsIn(FIELD_TYPES as unknown as string[]) type: (typeof FIELD_TYPES)[number];
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) label: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() required?: boolean;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(100, { each: true })
  options?: string[];

  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) helpText?: string;
}

export class CreateEventFormDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150) title: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(3000) description?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() startsAt?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(250) venue?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() registrationClosesAt?: string | null;
  @ApiProperty({ required: false, description: 'Maximum registrations; omit for unlimited' })
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) capacity?: number | null;
  @ApiProperty({ required: false, default: true }) @IsOptional() @IsBoolean() uniquePhone?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(1000) confirmationMessage?: string | null;

  @ApiProperty({ type: [FormFieldDto] })
  @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => FormFieldDto)
  fields: FormFieldDto[];
}

export class UpdateEventFormDto extends PartialType(CreateEventFormDto) {
  @ApiProperty({ required: false, description: 'Manually open/close registration' })
  @IsOptional() @IsBoolean() isOpen?: boolean;
}

export class EventRegistrationExportDto {
  @ApiProperty({ enum: ['xlsx', 'csv'] }) @IsIn(['xlsx', 'csv']) format: 'xlsx' | 'csv';
}

/** What the public registration page posts. */
export class PublicRegisterDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @ApiProperty() @IsString() @MaxLength(30) phone: string;
  @ApiProperty({ required: false }) @IsOptional() @IsObject() answers?: Record<string, unknown>;

  /** Honeypot: hidden from people, filled in by bots. A non-empty value silently discards the submission. */
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) website?: string;
}
