import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FamiliesService } from './families.service';
import { Family } from './family.entity';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { pick } from '../../common/utils/pick';
import { ADMIN_ROLES, MEMBER_WRITE_ROLES, STAFF_ROLES } from '../../constants/role-groups';

const FAMILY_FIELDS = [
  'familyName', 'address', 'headName', 'headPhone', 'headOccupation',
  'spouseName', 'spousePhone', 'spouseOccupation', 'children', 'numberOfChildren',
] as const;

@ApiTags('Families')
@ApiBearerAuth()
@Controller('families')
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  @Get()
  @Roles(...STAFF_ROLES)
  findAll(@ChurchId() churchId: string) {
    return this.familiesService.findAll(churchId);
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string, @ChurchId() churchId: string) {
    return this.familiesService.findByIdOrFail(id, churchId);
  }

  @Post()
  @Roles(...MEMBER_WRITE_ROLES)
  create(
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string },
    @Body() body: Record<string, unknown>,
  ) {
    return this.familiesService.create(churchId, { ...pick<Family>(body, FAMILY_FIELDS), createdById: user.id });
  }

  @Patch(':id')
  @Roles(...MEMBER_WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.familiesService.update(id, churchId, pick<Family>(body, FAMILY_FIELDS));
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @ChurchId() churchId: string) {
    return this.familiesService.remove(id, churchId);
  }
}
