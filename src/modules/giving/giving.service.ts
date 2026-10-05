import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GivingRecord } from './giving-record.entity';
import { Member } from '../members/member.entity';
import { CreateGivingDto } from './dto/giving.dto';

// Nigeria is UTC+1 year-round. "Today" and "this month" must follow the church's
// calendar, not the server's (Railway runs in UTC).
const WAT_OFFSET_MS = 60 * 60 * 1000;

function watNow() {
  return new Date(Date.now() + WAT_OFFSET_MS);
}
/** Start of a WAT calendar day/month expressed as a real instant. */
function watInstant(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d) - WAT_OFFSET_MS);
}

@Injectable()
export class GivingService {
  constructor(
    @InjectRepository(GivingRecord) private readonly repo: Repository<GivingRecord>,
    @InjectRepository(Member) private readonly memberRepo: Repository<Member>,
  ) {}

  async create(churchId: string, recordedBy: string, dto: CreateGivingDto) {
    if (dto.memberId) {
      // The donor must belong to the caller's church.
      const owns = await this.memberRepo.exist({ where: { id: dto.memberId, churchId } });
      if (!owns) throw new BadRequestException('Member not found.');
    }
    return this.repo.save(
      this.repo.create({
        churchId,
        recordedBy,
        fund: dto.fund,
        amount: dto.amount,
        memberId: dto.memberId ?? null,
        date: dto.date ? new Date(dto.date) : new Date(),
        isAnonymous: dto.isAnonymous ?? !dto.memberId,
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
      }),
    );
  }

  async findAll(churchId: string, limit?: number) {
    const take = Math.min(Number.isFinite(limit) && limit! > 0 ? limit! : 100, 500);
    const records = await this.repo.find({
      where: { churchId },
      order: { date: 'DESC' },
      take,
    });

    const memberIds = [
      ...new Set(records.filter((r) => !r.isAnonymous).map((r) => r.memberId).filter(Boolean)),
    ] as string[];
    const members = memberIds.length
      ? await this.memberRepo
          .createQueryBuilder('m')
          .where('m.churchId = :churchId AND m.id IN (:...memberIds)', { churchId, memberIds })
          .getMany()
      : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    // Anonymous gifts never reveal the donor, even though we may hold a memberId internally.
    return records.map((r) => ({
      ...r,
      memberId: r.isAnonymous ? null : r.memberId,
      member: !r.isAnonymous && r.memberId ? memberMap.get(r.memberId) ?? null : null,
    }));
  }

  findByMember(churchId: string, memberId: string) {
    return this.repo.find({
      where: { churchId, memberId, isAnonymous: false },
      order: { date: 'DESC' },
    });
  }

  async getSummary(churchId: string, from: Date, to: Date) {
    const byFund = await this.repo
      .createQueryBuilder('g')
      .select('g.fund', 'fund')
      .addSelect('SUM(g.amount)', 'total')
      .addSelect('COUNT(g.id)', 'count')
      .where('g.churchId = :churchId AND g.date BETWEEN :from AND :to', { churchId, from, to })
      .groupBy('g.fund')
      .getRawMany();

    const grandTotal = byFund.reduce((s, r) => s + parseFloat(r.total ?? 0), 0);

    return { byFund, grandTotal, from, to };
  }

  async getMonthSummary(churchId: string) {
    const n = watNow();
    const from = watInstant(n.getUTCFullYear(), n.getUTCMonth(), 1);
    const to = new Date(watInstant(n.getUTCFullYear(), n.getUTCMonth() + 1, 1).getTime() - 1);
    return this.getSummary(churchId, from, to);
  }

  async getTodayTotal(churchId: string) {
    const n = watNow();
    const from = watInstant(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const to = new Date(watInstant(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1).getTime() - 1);
    const result = await this.repo
      .createQueryBuilder('g')
      .select('SUM(g.amount)', 'total')
      .where('g.churchId = :churchId AND g.date BETWEEN :from AND :to', { churchId, from, to })
      .getRawOne();
    return parseFloat(result?.total ?? 0);
  }
}
