import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MemberStatus } from '@/types';

export const EXPORT_STATUSES = [...Object.values(MemberStatus), 'all'] as string[];

export class MemberExportDto {
  @ApiProperty({ required: false, description: "Member statuses to include; 'all' (default) = everyone except deceased/transferred", example: ['worker', 'first_timer'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(EXPORT_STATUSES, { each: true })
  statuses?: string[];

  @ApiProperty({ required: false, description: 'Only members currently flagged for follow-up' })
  @IsOptional()
  @IsBoolean()
  flaggedOnly?: boolean;

  @ApiProperty({ required: false, description: 'Only members marked as youth' })
  @IsOptional()
  @IsBoolean()
  youthOnly?: boolean;

  @ApiProperty({ required: false, description: 'Only members of this department/group' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiProperty({
    required: false,
    description: "Senior Pastor only: 'all' = every branch, or a branch id. Omitted = own church.",
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.branchId !== 'all')
  @IsUUID()
  branchId?: string;

  @ApiProperty({ enum: ['numbers', 'name_number', 'full'] })
  @IsIn(['numbers', 'name_number', 'full'])
  detail: 'numbers' | 'name_number' | 'full';

  @ApiProperty({ enum: ['xlsx', 'csv', 'vcf', 'txt'] })
  @IsIn(['xlsx', 'csv', 'vcf', 'txt'])
  format: 'xlsx' | 'csv' | 'vcf' | 'txt';
}

/** Same filters, no output options — used to preview "how many people?" before exporting. */
export class MemberExportCountDto {
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsIn(EXPORT_STATUSES, { each: true }) statuses?: string[];
  @IsOptional() @IsBoolean() flaggedOnly?: boolean;
  @IsOptional() @IsBoolean() youthOnly?: boolean;
  @IsOptional() @IsUUID() groupId?: string;
  @IsOptional() @IsString() @ValidateIf((o) => o.branchId !== 'all') @IsUUID() branchId?: string;
}
