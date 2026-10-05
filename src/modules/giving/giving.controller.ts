import { Controller, Get, Post, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GivingService } from './giving.service';
import { CreateGivingDto, SummaryQueryDto } from './dto/giving.dto';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { FINANCE_ROLES } from '../../constants/role-groups';

// Giving data is confidential: finance officers and pastors only.
@ApiTags('Giving')
@ApiBearerAuth()
@Roles(...FINANCE_ROLES)
@Controller('giving')
export class GivingController {
  constructor(private readonly givingService: GivingService) {}

  @Get()
  findAll(@ChurchId() churchId: string, @Query('limit') limit?: string) {
    return this.givingService.findAll(churchId, limit ? parseInt(limit, 10) : undefined);
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
  getSummary(@ChurchId() churchId: string, @Query() q: SummaryQueryDto) {
    return this.givingService.getSummary(churchId, new Date(q.from), new Date(q.to));
  }

  @Get('members/:memberId')
  findByMember(@Param('memberId', ParseUUIDPipe) memberId: string, @ChurchId() churchId: string) {
    return this.givingService.findByMember(churchId, memberId);
  }

  @Post()
  create(
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateGivingDto,
  ) {
    return this.givingService.create(churchId, user.id, dto);
  }
}
