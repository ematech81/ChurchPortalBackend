import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChurchDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  denomination?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  parentChurchId?: string;
}
