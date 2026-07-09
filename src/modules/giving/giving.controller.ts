import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GivingService } from './giving.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Giving')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('giving')
export class GivingController {
  constructor(private readonly givingService: GivingService) {}

  @Get()
  findAll(@ChurchId() churchId: string, @Query('limit') limit?: string) {
    return this.givingService.findAll(churchId, limit ? parseInt(limit, 10) : 100);
  }

  @Get('summary/month')
  getMonthSummary(@ChurchId() churchId: string) {
    return this.givingService.getMonthSummary(churchId);
  }

  @Get('summary/today')
  getTodayTotal(@ChurchId() churchId: string) {
    return this.givingService.getTodayTotal(churchId);
  }

  @Get('summary')
  getSummary(
    @ChurchId() churchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.givingService.getSummary(churchId, new Date(from), new Date(to));
  }

  @Get('members/:memberId')
  findByMember(@Param('memberId') memberId: string, @ChurchId() churchId: string) {
    return this.givingService.findByMember(churchId, memberId);
  }

  @Post()
  create(
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string },
    @Body() body: Record<string, unknown>,
  ) {
    return this.givingService.create(churchId, user.id, body as never);
  }
}
