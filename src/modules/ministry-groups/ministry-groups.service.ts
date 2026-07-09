import { Injectable, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Or } from 'typeorm';
import { GroupCategory } from './group-category.entity';
import { MinistryGroup, GroupStatus } from './ministry-group.entity';
import { MinistryGroupMember } from './ministry-group-member.entity';
import { MinistryGroupAttendance } from './ministry-group-attendance.entity';
import { Member } from '../members/member.entity';

// ── Default seed categories ───────────────────────────────────────────────────
// These are global (churchId = null) and created once on first boot.
// Churches can add custom categories on top of these.

const SEED_CATEGORIES = [
  {
    name: 'Cell Group',
    description: 'Smaller, intimate gatherings focused on fellowship and spiritual growth at home.',
    iconKey: 'home',
    defaultLeaderTitle: 'Leader',
    defaultMemberTitle: 'Member',
    sortOrder: 1,
  },
  {
    name: 'Department',
    description: 'Core functional units of the ministry that handle administrative or operational tasks.',
    iconKey: 'business',
    defaultLeaderTitle: 'Director',
    defaultMemberTitle: 'Member',
    sortOrder: 2,
  },
  {
    name: 'Service Unit',
    description: 'Active teams dedicated to specific service activities during worship or community events.',
    iconKey: 'heart',
    defaultLeaderTitle: 'Lead Usher',
    defaultMemberTitle: 'Volunteer',
    sortOrder: 3,
  },
  {
    name: 'Special Committee',
    description: 'Temporary task forces established for specific projects or periodic church events.',
    iconKey: 'hammer',
    defaultLeaderTitle: 'Chairperson',
    defaultMemberTitle: 'Member',
    sortOrder: 4,
  },
];

@Injectable()
export class MinistryGroupsService implements OnModuleInit {
  constructor(
    @InjectRepository(GroupCategory)
    private readonly categoryRepo: Repository<GroupCategory>,
    @InjectRepository(MinistryGroup)
    private readonly groupRepo: Repository<MinistryGroup>,
    @InjectRepository(MinistryGroupMember)
    private readonly membershipRepo: Repository<MinistryGroupMember>,
    @InjectRepository(MinistryGroupAttendance)
    private readonly attendanceRepo: Repository<MinistryGroupAttendance>,
    @InjectRepository(Member)
    private readonly memberRepo: Repository<Member>,
  ) {}

