import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { Member } from './member.entity';
import { Church } from '../churches/church.entity';
import { MemberStatus, MembershipCategory, UserRole } from '@/types';
import { PASTOR_CHURCH_ROLES } from '../../constants/pastor-roles';
import { pick } from '../../common/utils/pick';

/**
 * Client-writable member columns. Anything not listed (id, churchId, memberId,
 * createdById, updatedById, deletedAt…) is server-controlled and silently dropped.
 */
const WRITABLE_FIELDS = [
  'firstName', 'lastName', 'middleName', 'gender', 'dateOfBirth', 'maritalStatus', 'occupation',
  'photoUrl', 'phone', 'alternatePhone', 'email', 'address', 'city', 'state', 'preferredLanguage',
  'emergencyContactName', 'emergencyContactPhone', 'status', 'baptismStatus', 'baptismDate',
  'holyGhostBaptism', 'salvationDate', 'membershipDate', 'membershipCategory', 'churchRole',
  'pastoralPosition', 'customRole', 'departmentName', 'departmentRole', 'departmentJoinedDate',
  'parentGuardianName', 'parentGuardianPhone', 'ageRange', 'pickupAuthorization', 'familyId',
  'householdId', 'householdRole', 'cellGroupId', 'tags', 'whatsappOptIn', 'smsOptIn',
  'decisionType', 'invitedBy', 'latitude', 'longitude', 'customFields',
] as const;

const STATUS_FILTERS = new Set<string>([...Object.values(MemberStatus), 'all', 'pastoral']);

/** Escape LIKE wildcards so a search for "100%" or "a_b" is literal. */
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => '\\' + c);

