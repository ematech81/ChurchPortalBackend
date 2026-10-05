import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HouseholdsService } from './households.service';
import { Household } from './household.entity';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { pick } from '../../common/utils/pick';
import { MEMBER_WRITE_ROLES, STAFF_ROLES } from '../../constants/role-groups';

@ApiTags('Households')
@ApiBearerAuth()
@Controller('households')
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Get()
  @Roles(...STAFF_ROLES)
  findAll(@ChurchId() churchId: string) {
    return this.householdsService.findAll(churchId);
  }

  @Post()
  @Roles(...MEMBER_WRITE_ROLES)
  create(@ChurchId() churchId: string, @Body() body: Record<string, unknown>) {
    return this.householdsService.create(churchId, pick<Household>(body, ['name', 'headMemberId', 'address']));
  }
}
