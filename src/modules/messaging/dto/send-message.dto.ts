import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
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
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  memberIds: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}
