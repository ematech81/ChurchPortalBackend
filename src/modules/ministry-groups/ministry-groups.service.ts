import { Injectable, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { GroupCategory } from './group-category.entity';
import { MinistryGroup, GroupStatus } from './ministry-group.entity';
import { MinistryGroupMember } from './ministry-group-member.entity';
import { MinistryGroupAttendance } from './ministry-group-attendance.entity';
import { Member } from '../members/member.entity';
import { Church } from '../churches/church.entity';
import { CreateCategoryDto, CreateGroupDto, UpdateGroupDto } from './dto/ministry-group.dto';

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
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
  ) {}

  // ── Tenant guards ─────────────────────────────────────────────────────────

  private async _assertGroup(groupId: string, churchId: string): Promise<MinistryGroup> {
    const group = await this.groupRepo.findOne({ where: { id: groupId, churchId } });
    if (!group) throw new NotFoundException('Ministry group not found');
    return group;
  }

  private async _assertMembers(memberIds: string[], churchId: string) {
    const unique = [...new Set(memberIds)];
    if (!unique.length) return;
    const found = await this.memberRepo.count({ where: { id: In(unique), churchId } });
    if (found !== unique.length) throw new BadRequestException('One or more members were not found.');
  }

  /** Categories are global (churchId NULL) or this church's own. */
  private async _assertCategory(categoryId: string, churchId: string) {
    const ok = await this.categoryRepo
      .createQueryBuilder('c')
      .where('c.id = :categoryId AND (c.churchId IS NULL OR c.churchId = :churchId)', { categoryId, churchId })
      .getExists();
    if (!ok) throw new BadRequestException('Category not found.');
  }

  /** A group's branch must be this church or one of its direct branches. */
  private async _assertBranch(branchId: string, churchId: string) {
    const ok =
      branchId === churchId ||
      (await this.churchRepo.exist({ where: { id: branchId, parentChurchId: churchId } }));
    if (!ok) throw new BadRequestException('Branch not found.');
  }

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

  createCategory(churchId: string, data: CreateCategoryDto) {
    const maxOrder = this.categoryRepo
      .createQueryBuilder('c')
      .select('MAX(c.sortOrder)', 'max')
      .where('c.churchId = :churchId OR c.churchId IS NULL', { churchId })
      .getRawOne()
      .then((r) => (r?.max ?? 0) + 1);

    return maxOrder.then((order) =>
      this.categoryRepo.save(
        this.categoryRepo.create({
          name: data.name.trim(),
          description: data.description ?? null,
          iconKey: data.iconKey ?? null,
          defaultLeaderTitle: data.defaultLeaderTitle,
          defaultMemberTitle: data.defaultMemberTitle,
          churchId,
          sortOrder: order,
        }),
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
      if (!Object.values(GroupStatus).includes(status as GroupStatus)) {
        throw new BadRequestException('Unknown status filter.');
      }
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
      ? await this.memberRepo.findBy({ id: In(leaderIds), churchId })
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
    const members = memberIds.length ? await this.memberRepo.findBy({ id: In(memberIds), churchId }) : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const enrichedMemberships = memberships.map((m) => ({
      ...m,
      member: memberMap.get(m.memberId) ?? null,
    }));

    // Leader info
    const leader = group.leaderId
      ? await this.memberRepo.findOne({ where: { id: group.leaderId, churchId } })
      : null;

    // Growth metric: members joined this quarter vs last quarter
    const now = new Date();
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    // Growth = change in ACTIVE members between the start of this quarter and now.
    const activeNow = memberships.length;
    const activeAtQuarterStart = await this.membershipRepo
      .createQueryBuilder('m')
      .where('m.groupId = :id AND m.joinedAt < :qStart', { id, qStart })
      .andWhere('(m.leftAt IS NULL OR m.leftAt >= :qStart)', { qStart })
      .getCount();

    const growthPct =
      activeAtQuarterStart > 0
        ? Math.round(((activeNow - activeAtQuarterStart) / activeAtQuarterStart) * 100)
        : null;

    return {
      ...group,
      leader,
      memberships: enrichedMemberships,
      memberCount: memberships.length,
      attendance: attendance.reverse(), // chronological order for chart
      growthPct,
    };
  }

  async createGroup(churchId: string, data: CreateGroupDto) {
    await this._assertCategory(data.categoryId, churchId);
    if (data.leaderId) await this._assertMembers([data.leaderId], churchId);
    if (data.branchId) await this._assertBranch(data.branchId, churchId);
    if (data.initialMemberIds?.length) {
      await this._assertMembers(data.initialMemberIds.map((m) => m.memberId), churchId);
    }

    // Duplicate name check within same category
    const duplicate = await this.groupRepo.findOne({
      where: { churchId, categoryId: data.categoryId, name: data.name.trim() },
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
        name: data.name.trim(),
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
      const unique = new Map(data.initialMemberIds.map((m) => [m.memberId, m]));
      const memberships = [...unique.values()].map((m) =>
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

  async updateGroup(id: string, churchId: string, data: UpdateGroupDto) {
    await this._assertGroup(id, churchId);
    if (data.categoryId) await this._assertCategory(data.categoryId, churchId);
    if (data.leaderId) await this._assertMembers([data.leaderId], churchId);
    if (data.branchId) await this._assertBranch(data.branchId, churchId);

    // Members are managed through the membership endpoints, never through a group update.
    const { initialMemberIds, ...fields } = data;
    void initialMemberIds;
    if (Object.keys(fields).length) await this.groupRepo.update({ id, churchId }, fields as any);
    return this.groupRepo.findOne({ where: { id, churchId } });
  }

  async deleteGroup(id: string, churchId: string) {
    const group = await this.groupRepo.findOne({ where: { id, churchId } });
    if (!group) throw new NotFoundException('Ministry group not found');
    await this.groupRepo.softDelete({ id, churchId });
  }

  // ── Memberships ───────────────────────────────────────────────────────────

  async addMember(groupId: string, churchId: string, memberId: string, roleTitle = 'Member') {
    await this._assertGroup(groupId, churchId);
    await this._assertMembers([memberId], churchId);

    const active = await this.membershipRepo.findOne({
      where: { groupId, memberId, churchId, leftAt: IsNull() },
    });
    if (active) throw new BadRequestException('Member is already in this group.');

    return this.membershipRepo.save(
      this.membershipRepo.create({ churchId, groupId, memberId, roleTitle }),
    );
  }

  async removeMember(groupId: string, memberId: string, churchId: string) {
    const membership = await this.membershipRepo.findOne({
      where: { groupId, memberId, churchId, leftAt: IsNull() },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    await this.membershipRepo.update(membership.id, { leftAt: new Date() });
  }

  // ── Attendance ────────────────────────────────────────────────────────────

  async recordAttendance(groupId: string, churchId: string, date: string, presentCount: number, totalCount: number) {
    await this._assertGroup(groupId, churchId);
    if (presentCount > totalCount) {
      throw new BadRequestException('Present count cannot exceed the total.');
    }
    const day = date.slice(0, 10); // the column is a plain DATE

    const existing = await this.attendanceRepo.findOne({ where: { groupId, churchId, date: day } });
    if (existing) {
      await this.attendanceRepo.update(existing.id, { presentCount, totalCount });
      return this.attendanceRepo.findOne({ where: { id: existing.id } });
    }
    return this.attendanceRepo.save(
      this.attendanceRepo.create({ churchId, groupId, date: day, presentCount, totalCount }),
    );
  }
}
