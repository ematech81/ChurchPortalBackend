import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MessageLog, MessageChannel, MessageStatus } from './message-log.entity';
import { Member } from '../members/member.entity';
import { BulkSmsProvider } from './providers/bulksms.provider';
import { Church } from '../churches/church.entity';
import { UserRole } from '@/types';
import { toInternationalDigits } from '../../common/utils/phone';

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(MessageLog)
    private readonly logRepo: Repository<MessageLog>,
    @InjectRepository(Member)
    private readonly memberRepo: Repository<Member>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
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

  /**
   * Bulk SMS. Recipients are either explicit member ids or an audience (status / youth / whole organisation),
   * resolved here so the phone never has to download the list. Anyone without a phone or who opted out is
   * skipped, a phone number shared by several members is texted once, and `{name}` becomes each person's
   * first name. One failure never aborts the rest.
   */
  async sendBulk(
    churchId: string,
    role: string,
    dto: { memberIds?: string[]; status?: string; youthOnly?: boolean; wholeOrg?: boolean; body: string },
  ) {
    const churchIds = await this.resolveChurchIds(churchId, role, !!dto.wholeOrg);
    let members: Member[];
    let skipped = 0;

    if (dto.memberIds?.length) {
      members = await this.memberRepo.findBy({ id: In(dto.memberIds), churchId: In(churchIds) });
      skipped += dto.memberIds.length - members.length; // unknown / other-church ids
    } else {
      const where: Record<string, unknown> = { churchId: In(churchIds) };
      if (dto.status && dto.status !== 'all') where.status = dto.status;
      if (dto.youthOnly) where.isYouth = true;
      members = await this.memberRepo.find({ where, order: { firstName: 'ASC' }, take: MAX_RECIPIENTS });
    }

    const seen = new Set<string>();
    const recipients: Member[] = [];
    for (const m of members) {
      if (!m.phone || m.smsOptIn === false) { skipped++; continue; }
      const key = toInternationalDigits(m.phone);
      if (seen.has(key)) { skipped++; continue; } // same number registered twice: text it once
      seen.add(key);
      recipients.push(m);
    }

    let sent = 0;
    let failed = 0;
    let firstError: string | null = null;
    for (let i = 0; i < recipients.length; i += BATCH) {
      await Promise.all(
        recipients.slice(i, i + BATCH).map(async (m) => {
          try {
            await this.sendSms(m.churchId, m.phone, personalise(dto.body, m), m.id);
            sent++;
          } catch (e: any) {
            failed++;
            firstError ??= e?.message ?? 'Unknown error';
          }
        }),
      );
    }
    // firstError is the gateway's own reason (e.g. insufficient balance) so admins can act on it.
    return { requested: dto.memberIds?.length ?? members.length, sent, failed, skipped, firstError };
  }

  /** A Senior Pastor may message the whole organisation (own church + direct branches); everyone else, only their church. */
  private async resolveChurchIds(churchId: string, role: string, wholeOrg: boolean): Promise<string[]> {
    if (!wholeOrg || (role !== UserRole.SENIOR_PASTOR && role !== UserRole.SUPER_ADMIN)) return [churchId];
    const branches = await this.churchRepo.find({ where: { parentChurchId: churchId }, select: ['id'] });
    return [churchId, ...branches.map((b) => b.id)];
  }
}

const MAX_RECIPIENTS = 2000;
const BATCH = 5;

/** Replaces {name} / {firstName} / {lastName} with the member's own details. */
function personalise(body: string, m: Member): string {
  return body
    .replace(/\{\s*(name|firstName)\s*\}/gi, m.firstName)
    .replace(/\{\s*lastName\s*\}/gi, m.lastName);
}
