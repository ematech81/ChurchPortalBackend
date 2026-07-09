import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Member } from './member.entity';
import { MemberStatus, MembershipCategory } from '@/types';
import { PASTOR_CHURCH_ROLES } from '../../constants/pastor-roles';

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Member)
    private readonly repo: Repository<Member>,
  ) {}

  // ── Pastor query ──────────────────────────────────────────────────────────────
  // A member is a pastor if their status is 'pastor' OR their churchRole is one
  // of the canonical pastoral roles. No other field qualifies them.
  private pastorQb(churchId: string) {
    return this.repo
      .createQueryBuilder('m')
      .where('m.churchId = :churchId', { churchId })
      .andWhere(
        '(m.status = :pStatus OR m.churchRole IN (:...pRoles))',
        { pStatus: MemberStatus.PASTOR, pRoles: PASTOR_CHURCH_ROLES },
      );
  }

  // ── Minister query ────────────────────────────────────────────────────────────
  // A minister has status='minister' and does NOT also hold a pastoral church role.
  // Pastors and Ministers are mutually exclusive tabs.
  private ministerQb(churchId: string) {
    return this.repo
      .createQueryBuilder('m')
      .where('m.churchId = :churchId', { churchId })
      .andWhere('m.status = :mStatus', { mStatus: MemberStatus.MINISTER })
      .andWhere(
        '(m.churchRole IS NULL OR m.churchRole NOT IN (:...pRoles))',
        { pRoles: PASTOR_CHURCH_ROLES },
      );
  }

  // ── findAll ───────────────────────────────────────────────────────────────────
  async findAll(churchId: string, search?: string, status?: string, limit = 100) {
    const take = Math.min(limit, 500);
    const s = search?.trim();
    const searchClause = s
      ? '(m.firstName ILIKE :s OR m.lastName ILIKE :s OR m.phone ILIKE :s OR m.email ILIKE :s)'
      : null;

    if (status === 'pastor' || status === 'pastoral') {
      const qb = this.pastorQb(churchId).orderBy('m.firstName', 'ASC').take(take);
      if (searchClause) qb.andWhere(searchClause, { s: `%${s}%` });
      return qb.getMany();
    }

    if (status === 'minister') {
      const qb = this.ministerQb(churchId).orderBy('m.firstName', 'ASC').take(take);
      if (searchClause) qb.andWhere(searchClause, { s: `%${s}%` });
      return qb.getMany();
    }

    const statusFilter = status && status !== 'all' ? (status as MemberStatus) : undefined;

    if (s) {
      const base = { churchId, ...(statusFilter ? { status: statusFilter } : {}) };
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
      where: { churchId, ...(statusFilter ? { status: statusFilter } : {}) },
      order: { firstName: 'ASC' },
      take,
    });
  }

  // ── count ─────────────────────────────────────────────────────────────────────
  async count(churchId: string, status?: string) {
    if (status === 'pastor' || status === 'pastoral') return this.pastorQb(churchId).getCount();
    if (status === 'minister') return this.ministerQb(churchId).getCount();
    const statusFilter = status && status !== 'all' ? (status as MemberStatus) : undefined;
    return this.repo.count({ where: { churchId, ...(statusFilter ? { status: statusFilter } : {}) } });
  }

  // ── countPastors (dashboard stat) ────────────────────────────────────────────
  async countPastors(churchId: string): Promise<number> {
    return this.pastorQb(churchId).getCount();
  }

  // ── findByIdOrFail ────────────────────────────────────────────────────────────
  async findByIdOrFail(id: string, churchId: string) {
    const member = await this.repo.findOne({ where: { id, churchId } });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  // ── create ────────────────────────────────────────────────────────────────────
  async create(churchId: string, data: Partial<Member>) {
    if (
      data.churchRole &&
      PASTOR_CHURCH_ROLES.includes(data.churchRole as string) &&
      data.status !== MemberStatus.PASTOR
    ) {
      data.status = MemberStatus.PASTOR;
    }
    const memberId = await this._generateMemberId(churchId);
    return this.repo.save(this.repo.create({ ...data, churchId, memberId }));
  }

  // ── update ────────────────────────────────────────────────────────────────────
  async update(id: string, churchId: string, data: Partial<Member>) {
    if (
      data.churchRole &&
      PASTOR_CHURCH_ROLES.includes(data.churchRole as string) &&
      data.status !== MemberStatus.PASTOR
    ) {
      const existing = await this.repo.findOne({ where: { id, churchId } });
      if (existing && existing.status !== MemberStatus.PASTOR) {
        data.status = MemberStatus.PASTOR;
      }
    }
    await this.repo.update({ id, churchId }, data as any);
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
    churchId: string,
    caller: { userId: string; role: string },
  ) {
    const member = await this.repo.findOne({ where: { id, churchId } });
    if (!member) throw new NotFoundException('Member not found');

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
  private async _generateMemberId(churchId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.repo.count({ where: { churchId } });
    return `KP-${year}-${String(count + 1).padStart(5, '0')}`;
  }
}
