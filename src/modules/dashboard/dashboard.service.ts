import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Member } from '../members/member.entity';
import { Church } from '../churches/church.entity';
import { MembersService } from '../members/members.service';
import { MemberStatus, ChurchRole, UserRole } from '@/types';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Member) private readonly memberRepo: Repository<Member>,
    @InjectRepository(Church)  private readonly churchRepo:  Repository<Church>,
    private readonly membersService: MembersService,
  ) {}

  async getStats(churchId: string, role: string) {
    const isSenior = role === UserRole.SENIOR_PASTOR;

    const [
      totalMembers,
      totalBranches,
      totalWorkers,
      totalFirstTimers,
      totalNewConverts,
      totalPastors,
      totalFollowUps,
    ] = await Promise.all([
      this.memberRepo.count({ where: { churchId } }),

      isSenior
        ? this.churchRepo.count({ where: { parentChurchId: churchId } })
        : Promise.resolve(null),

      this.memberRepo.count({ where: { churchId, status: MemberStatus.WORKER } }),
      this.memberRepo.count({ where: { churchId, status: MemberStatus.FIRST_TIMER } }),
      this.memberRepo.count({ where: { churchId, status: MemberStatus.NEW_CONVERT } }),

      // Unified pastor count: status='pastor'/'minister' OR churchRole='pastor'/'branch_pastor'
      this.membersService.countPastors(churchId),

      this.memberRepo
        .createQueryBuilder('m')
        .where('m.churchId = :churchId', { churchId })
        .andWhere(':tag = ANY(m.tags)', { tag: 'Follow-Up Needed' })
        .getCount(),
    ]);

    return {
      totalMembers,
      totalBranches,
      totalWorkers,
      totalFirstTimers,
      totalNewConverts,
      totalPastors,
      totalFollowUps,
      // Populated when Attendance, Events, Finance modules are built
      attendanceThisWeek: null,
      totalEvents: null,
      totalDepartments: null,
      monthlyGiving: null,
    };
  }
}
