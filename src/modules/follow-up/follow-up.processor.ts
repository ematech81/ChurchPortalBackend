import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FollowUpService } from './follow-up.service';

@Processor('follow-up')
export class FollowUpProcessor extends WorkerHost {
  private readonly logger = new Logger(FollowUpProcessor.name);

  constructor(private readonly followUpService: FollowUpService) {
    super();
  }

  async process(job: Job<{ taskId: string }>) {
    this.logger.log(`Processing follow-up task ${job.data.taskId}`);
    // TODO: dispatch to messaging service based on task type
    await this.followUpService.completeTask(job.data.taskId);
  }
}
