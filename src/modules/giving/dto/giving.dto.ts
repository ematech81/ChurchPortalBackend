import {
  IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { GivingFund } from '../giving-record.entity';

export class CreateGivingDto {
  @ApiProperty({ enum: GivingFund }) @IsEnum(GivingFund) fund: GivingFund;

  @ApiProperty({ description: 'Amount in NGN, max 2 decimal places' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000_000)
  amount: number;

  @ApiProperty({ required: false }) @IsOptional() @IsUUID() memberId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() date?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isAnonymous?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) reference?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class SummaryQueryDto {
  @ApiProperty() @IsDateString() from: string;
  @ApiProperty() @IsDateString() to: string;
}
