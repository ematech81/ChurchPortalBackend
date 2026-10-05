import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Member } from '../members/member.entity';
import { Church } from '../churches/church.entity';
import { AttendanceRecord } from '../attendance/attendance-record.entity';
import { ServiceEvent } from '../attendance/service-event.entity';
import { GivingRecord } from '../giving/giving-record.entity';
import { MembersService } from '../members/members.service';
import { MemberStatus, UserRole } from '@/types';

const WAT_OFFSET_MS = 60 * 60 * 1000; // Nigeria is UTC+1 year-round

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Member) private readonly memberRepo: Repository<Member>,
    @InjectRepository(Church) private readonly churchRepo: Repository<Church>,
    @InjectRepository(AttendanceRecord) private readonly recordRepo: Repository<AttendanceRecord>,
    @InjectRepository(ServiceEvent) private readonly eventRepo: Repository<ServiceEvent>,
    @InjectRepository(GivingRecord) private readonly givingRepo: Repository<GivingRecord>,
    private readonly membersService: MembersService,
  ) {}

  /**
   * Senior Pastor: totals are summed across the whole organisation (HQ + branches).
   * Everyone else, including Branch Pastors: their own church only.
   */
  async getStats(churchId: string, role: string) {
    const isSenior = role === UserRole.SENIOR_PASTOR || role === UserRole.SUPER_ADMIN;
    const scope = await this.membersService.resolveScope(churchId, role, true);
    const scopeIds = Array.isArray(scope) ? scope : [scope];

    const activeMember = { churchId: In(scopeIds), status: Not(In([MemberStatus.DECEASED, MemberStatus.TRANSFERRED])) };

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const wat = new Date(now.getTime() + WAT_OFFSET_MS);
    const monthStart = new Date(Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), 1) - WAT_OFFSET_MS);

    const [
      totalMembers,
      totalBranches,
      totalWorkers,
      totalFirstTimers,
      totalNewConverts,
      totalPastors,
      totalFollowUps,
      attendanceThisWeek,
      totalEvents,
      monthlyGivingRow,
      branchBreakdown,
    ] = await Promise.all([
      this.memberRepo.count({ where: activeMember }),
      isSenior ? this.churchRepo.count({ where: { parentChurchId: churchId } }) : Promise.resolve(null),
      this.memberRepo.count({ where: { churchId: In(scopeIds), status: MemberStatus.WORKER } }),
      this.memberRepo.count({ where: { churchId: In(scopeIds), status: MemberStatus.FIRST_TIMER } }),
      this.memberRepo.count({ where: { churchId: In(scopeIds), status: MemberStatus.NEW_CONVERT } }),
      this.membersService.countPastors(scope),
      this.memberRepo
        .createQueryBuilder('m')
        .where('m.churchId IN (:...scopeIds)', { scopeIds })
        .andWhere(':tag = ANY(m.tags)', { tag: 'Follow-Up Needed' })
        .getCount(),
      this.recordRepo
        .createQueryBuilder('r')
        .where('r.churchId IN (:...scopeIds) AND r.checkedInAt >= :weekAgo', { scopeIds, weekAgo })
        .getCount(),
      this.eventRepo.count({ where: { churchId: In(scopeIds) } }),
      this.givingRepo
        .createQueryBuilder('g')
        .select('SUM(g.amount)', 'total')
        .where('g.churchId IN (:...scopeIds) AND g.date >= :monthStart', { scopeIds, monthStart })
        .getRawOne(),
      isSenior ? this.branchBreakdown(churchId, scopeIds) : Promise.resolve(null),
    ]);

    return {
      scope: isSenior ? 'organisation' : 'church',
      totalMembers,
      totalBranches,
      totalWorkers,
      totalFirstTimers,
      totalNewConverts,
      totalPastors,
      totalFollowUps,
      attendanceThisWeek,
      totalEvents,
      totalDepartments: null, // departments are free text on members; real departments come with the ministry-groups merge
      monthlyGiving: parseFloat(monthlyGivingRow?.total ?? '0'),
      branchBreakdown,
    };
  }

  /** Member count per church in the organisation, HQ first. */
  private async branchBreakdown(hqId: string, scopeIds: string[]) {
    const [churches, counts] = await Promise.all([
      this.churchRepo.find({ where: { id: In(scopeIds) }, select: ['id', 'name'] }),
      this.memberRepo
        .createQueryBuilder('m')
        .select('m.churchId', 'churchId')
        .addSelect('COUNT(m.id)', 'count')
        .where('m.churchId IN (:...scopeIds)', { scopeIds })
        .andWhere('m.status NOT IN (:...gone)', { gone: [MemberStatus.DECEASED, MemberStatus.TRANSFERRED] })
        .groupBy('m.churchId')
        .getRawMany(),
    ]);
    const countMap = new Map(counts.map((r) => [r.churchId, parseInt(r.count, 10)]));
    return churches
      .map((c) => ({ id: c.id, name: c.name, isHeadquarters: c.id === hqId, memberCount: countMap.get(c.id) ?? 0 }))
      .sort((a, b) => Number(b.isHeadquarters) - Number(a.isHeadquarters) || b.memberCount - a.memberCount);
  }
}
