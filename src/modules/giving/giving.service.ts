import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GivingRecord } from './giving-record.entity';
import { Member } from '../members/member.entity';

@Injectable()
export class GivingService {
  constructor(
    @InjectRepository(GivingRecord) private readonly repo: Repository<GivingRecord>,
    @InjectRepository(Member) private readonly memberRepo: Repository<Member>,
  ) {}

  create(churchId: string, recordedBy: string, data: Partial<GivingRecord>) {
    return this.repo.save(this.repo.create({ ...data, churchId, recordedBy }));
  }

  async findAll(churchId: string, limit = 100) {
    const records = await this.repo.find({
      where: { churchId },
      order: { date: 'DESC' },
      take: limit,
    });

    const memberIds = records.map((r) => r.memberId).filter(Boolean) as string[];
    const members = memberIds.length ? await this.memberRepo.findByIds(memberIds) : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    return records.map((r) => ({
      ...r,
      member: r.memberId ? memberMap.get(r.memberId) ?? null : null,
    }));
  }

  findByMember(churchId: string, memberId: string) {
    return this.repo.find({ where: { churchId, memberId }, order: { date: 'DESC' } });
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
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return this.getSummary(churchId, from, to);
  }

  async getTodayTotal(churchId: string) {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    const result = await this.repo
      .createQueryBuilder('g')
      .select('SUM(g.amount)', 'total')
      .where('g.churchId = :churchId AND g.date BETWEEN :from AND :to', { churchId, from, to })
      .getRawOne();
    return parseFloat(result?.total ?? 0);
  }
}