/** One church id, or several (a Senior Pastor looking across all of their branches). */
export type Scope = string | string[];
const ids = (scope: Scope) => (Array.isArray(scope) ? scope : [scope]);

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Member)
    private readonly repo: Repository<Member>,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
  ) {}

  /**
   * Which churches a request may see. A Senior Pastor may ask for the whole organisation
   * (their church + direct branches); everyone else — including Branch Pastors — is
   * always limited to their own church, whatever the client asks for.
   */
  async resolveScope(churchId: string, role: string, wholeOrg: boolean): Promise<Scope> {
    if (!wholeOrg || (role !== UserRole.SENIOR_PASTOR && role !== UserRole.SUPER_ADMIN)) return churchId;
    const branches = await this.churchRepo.find({ where: { parentChurchId: churchId }, select: ['id'] });
    return [churchId, ...branches.map((b) => b.id)];
  }

  // ── Pastor query ──────────────────────────────────────────────────────────────
  // A member is a pastor if their status is 'pastor' OR their churchRole is one
  // of the canonical pastoral roles. No other field qualifies them.
  private pastorQb(scope: Scope) {
    return this.repo
      .createQueryBuilder('m')
      .where('m.churchId IN (:...scopeIds)', { scopeIds: ids(scope) })
      .andWhere(
        '(m.status = :pStatus OR m.churchRole IN (:...pRoles))',
        { pStatus: MemberStatus.PASTOR, pRoles: PASTOR_CHURCH_ROLES },
      );
  }

  // ── Minister query ────────────────────────────────────────────────────────────
  // A minister has status='minister' and does NOT also hold a pastoral church role.
  // Pastors and Ministers are mutually exclusive tabs.
  private ministerQb(scope: Scope) {
    return this.repo
      .createQueryBuilder('m')
      .where('m.churchId IN (:...scopeIds)', { scopeIds: ids(scope) })
      .andWhere('m.status = :mStatus', { mStatus: MemberStatus.MINISTER })
      .andWhere(
        '(m.churchRole IS NULL OR m.churchRole NOT IN (:...pRoles))',
        { pRoles: PASTOR_CHURCH_ROLES },
      );
  }

  // ── findAll ───────────────────────────────────────────────────────────────────
  async findAll(scope: Scope, search?: string, status?: string, limit?: number) {
    if (status && !STATUS_FILTERS.has(status)) throw new BadRequestException('Unknown status filter.');
    const take = Math.min(Number.isFinite(limit) && limit! > 0 ? limit! : 100, 500);
    const s = search?.trim() ? escapeLike(search.trim()) : undefined;
    const searchClause = s
      ? '(m.firstName ILIKE :s OR m.lastName ILIKE :s OR m.phone ILIKE :s OR m.email ILIKE :s)'
      : null;

    if (status === 'pastor' || status === 'pastoral') {
      const qb = this.pastorQb(scope).orderBy('m.firstName', 'ASC').take(take);
      if (searchClause) qb.andWhere(searchClause, { s: `%${s}%` });
      return qb.getMany();
    }

    if (status === 'minister') {
      const qb = this.ministerQb(scope).orderBy('m.firstName', 'ASC').take(take);
      if (searchClause) qb.andWhere(searchClause, { s: `%${s}%` });
      return qb.getMany();
    }

    const statusFilter = status && status !== 'all' ? (status as MemberStatus) : undefined;

    if (s) {
      const base = { churchId: In(ids(scope)), ...(statusFilter ? { status: statusFilter } : {}) };
      return this.repo.find({
        where: [
          { ...base, firstName: ILike(`%${s}%`) },
          { ...base, lastName:  ILike(`%${s}%`) },
          { ...base, phone:     ILike(`%${s}%`) },
          { ...base, email:     ILike(`%${s}%`) },
          { ...base, memberId:  ILike(`%${s}%`) },
        ],
        order: { firstName: 'ASC' },
        take,
      });
    }

    return this.repo.find({
      where: { churchId: In(ids(scope)), ...(statusFilter ? { status: statusFilter } : {}) },
      order: { firstName: 'ASC' },
      take,
    });
  }

  // ── count ─────────────────────────────────────────────────────────────────────
  async count(scope: Scope, status?: string) {
    if (status && !STATUS_FILTERS.has(status)) throw new BadRequestException('Unknown status filter.');
    if (status === 'pastor' || status === 'pastoral') return this.pastorQb(scope).getCount();
    if (status === 'minister') return this.ministerQb(scope).getCount();
    const statusFilter = status && status !== 'all' ? (status as MemberStatus) : undefined;
    return this.repo.count({ where: { churchId: In(ids(scope)), ...(statusFilter ? { status: statusFilter } : {}) } });
  }

  // ── countPastors (dashboard stat) ────────────────────────────────────────────
  async countPastors(scope: Scope): Promise<number> {
    return this.pastorQb(scope).getCount();
  }

  // ── findByIdOrFail ────────────────────────────────────────────────────────────
  async findByIdOrFail(id: string, scope: Scope) {
    const member = await this.repo.findOne({ where: { id, churchId: In(ids(scope)) } });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  // ── create ────────────────────────────────────────────────────────────────────
  async create(churchId: string, body: Record<string, unknown>, userId: string) {
    const data = pick<Member>(body, WRITABLE_FIELDS);
    for (const f of ['firstName', 'lastName', 'phone'] as const) {
      if (typeof data[f] !== 'string' || !(data[f] as string).trim()) {
        throw new BadRequestException(`${f} is required.`);
      }
    }
    if (
      data.churchRole &&
      PASTOR_CHURCH_ROLES.includes(data.churchRole as string) &&
      data.status !== MemberStatus.PASTOR
    ) {
      data.status = MemberStatus.PASTOR;
    }
    const memberId = await this._generateMemberId(churchId);
    return this.repo.save(
      this.repo.create({ ...data, churchId, memberId, createdById: userId, updatedById: userId }),
    );
  }

  // ── update ────────────────────────────────────────────────────────────────────
  async update(id: string, scope: Scope, body: Record<string, unknown>, userId: string) {
    const data = pick<Member>(body, WRITABLE_FIELDS);
    const existing = await this.findByIdOrFail(id, scope); // 404 before touching anything
    const churchId = existing.churchId;
    if (
      data.churchRole &&
      PASTOR_CHURCH_ROLES.includes(data.churchRole as string) &&
      data.status !== MemberStatus.PASTOR
    ) {
      data.status = MemberStatus.PASTOR;
    }
    for (const f of ['firstName', 'lastName', 'phone'] as const) {
      if (f in data && (typeof data[f] !== 'string' || !(data[f] as string).trim())) {
        throw new BadRequestException(`${f} cannot be empty.`);
      }
    }
    await this.repo.update({ id, churchId }, { ...data, updatedById: userId } as any);
    return this.findByIdOrFail(id, churchId);
  }

  // ── syncPastoralRecords ───────────────────────────────────────────────────────
  // Promotes any record with a pastoral churchRole to status='pastor'.
  // Covers the edge case where status='minister' + churchRole='pastor'.
  async syncPastoralRecords(churchId: string): Promise<{ fixed: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Member)
      .set({ status: MemberStatus.PASTOR })
      .where('churchId = :churchId', { churchId })
      .andWhere('churchRole IN (:...roles)', { roles: PASTOR_CHURCH_ROLES })
      .andWhere('status != :pStatus', { pStatus: MemberStatus.PASTOR })
      .execute();

    return { fixed: result.affected ?? 0 };
  }

  // ── cleanupMislabeled ─────────────────────────────────────────────────────────
  // Finds records tagged status='pastor' that have no pastoral church role,
  // no pastoral position, and were not registered via the pastor registration form.
  // These were mis-tagged via the general member form.
  //
  // dryRun=true (default): returns what would change, no writes.
  // dryRun=false: executes the reset.
  async cleanupMislabeled(
    churchId: string,
    dryRun = true,
  ): Promise<{ wouldFix: number; records: any[] }> {
    const mislabeled = await this.repo
      .createQueryBuilder('m')
      .where('m.churchId = :churchId', { churchId })
      .andWhere('m.status = :status', { status: MemberStatus.PASTOR })
      .andWhere('(m.churchRole IS NULL OR m.churchRole NOT IN (:...roles))', { roles: PASTOR_CHURCH_ROLES })
      .andWhere('m.pastoralPosition IS NULL')
      .andWhere(
        '(m.membershipCategory IS NULL OR m.membershipCategory != :cat)',
        { cat: MembershipCategory.PASTOR_REGISTRATION },
      )
      .getMany();

    const records = mislabeled.map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`,
      phone: m.phone,
      currentStatus: m.status,
      churchRole: m.churchRole ?? null,
      membershipCategory: m.membershipCategory ?? null,
      willBecome: m.membershipCategory ? MemberStatus.MEMBER : MemberStatus.FIRST_TIMER,
    }));

    if (dryRun || mislabeled.length === 0) {
      return { wouldFix: mislabeled.length, records };
    }

    for (const m of mislabeled) {
      const newStatus = m.membershipCategory ? MemberStatus.MEMBER : MemberStatus.FIRST_TIMER;
      await this.repo.update({ id: m.id, churchId }, { status: newStatus });
    }

    return { wouldFix: mislabeled.length, records };
  }

  // ── softDelete ────────────────────────────────────────────────────────────────
  // churchId scoping already enforces branch isolation: branch pastors can only
  // delete members whose churchId matches their own JWT churchId claim.
  async softDelete(
    id: string,
    scope: Scope,
    caller: { userId: string; role: string },
  ) {
    const member = await this.findByIdOrFail(id, scope);
    const churchId = member.churchId;

    await this.repo.softDelete({ id, churchId });

    // Structured audit log — replace with a DB audit table if needed later
    console.log(JSON.stringify({
      event: 'MEMBER_SOFT_DELETED',
      memberId: id,
      memberName: `${member.firstName} ${member.lastName}`,
      deletedByUserId: caller.userId,
      deletedByRole: caller.role,
      churchId,
      timestamp: new Date().toISOString(),
    }));
  }

  // ── _generateMemberId ─────────────────────────────────────────────────────────
  // Next number after the highest ever issued this year — counting soft-deleted rows,
  // so deleting a member never causes the next one to reuse an existing ID.
  private async _generateMemberId(churchId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `KP-${year}-`;
    const row = await this.repo
      .createQueryBuilder('m')
      .withDeleted()
      .select(`MAX(CAST(SUBSTRING(m.memberId FROM '[0-9]+$') AS INTEGER))`, 'max')
      .where('m.churchId = :churchId AND m.memberId LIKE :like', { churchId, like: `${prefix}%` })
      .getRawOne();
    const next = (parseInt(row?.max ?? '0', 10) || 0) + 1;
    return `${prefix}${String(next).padStart(5, '0')}`;
  }
}
