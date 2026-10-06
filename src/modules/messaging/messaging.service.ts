import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MessageLog, MessageChannel, MessageStatus } from './message-log.entity';
import { Member } from '../members/member.entity';
import { BulkSmsProvider } from './providers/bulksms.provider';

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(MessageLog)
    private readonly logRepo: Repository<MessageLog>,
    @InjectRepository(Member)
    private readonly memberRepo: Repository<Member>,
    private readonly sms: BulkSmsProvider,
  ) {}

  async sendSms(churchId: string, to: string, body: string, memberId?: string) {
    const log = await this.logRepo.save(
      this.logRepo.create({
        churchId,
        memberId: memberId ?? null,
        recipientPhone: to,
        channel: MessageChannel.SMS,
        body,
        status: MessageStatus.QUEUED,
      }),
    );

    try {
      const providerMessageId = await this.sms.sendSms(to, body);
      await this.logRepo.update(log.id, {
        status: MessageStatus.SENT,
        providerMessageId,
        sentAt: new Date(),
      });
    } catch (error) {
      await this.logRepo.update(log.id, {
        status: MessageStatus.FAILED,
        error: String(error),
      });
      throw error;
    }

    return log;
  }

  getLogs(churchId: string) {
    return this.logRepo.find({
      where: { churchId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /** Church-scoped bulk SMS. Returns per-outcome counts; one failure never aborts the rest. */
  async sendBulk(churchId: string, memberIds: string[], body: string) {
    const members = await this.memberRepo.findBy({ id: In(memberIds), churchId });
    let sent = 0;
    let failed = 0;
    let skipped = memberIds.length - members.length; // unknown / other-church ids

    for (const m of members) {
      if (!m.phone || m.smsOptIn === false) {
        skipped++;
        continue;
      }
      try {
        await this.sendSms(churchId, m.phone, body, m.id);
        sent++;
      } catch {
        failed++;
      }
    }
    return { requested: memberIds.length, sent, failed, skipped };
  }
}
