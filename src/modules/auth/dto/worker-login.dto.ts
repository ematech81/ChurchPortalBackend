import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WorkerLoginDto {
  @ApiProperty({ example: 'emma-k7p2m9xq' })
  @IsString()
  @Length(4, 64)
  code: string;
}
