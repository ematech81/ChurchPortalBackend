import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { FollowUpJourney } from './follow-up-journey.entity';
import { FollowUpTask } from './follow-up-task.entity';
import { Member } from '../members/member.entity';
import { User } from '../users/user.entity';
import { Visit } from '../visits/visit.entity';
import { WorkerCodeDispatchLog } from './worker-code-dispatch-log.entity';
import { FollowUpService } from './follow-up.service';
import { FollowUpController } from './follow-up.controller';
import { FollowUpProcessor } from './follow-up.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([FollowUpJourney, FollowUpTask, Member, User, Visit, WorkerCodeDispatchLog]),
    BullModule.registerQueue({ name: 'follow-up' }),
  ],
  controllers: [FollowUpController],
  providers: [FollowUpService, FollowUpProcessor],
  exports: [FollowUpService],
})
export class FollowUpModule {}
