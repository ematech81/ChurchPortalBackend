import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { FollowUpTask, TaskStatus, TaskType } from './follow-up-task.entity';
import { FollowUpJourney, JourneyStatus } from './follow-up-journey.entity';
import { Member } from '../members/member.entity';
import { Church } from '../churches/church.entity';
import { MessagingService } from '../messaging/messaging.service';

/** Message copy per journey step. Keyed by the step label stored in task.payload. */
function messageFor(label: string, first: string, church: string): string {
  switch (label) {
    case 'Welcome message to convert':
      return `Hello ${first}, welcome to the family at ${church}! We are so glad you gave your life to Christ. Someone from our team will be in touch with you soon.`;
    case 'Week-1 pastor welcome':
      return `Hello ${first}, this is ${church}. We are praying for you this week. Reply to let us know if there is anything we can pray about with you.`;
    case 'Foundation class invite':
      return `Hello ${first}, ${church} would love to invite you to our foundation class, where we help new believers grow. Please speak with your follow-up contact for details.`;
    case 'Cell group invite':
      return `Hello ${first}, we'd love for you to join a cell group at ${church} — a small family to grow with. Your follow-up contact can tell you more.`;
    default:
      return `Hello ${first}, this is ${church}. We are thinking of you and praying for you.`;
  }
}

/**
 * Runs one follow-up task when its scheduled time arrives.
 *
 *  - send_message  → real SMS to the member (skipped if they opted out or have no phone)
 *  - notify_worker → handled manually by the pastor in the app → SKIPPED
 *  - worker_action / check_status / escalate → human to-dos. They become *due* at triggerAt
 *    and stay PENDING until a person completes them, so this job deliberately does nothing.
 */
@Processor('follow-up')
export class FollowUpProcessor extends WorkerHost {
  private readonly logger = new Logger(FollowUpProcessor.name);

  constructor(
    @InjectRepository(FollowUpTask) private readonly taskRepo: Repository<FollowUpTask>,
    @InjectRepository(FollowUpJourney) private readonly journeyRepo: Repository<FollowUpJourney>,
    @InjectRepository(Member) private readonly memberRepo: Repository<Member>,
    @InjectRepository(Church) private readonly churchRepo: Repository<Church>,
    private readonly messaging: MessagingService,
  ) {
    super();
  }

  async process(job: Job<{ taskId: string }>) {
    const task = await this.taskRepo.findOne({ where: { id: job.data.taskId } });
    if (!task || task.status !== TaskStatus.PENDING) return; // already handled / removed → idempotent

    if (task.type === TaskType.NOTIFY_WORKER) {
      return this.finish(task, TaskStatus.SKIPPED, 'Handled manually by the pastor.');
    }
    if (task.type !== TaskType.SEND_MESSAGE) return; // human to-do: stays pending until completed

    const journey = await this.journeyRepo.findOne({ where: { id: task.journeyId, churchId: task.churchId } });
    if (!journey || journey.status !== JourneyStatus.ACTIVE) {
      return this.finish(task, TaskStatus.SKIPPED, 'Journey is no longer active.');
    }

    const member = await this.memberRepo.findOne({ where: { id: journey.memberId, churchId: task.churchId } });
    if (!member?.phone) return this.finish(task, TaskStatus.SKIPPED, 'Member has no phone number.');
    if (member.smsOptIn === false) return this.finish(task, TaskStatus.SKIPPED, 'Member opted out of SMS.');

    const church = await this.churchRepo.findOne({ where: { id: task.churchId } });
    const label = String((task.payload as any)?.label ?? '');
    const body = messageFor(label, member.firstName, church?.name ?? 'our church');

    try {
      await this.messaging.sendSms(task.churchId, member.phone, body, member.id);
      await this.finish(task, TaskStatus.DONE);
    } catch (err: any) {
      const attempts = job.opts.attempts ?? 1;
      const isLast = job.attemptsMade + 1 >= attempts;
      this.logger.warn(`Task ${task.id} send failed (attempt ${job.attemptsMade + 1}/${attempts}): ${err?.message}`);
      if (isLast) await this.finish(task, TaskStatus.FAILED, String(err?.message ?? err).slice(0, 250));
      throw err; // let BullMQ retry with backoff
    }
  }

  private async finish(task: FollowUpTask, status: TaskStatus, error?: string) {
    await this.taskRepo.update(task.id, { status, processedAt: new Date(), error: error ?? null });
  }
}
