import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HouseholdsService } from './households.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';

@ApiTags('Households')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('households')
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Get()
  findAll(@ChurchId() churchId: string) {
    return this.householdsService.findAll(churchId);
  }

  @Post()
  create(@ChurchId() churchId: string, @Body() body: Record<string, unknown>) {
    return this.householdsService.create(churchId, body as never);
  }
}
