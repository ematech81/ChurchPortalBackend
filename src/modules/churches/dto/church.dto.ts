import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateChurchDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(150) name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(250) address?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) city?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) state?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) country?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) denomination?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(250) website?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
}

export class CreateBranchDto {
  @ApiProperty() @IsString() @MaxLength(150) name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(250) address?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) city?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class UpdateBranchDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(150) name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(250) address?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) city?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class AssignPastorDto {
  @ApiProperty() @IsUUID() branchId: string;
}

export class PromoteMemberDto {
  @ApiProperty() @IsUUID() memberId: string;
  @ApiProperty() @IsUUID() branchId: string;
}
