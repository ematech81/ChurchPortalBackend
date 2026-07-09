import { Controller, Get, Post, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ── Events ──────────────────────────────────────────────────────────────────

  @Get('events')
  getEvents(@ChurchId() churchId: string) {
    return this.attendanceService.getEvents(churchId);
  }

  @Post('events')
  createEvent(@ChurchId() churchId: string, @Body() body: Record<string, unknown>) {
    return this.attendanceService.createEvent(churchId, body as never);
  }

  @Delete('events/:eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEvent(@Param('eventId') eventId: string, @ChurchId() churchId: string) {
    return this.attendanceService.deleteEvent(churchId, eventId);
  }

  // ── Attendance records ──────────────────────────────────────────────────────

  @Get('events/:eventId/records')
  getAttendance(@Param('eventId') eventId: string, @ChurchId() churchId: string) {
    return this.attendanceService.getAttendanceForEvent(churchId, eventId);
  }

  @Post('events/:eventId/check-in')
  checkIn(
    @Param('eventId') eventId: string,
    @ChurchId() churchId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { memberId?: string; visitorName?: string },
  ) {
    if (body.visitorName) {
      return this.attendanceService.checkInVisitor(churchId, eventId, body.visitorName, user.id);
    }
    return this.attendanceService.checkIn(churchId, eventId, body.memberId!, user.id);
  }

  @Delete('events/:eventId/records/:recordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  uncheckIn(
    @Param('eventId') eventId: string,
    @Param('recordId') recordId: string,
    @ChurchId() churchId: string,
  ) {
    return this.attendanceService.uncheckIn(churchId, eventId, recordId);
  }

  @Get('events/:eventId/check-in/:memberId')
  isCheckedIn(
    @Param('eventId') eventId: string,
    @Param('memberId') memberId: string,
    @ChurchId() churchId: string,
  ) {
    return this.attendanceService.isCheckedIn(churchId, eventId, memberId);
  }

  @Get('events/:eventId/report')
  getReport(@Param('eventId') eventId: string, @ChurchId() churchId: string) {
    return this.attendanceService.getEventReport(churchId, eventId);
  }
}
