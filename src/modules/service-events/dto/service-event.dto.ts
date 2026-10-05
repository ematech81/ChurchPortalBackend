import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ServiceItemDto {
  @ApiProperty() @IsString() @MaxLength(150) name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) day?: string;
  @ApiProperty() @IsString() @MaxLength(40) time: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) endTime?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) location?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) format?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) kind?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(60) eventType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) eventDate?: string;
}

export class CreateServiceEventsDto {
  @ApiProperty({ type: [ServiceItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ServiceItemDto)
  services: ServiceItemDto[];
}
