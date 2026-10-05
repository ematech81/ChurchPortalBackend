import { Controller, Get, Post, Patch, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FollowUpService } from './follow-up.service';
import {
  StartJourneyDto, AssignWorkerDto, UpdateJourneyStatusDto, NotifyWorkerDto,
} from './dto/follow-up.dto';
import { ChurchId } from '../../common/decorators/church-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@/types';
import { ADMIN_ROLES } from '../../constants/role-groups';

type Caller = { id: string; firstName: string; lastName: string };

// Managing follow-up (who is assigned to whom, login codes) is a pastor function.
// Workers only get the two /worker/* routes below.
@ApiTags('Follow-up')
@ApiBearerAuth()
@Roles(...ADMIN_ROLES)
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
    @CurrentUser() caller: Caller,
    @Body() dto: StartJourneyDto,
  ) {
    return this.followUpService.startJourney(
      churchId, dto.memberId, dto.decisionType, dto.assignedWorkerId, caller,
    );
  }

  @Get('journeys/:id/tasks')
  getTasks(@Param('id', ParseUUIDPipe) id: string, @ChurchId() churchId: string) {
    return this.followUpService.getJourneyTasks(id, churchId);
  }

  @Patch('journeys/:id/assign')
  assignWorker(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @CurrentUser() caller: Caller,
    @Body() dto: AssignWorkerDto,
  ) {
    return this.followUpService.assignWorker(churchId, id, dto.workerId, caller);
  }

  @Patch('journeys/:id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @ChurchId() churchId: string,
    @Body() dto: UpdateJourneyStatusDto,
  ) {
    return this.followUpService.updateJourneyStatus(churchId, id, dto.status);
  }

  // ── Worker Portal ─────────────────────────────────────────────────────────

  /** Any signed-in user may open the portal; it only ever shows work matched to their own phone/user. */
  @Get('worker/portal')
  @Roles()
  getWorkerPortal(@CurrentUser() user: { id: string }, @ChurchId() churchId: string) {
    return this.followUpService.getWorkerPortal(user.id, churchId);
  }

  @Post('worker/regenerate-code')
  @Roles(UserRole.FOLLOW_UP_WORKER)
  regenerateCode(@CurrentUser() user: { id: string }) {
    return this.followUpService.regenerateWorkerCode(user.id);
  }

  // ── Worker Notify — log intent + return deep-links ────────────────────────

  @Post('workers/:workerId/notify')
  notifyWorker(
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @ChurchId() churchId: string,
    @CurrentUser() caller: Caller,
    @Body() dto: NotifyWorkerDto,
  ) {
    return this.followUpService.notifyWorker(
      workerId, churchId, caller.id, caller.lastName, dto.channel, dto.journeyId,
    );
  }

  // ── Dispatch log ──────────────────────────────────────────────────────────

  @Get('dispatch-log')
  getDispatchLog(@ChurchId() churchId: string) {
    return this.followUpService.getDispatchLog(churchId);
  }
}
