import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { GroupStatus } from '../ministry-group.entity';

export class CreateCategoryDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) iconKey?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(60) defaultLeaderTitle?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(60) defaultMemberTitle?: string;
}

export class InitialMemberDto {
  @ApiProperty() @IsUUID() memberId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(60) roleTitle?: string;
}

export class CreateGroupDto {
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiProperty() @IsString() @MaxLength(150) name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() leaderId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(60) leaderRoleTitle?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() branchId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) cadence?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) meetingDay?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(40) meetingTime?: string | null;
  @ApiProperty({ required: false, enum: GroupStatus }) @IsOptional() @IsEnum(GroupStatus) status?: GroupStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) coverImageUrl?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isDraft?: boolean;

  @ApiProperty({ required: false, type: [InitialMemberDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InitialMemberDto)
  initialMemberIds?: InitialMemberDto[];
}

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}

export class AddGroupMemberDto {
  @ApiProperty() @IsUUID() memberId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(60) roleTitle?: string;
}

export class RecordGroupAttendanceDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsInt() @Min(0) @Max(100000) presentCount: number;
  @ApiProperty() @IsInt() @Min(0) @Max(100000) totalCount: number;
}

export class AddToWorkforceDto {
  @ApiProperty() @IsUUID() memberId: string;
  @ApiProperty({ required: false, example: 'Volunteer' }) @IsOptional() @IsString() @MaxLength(60) roleTitle?: string;
}
