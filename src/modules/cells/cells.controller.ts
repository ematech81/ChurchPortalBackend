import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CellsService } from './cells.service';
import { CellGroup } from './cell-group.entity';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { pick } from '../../common/utils/pick';
import { ADMIN_ROLES, STAFF_ROLES } from '../../constants/role-groups';

@ApiTags('Cells')
@ApiBearerAuth()
@Controller('cells')
export class CellsController {
  constructor(private readonly cellsService: CellsService) {}

  @Get()
  @Roles(...STAFF_ROLES)
  findAll(@ChurchId() churchId: string) {
    return this.cellsService.findAll(churchId);
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  create(@ChurchId() churchId: string, @Body() body: Record<string, unknown>) {
    return this.cellsService.create(
      churchId,
      pick<CellGroup>(body, ['name', 'leaderId', 'meetingDay', 'meetingTime', 'location', 'parentCellId']),
    );
  }
}
