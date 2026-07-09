import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageLog, MessageChannel, MessageStatus } from './message-log.entity';
import { TermiiProvider } from './providers/termii.provider';

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(MessageLog)
    private readonly logRepo: Repository<MessageLog>,
    private readonly termii: TermiiProvider,
  ) {}

  async sendWhatsApp(
    churchId: string,
    to: string,
    body: string,
    memberId?: string,
  ) {
    const log = await this.logRepo.save(
      this.logRepo.create({
        churchId,
        memberId: memberId ?? null,
        recipientPhone: to,
        channel: MessageChannel.WHATSAPP,
        body,
        status: MessageStatus.QUEUED,
      }),
    );

    try {
      const providerMessageId = await this.termii.sendWhatsApp(to, body);
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
      const providerMessageId = await this.termii.sendSms(to, body);
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
}
