import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsUUID } from 'class-validator';

export class YouthBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  memberIds: string[];

  @IsBoolean()
  isYouth: boolean;
}
