import {
  Controller, Get, Post, Delete, Body, Param, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { CreateEventDto, CheckInDto } from './dto/attendance.dto';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ADMIN_ROLES, ATTENDANCE_ROLES } from '../../constants/role-groups';

@ApiTags('Attendance')
@ApiBearerAuth()
@Roles(...ATTENDANCE_ROLES)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ── Events ──────────────────────────────────────────────────────────────────

  @Get('events')
  getEvents(@ChurchId() churchId: string) {
    return this.attendanceService.getEvents(churchId);
  }

  @Post('events')
  @Roles(...ADMIN_ROLES)
  createEvent(@ChurchId() churchId: string, @Body() dto: CreateEventDto) {
    return this.attendanceService.createEvent(churchId, dto);
  }

  @Delete('events/:eventId')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEvent(@Param('eventId', ParseUUIDPipe) eventId: string, @ChurchId() churchId: string) {
    return this.attendanceService.deleteEvent(churchId, eventId);
  }

  // ── Attendance records ──────────────────────────────────────────────────────

  @Get('events/:eventId/records')
  getAttendance(@Param('eventId', ParseUUIDPipe) eventId: string, @ChurchId() churchId: string) {
    return this.attendanceService.getAttendanceForEvent(churchId, eventId);
  }

  @Post('events/:eventId/check-in')
  checkIn(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CheckInDto,
  ) {
    if (dto.visitorName) {
      return this.attendanceService.checkInVisitor(churchId, eventId, dto.visitorName.trim(), user.id);
    }
    return this.attendanceService.checkIn(churchId, eventId, dto.memberId!, user.id);
  }

  @Delete('events/:eventId/records/:recordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  uncheckIn(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @ChurchId() churchId: string,
  ) {
    return this.attendanceService.uncheckIn(churchId, eventId, recordId);
  }

  @Get('events/:eventId/check-in/:memberId')
  isCheckedIn(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @ChurchId() churchId: string,
  ) {
    return this.attendanceService.isCheckedIn(churchId, eventId, memberId);
  }

  @Get('events/:eventId/report')
  getReport(@Param('eventId', ParseUUIDPipe) eventId: string, @ChurchId() churchId: string) {
    return this.attendanceService.getEventReport(churchId, eventId);
  }
}
