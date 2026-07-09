import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FollowUpService } from './follow-up.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JourneyStatus } from './follow-up-journey.entity';

@ApiTags('Follow-up')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('follow-up')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Get('stats')
  getStats(@ChurchId() churchId: string) {
    return this.followUpService.getStats(churchId);
  }

  @Get('queue')
  getQueue(@ChurchId() churchId: string) {
    return this.followUpService.getFollowUpQueue(churchId);
  }

  @Get('journeys')
  getJourneys(@ChurchId() churchId: string) {
    return this.followUpService.getJourneysWithMembers(churchId);
  }

  @Post('journeys')
  startJourney(
    @ChurchId() churchId: string,
    @CurrentUser() caller: { id: string; firstName: string; lastName: string },
    @Body() body: { memberId: string; decisionType: string; assignedWorkerId?: string },
  ) {
    return this.followUpService.startJourney(
      churchId, body.memberId, body.decisionType, body.assignedWorkerId, caller,
    );
  }

  @Get('journeys/:id/tasks')
  getTasks(@Param('id') id: string, @ChurchId() churchId: string) {
    return this.followUpService.getJourneyTasks(id, churchId);
  }

  @Patch('journeys/:id/assign')
  assignWorker(
    @Param('id') id: string,
    @ChurchId() churchId: string,
    @CurrentUser() caller: { id: string; firstName: string; lastName: string },
    @Body() body: { workerId: string },
  ) {
    return this.followUpService.assignWorker(churchId, id, body.workerId, caller);
  }

  @Patch('journeys/:id/status')
  updateStatus(
    @Param('id') id: string,
    @ChurchId() churchId: string,
    @Body() body: { status: JourneyStatus },
  ) {
    return this.followUpService.updateJourneyStatus(churchId, id, body.status);
  }

  // ── Worker Portal ─────────────────────────────────────────────────────────

  @Get('worker/portal')
  getWorkerPortal(
    @CurrentUser() user: { id: string },
    @ChurchId() churchId: string,
  ) {
    return this.followUpService.getWorkerPortal(user.id, churchId);
  }

  @Post('worker/regenerate-code')
  regenerateCode(@CurrentUser() user: { id: string }) {
    return this.followUpService.regenerateWorkerCode(user.id);
  }

  // ── Worker Notify — log intent + return deep-links ────────────────────────

  @Post('workers/:workerId/notify')
  notifyWorker(
    @Param('workerId') workerId: string,
    @ChurchId() churchId: string,
    @CurrentUser() caller: { id: string; firstName: string; lastName: string },
    @Body() body: { channel: 'whatsapp' | 'sms' | 'call'; journeyId?: string },
  ) {
    return this.followUpService.notifyWorker(
      workerId, churchId, caller.id, caller.lastName, body.channel, body.journeyId,
    );
  }

  // ── Dispatch log (Senior Pastor only) ────────────────────────────────────

  @Get('dispatch-log')
  getDispatchLog(@ChurchId() churchId: string) {
    return this.followUpService.getDispatchLog(churchId);
  }
}