  // ── Seed default categories on first boot ─────────────────────────────────
  async onModuleInit() {
    for (const seed of SEED_CATEGORIES) {
      const exists = await this.categoryRepo.findOne({
        where: { name: seed.name, churchId: IsNull() },
      });
      if (!exists) {
        await this.categoryRepo.save(
          this.categoryRepo.create({ ...seed, churchId: null }),
        );
      }
    }
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async listCategories(churchId: string) {
    // Return global categories + church-specific ones, sorted
    return this.categoryRepo
      .createQueryBuilder('c')
      .where('(c.churchId IS NULL OR c.churchId = :churchId)', { churchId })
      .andWhere('c.isActive = true')
      .orderBy('c.sortOrder', 'ASC')
      .addOrderBy('c.name', 'ASC')
      .getMany();
  }

  createCategory(churchId: string, data: Partial<GroupCategory>) {
    const maxOrder = this.categoryRepo
      .createQueryBuilder('c')
      .select('MAX(c.sortOrder)', 'max')
      .where('c.churchId = :churchId OR c.churchId IS NULL', { churchId })
      .getRawOne()
      .then((r) => (r?.max ?? 0) + 1);

    return maxOrder.then((order) =>
      this.categoryRepo.save(
        this.categoryRepo.create({ ...data, churchId, sortOrder: order }),
      ),
    );
  }

  // ── Groups ─────────────────────────────────────────────────────────────────

  async listGroups(churchId: string, search?: string, categoryId?: string, status?: string) {
    const qb = this.groupRepo
      .createQueryBuilder('g')
      .where('g.churchId = :churchId', { churchId })
      .andWhere('g.deletedAt IS NULL')
      .orderBy('g.name', 'ASC');

    if (search?.trim()) {
      qb.andWhere('LOWER(g.name) LIKE :s', { s: `%${search.trim().toLowerCase()}%` });
    }
    if (categoryId) {
      qb.andWhere('g.categoryId = :categoryId', { categoryId });
    }
    if (status) {
      qb.andWhere('g.status = :status', { status });
    }

    const groups = await qb.getMany();
    if (!groups.length) return [];

    // Enrich with member count and leader info
    const groupIds = groups.map((g) => g.id);

    const memberCounts = await this.membershipRepo
      .createQueryBuilder('m')
      .select('m.groupId', 'groupId')
      .addSelect('COUNT(m.id)', 'count')
      .where('m.groupId IN (:...ids) AND m.leftAt IS NULL', { ids: groupIds })
      .groupBy('m.groupId')
      .getRawMany();

    const countMap = new Map(memberCounts.map((r) => [r.groupId, parseInt(r.count, 10)]));

    // Load leaders
    const leaderIds = [...new Set(groups.map((g) => g.leaderId).filter(Boolean))] as string[];
    const leaders = leaderIds.length
      ? await this.memberRepo.findByIds(leaderIds)
      : [];
    const leaderMap = new Map(leaders.map((l) => [l.id, l]));

    return groups.map((g) => ({
      ...g,
      memberCount: countMap.get(g.id) ?? 0,
      leader: g.leaderId ? leaderMap.get(g.leaderId) ?? null : null,
    }));
  }

  async listGroupedByCategory(churchId: string, search?: string, categoryId?: string, status?: string) {
    const [categories, groups] = await Promise.all([
      this.listCategories(churchId),
      this.listGroups(churchId, search, categoryId, status),
    ]);

    return categories
      .map((cat) => ({
        category: cat,
        groups: groups.filter((g) => g.categoryId === cat.id),
      }))
      .filter((section) => section.groups.length > 0); // hide empty sections
  }

  async getGroupById(id: string, churchId: string) {
    const group = await this.groupRepo.findOne({ where: { id, churchId } });
    if (!group) throw new NotFoundException('Ministry group not found');

    const [memberships, attendance] = await Promise.all([
      this.membershipRepo
        .createQueryBuilder('m')
        .where('m.groupId = :id AND m.leftAt IS NULL', { id })
        .orderBy('m.joinedAt', 'ASC')
        .getMany(),
      this.attendanceRepo.find({
        where: { groupId: id },
        order: { date: 'DESC' },
        take: 6,
      }),
    ]);

    // Load member details for memberships
    const memberIds = memberships.map((m) => m.memberId);
    const members = memberIds.length ? await this.memberRepo.findByIds(memberIds) : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const enrichedMemberships = memberships.map((m) => ({
      ...m,
      member: memberMap.get(m.memberId) ?? null,
    }));

    // Leader info
    const leader = group.leaderId
      ? await this.memberRepo.findOne({ where: { id: group.leaderId } })
      : null;

    // Growth metric: members joined this quarter vs last quarter
    const now = new Date();
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const prevQStart = new Date(qStart);
    prevQStart.setMonth(prevQStart.getMonth() - 3);

    const [thisQ, prevQ] = await Promise.all([
      this.membershipRepo.count({ where: { groupId: id } }),
      this.membershipRepo
        .createQueryBuilder('m')
        .where('m.groupId = :id AND m.joinedAt < :qStart', { id, qStart })
        .getCount(),
    ]);

    const growthPct = prevQ > 0 ? Math.round(((thisQ - prevQ) / prevQ) * 100) : null;

    return {
      ...group,
      leader,
      memberships: enrichedMemberships,
      memberCount: memberships.length,
      attendance: attendance.reverse(), // chronological order for chart
      growthPct,
    };
  }

  async createGroup(churchId: string, data: {
    categoryId: string;
    name: string;
    description?: string;
    leaderId?: string;
    leaderRoleTitle?: string;
    branchId?: string;
    cadence?: string;
    meetingDay?: string;
    meetingTime?: string;
    status?: GroupStatus;
    coverImageUrl?: string;
    isDraft?: boolean;
    initialMemberIds?: { memberId: string; roleTitle?: string }[];
  }) {
    // Duplicate name check within same category
    const duplicate = await this.groupRepo.findOne({
      where: { churchId, categoryId: data.categoryId, name: data.name },
    });
    if (duplicate && !data.isDraft) {
      throw new BadRequestException(
        `A group named "${data.name}" already exists in this category.`,
      );
    }

    const group = await this.groupRepo.save(
      this.groupRepo.create({
        churchId,
        categoryId: data.categoryId,
        name: data.name,
        description: data.description ?? null,
        leaderId: data.leaderId ?? null,
        leaderRoleTitle: data.leaderRoleTitle ?? null,
        branchId: data.branchId ?? null,
        cadence: data.cadence ?? null,
        meetingDay: data.meetingDay ?? null,
        meetingTime: data.meetingTime ?? null,
        status: data.status ?? GroupStatus.ACTIVE,
        coverImageUrl: data.coverImageUrl ?? null,
        isDraft: data.isDraft ?? false,
      }),
    );

    if (data.initialMemberIds?.length) {
      const memberships = data.initialMemberIds.map((m) =>
        this.membershipRepo.create({
          churchId,
          groupId: group.id,
          memberId: m.memberId,
          roleTitle: m.roleTitle ?? 'Member',
        }),
      );
      await this.membershipRepo.save(memberships);
    }

    return group;
  }

  async updateGroup(id: string, churchId: string, data: Partial<MinistryGroup>) {
    const group = await this.groupRepo.findOne({ where: { id, churchId } });
    if (!group) throw new NotFoundException('Ministry group not found');
    await this.groupRepo.update({ id, churchId }, data as any);
    return this.groupRepo.findOne({ where: { id } });
  }

  async deleteGroup(id: string, churchId: string) {
    const group = await this.groupRepo.findOne({ where: { id, churchId } });
    if (!group) throw new NotFoundException('Ministry group not found');
    await this.groupRepo.softDelete({ id, churchId });
  }

  // ── Memberships ───────────────────────────────────────────────────────────

  async addMember(groupId: string, churchId: string, memberId: string, roleTitle = 'Member') {
    const existing = await this.membershipRepo.findOne({
      where: { groupId, memberId, leftAt: undefined as any },
    });
    if (existing && !existing.leftAt) {
      throw new BadRequestException('Member is already in this group.');
    }

    return this.membershipRepo.save(
      this.membershipRepo.create({ churchId, groupId, memberId, roleTitle }),
    );
  }

  async removeMember(groupId: string, memberId: string, churchId: string) {
    const membership = await this.membershipRepo.findOne({
      where: { groupId, memberId },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    await this.membershipRepo.update(membership.id, { leftAt: new Date() } as any);
  }

  // ── Attendance ────────────────────────────────────────────────────────────

  async recordAttendance(groupId: string, churchId: string, date: string, presentCount: number, totalCount: number) {
    const existing = await this.attendanceRepo.findOne({ where: { groupId, date } });
    if (existing) {
      await this.attendanceRepo.update(existing.id, { presentCount, totalCount } as any);
      return this.attendanceRepo.findOne({ where: { groupId, date } });
    }
    return this.attendanceRepo.save(
      this.attendanceRepo.create({ churchId, groupId, date, presentCount, totalCount }),
    );
  }
}
