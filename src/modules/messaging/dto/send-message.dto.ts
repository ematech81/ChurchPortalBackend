import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: '+2348031234567' })
  @IsString()
  @Matches(/^\+?[\d\s\-()]{7,20}$/, { message: 'Enter a valid phone number.' })
  to: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  memberId?: string;
}

export class SendBulkDto {
  @ApiProperty({ type: [String], required: false, description: 'Explicit recipients. Omit to use the audience fields.' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  memberIds?: string[];

  @ApiProperty({ required: false, description: "Audience: a member status such as 'worker', or 'all'" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @ApiProperty({ required: false, description: 'Audience: only youth' })
  @IsOptional()
  @IsBoolean()
  youthOnly?: boolean;

  @ApiProperty({ required: false, description: 'Senior Pastor only: include every branch' })
  @IsOptional()
  @IsBoolean()
  wholeOrg?: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}
