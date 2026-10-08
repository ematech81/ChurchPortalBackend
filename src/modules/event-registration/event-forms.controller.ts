import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EventFormsService } from './event-forms.service';
import { CreateEventFormDto, EventRegistrationExportDto, UpdateEventFormDto } from './dto/event-form.dto';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ADMIN_ROLES } from '../../constants/role-groups';
import { MembersService } from '../members/members.service';

/**
 * Pastors manage event registration here. A Senior Pastor sees events from every branch;
 * a Branch Pastor only their own.
 */
@ApiTags('Event registration')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
@Controller('event-forms')
export class EventFormsController {
  constructor(
    private readonly service: EventFormsService,
    private readonly membersService: MembersService,
  ) {}

  private scope(churchId: string, role: string) {
    return this.membersService.resolveScope(churchId, role, true);
  }

  @Post()
  create(@ChurchId() churchId: string, @CurrentUser() user: { id: string }, @Body() dto: CreateEventFormDto) {
    return this.service.create(churchId, user.id, dto);
  }

  @Get()
  async list(
    @ChurchId() churchId: string,
    @CurrentUser() user: { role: string },
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(await this.scope(churchId, user.role), search, limit ? parseInt(limit, 10) : undefined);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @ChurchId() churchId: string, @CurrentUser() user: { role: string }) {
    return this.service.get(id, await this.scope(churchId, user.role));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { role: string },
    @Body() dto: UpdateEventFormDto,
  ) {
    return this.service.update(id, await this.scope(churchId, user.role), dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @ChurchId() churchId: string, @CurrentUser() user: { role: string }) {
    await this.service.remove(id, await this.scope(churchId, user.role));
  }

  @Get(':id/registrations')
  async registrations(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { role: string },
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.registrations(
      id,
      await this.scope(churchId, user.role),
      search,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Delete(':id/registrations/:regId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('regId', ParseUUIDPipe) regId: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { role: string },
  ) {
    await this.service.deleteRegistration(id, regId, await this.scope(churchId, user.role));
  }

  /** Excel / CSV download of every registration (returned as base64 for the app to save and share). */
  @Post(':id/export')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: EventRegistrationExportDto,
  ) {
    return this.service.export(id, await this.scope(churchId, user.role), churchId, user.id, dto.format);
  }
}
