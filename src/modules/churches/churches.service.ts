import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import { Church } from './church.entity';
import { Member } from '../members/member.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { UserRole, MemberStatus, ChurchRole } from '@/types';
import { CreateChurchDto } from './dto/create-church.dto';
import { UpdateChurchDto, CreateBranchDto, UpdateBranchDto } from './dto/church.dto';
import { phoneDigitVariants } from '../../common/utils/phone';
import { BCRYPT_ROUNDS } from '../../common/utils/hash';

/** Existing accounts that must never be converted into a branch pastor by phone match. */
const PROTECTED_ROLES: string[] = [UserRole.SUPER_ADMIN, UserRole.SENIOR_PASTOR, UserRole.ADMIN_PASTOR];

@Injectable()
export class ChurchesService {
  constructor(
    @InjectRepository(Church) private readonly repo: Repository<Church>,
    @InjectRepository(Member) private readonly memberRepo: Repository<Member>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string) {
    const church = await this.findById(id);
    if (!church) throw new NotFoundException('Church not found');
    return church;
  }

  create(data: Partial<Church>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: UpdateChurchDto) {
    if (Object.keys(data).length) await this.repo.update(id, data as any);
    return this.findByIdOrFail(id);
  }

  /**
   * Onboarding step 1. Idempotent: if the caller already heads a church, this
   * updates it instead of creating a duplicate (the mobile flow can be retried).
   * The caller's role is derived here from server state, never from the request.
   */
  async createForUser(userId: string, dto: CreateChurchDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();

    if (user.churchId) {
      if (user.role !== UserRole.SENIOR_PASTOR && user.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Your account already belongs to a church.');
      }
      const church = await this.update(user.churchId, {
        name: dto.name,
        denomination: dto.denomination,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        logoUrl: dto.logoUrl,
      });
      return { church, ...(await this.authService.issueTokens(user)) };
    }

    if (user.role !== UserRole.MEMBER && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('This account cannot create a church.');
    }

    const church = await this.create({
      name: dto.name,
      slug: this._slugify(dto.name),
      denomination: dto.denomination ?? null,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      logoUrl: dto.logoUrl ?? null,
      parentChurchId: null,
    });

    await this.usersService.setChurchAndRole(
      userId,
      church.id,
      user.role === UserRole.SUPER_ADMIN ? UserRole.SUPER_ADMIN : UserRole.SENIOR_PASTOR,
    );
    const fresh = await this.usersService.findById(userId);
    return { church, ...(await this.authService.issueTokens(fresh!)) };
  }

  createBranch(parentChurchId: string, dto: CreateBranchDto) {
    return this.create({
      name: dto.name.trim(),
      slug: this._slugify(dto.name),
      address: dto.address ?? null,
      city: dto.city ?? null,
      phone: dto.phone ?? null,
      parentChurchId,
    });
  }

  listBranches(parentChurchId: string) {
    return this.repo.find({ where: { parentChurchId }, order: { name: 'ASC' } });
  }

  async listBranchesWithStats(parentChurchId: string) {
    const branches = await this.listBranches(parentChurchId);
    if (!branches.length) return [];

    const ids = branches.map((b) => b.id);

    // Batch: member count per branch
    const memberCounts = await this.memberRepo
      .createQueryBuilder('m')
      .select('m.churchId', 'churchId')
      .addSelect('COUNT(m.id)', 'count')
      .where('m.churchId IN (:...ids)', { ids })
      .groupBy('m.churchId')
      .getRawMany();

    const countMap = new Map(memberCounts.map((r) => [r.churchId, parseInt(r.count, 10)]));

    // Batch: worker count per branch
    const workerCounts = await this.memberRepo
      .createQueryBuilder('m')
      .select('m.churchId', 'cid')
      .addSelect('COUNT(m.id)', 'cnt')
      .where('m.churchId IN (:...ids) AND m.status = :status', { ids, status: MemberStatus.WORKER })
      .groupBy('m.churchId')
      .getRawMany();

    const workerMap = new Map(workerCounts.map((r) => [r.cid, parseInt(r.cnt, 10)]));

    // Batch: one pastor per branch
    const pastors = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.firstName', 'u.lastName', 'u.email', 'u.phone', 'u.churchId', 'u.avatarUrl'])
      .where('u.churchId IN (:...ids) AND u.role = :role', { ids, role: UserRole.BRANCH_PASTOR })
      .getMany();

    const pastorMap = new Map(pastors.map((p) => [p.churchId!, p]));

    return branches.map((b) => ({
      ...b,
      memberCount: countMap.get(b.id) ?? 0,
      workerCount: workerMap.get(b.id) ?? 0,
      pastor: pastorMap.get(b.id) ?? null,
    }));
  }

  async getBranchPastors(parentChurchId: string) {
    const branchIds = await this.getBranchIds(parentChurchId);

    return this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.firstName', 'u.lastName', 'u.email', 'u.phone', 'u.churchId', 'u.role', 'u.avatarUrl'])
      .where('u.churchId IN (:...ids) AND u.role = :role', { ids: branchIds, role: UserRole.BRANCH_PASTOR })
      .orderBy('u.firstName', 'ASC')
      .getMany();
  }

  async updateBranch(id: string, parentChurchId: string, data: UpdateBranchDto) {
    const branch = await this.repo.findOne({ where: { id, parentChurchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    if (Object.keys(data).length) await this.repo.update(id, data as any);
    return this.findByIdOrFail(id);
  }

  async deleteBranch(id: string, parentChurchId: string) {
    const branch = await this.repo.findOne({ where: { id, parentChurchId } });
    if (!branch) throw new NotFoundException('Branch not found');

    const memberCount = await this.memberRepo.count({ where: { churchId: id } });
    if (memberCount > 0) {
      throw new BadRequestException(
        `Cannot delete a branch with ${memberCount} member(s). Reassign members first.`,
      );
    }
    const subBranches = await this.repo.count({ where: { parentChurchId: id } });
    if (subBranches > 0) {
      throw new BadRequestException('Cannot delete a branch that has its own sub-branches.');
    }

    // Detach (not delete) the branch's pastor accounts so nobody keeps a token into a dead church.
    await this.userRepo.update({ churchId: id }, { churchId: null } as any);
    await this.repo.softRemove(branch);
  }

  /** Moves an existing Branch Pastor (a User) to another branch of the same organisation. */
  async assignPastorToBranch(parentChurchId: string, pastorId: string, branchId: string) {
    const branchIds = await this.getBranchIds(parentChurchId);
    if (branchId === parentChurchId || !branchIds.includes(branchId)) {
      throw new NotFoundException('Branch not found');
    }

    // Tenant scoping: the pastor must already belong to THIS organisation.
    const pastor = await this.userRepo.findOne({
      where: { id: pastorId, role: UserRole.BRANCH_PASTOR, churchId: In(branchIds) },
    });
    if (!pastor) throw new NotFoundException('Pastor not found');

    await this.userRepo.update(pastorId, { churchId: branchId });
    const branch = await this.repo.findOne({ where: { id: branchId } });
    return { success: true, branchName: branch?.name };
  }

  /**
   * Promotes a Member-source pastor to a real Branch Pastor User account.
   * This is what enables phone OTP login for member-registered pastors.
   */
  async promoteMemberToBranchPastor(parentChurchId: string, memberId: string, branchId: string) {
    const branchIds = await this.getBranchIds(parentChurchId);
    if (branchId === parentChurchId || !branchIds.includes(branchId)) {
      throw new NotFoundException('Branch not found');
    }
    const branch = await this.repo.findOneOrFail({ where: { id: branchId } });

    // Tenant scoping: the member must belong to this organisation.
    const member = await this.memberRepo.findOne({ where: { id: memberId, churchId: In(branchIds) } });
    if (!member) throw new NotFoundException('Member not found');
    if (!phoneDigitVariants(member.phone).length) {
      throw new BadRequestException(
        'This pastor has no valid phone number on file. A phone number is required for Branch Pastor login access.',
      );
    }

    // Look across ALL churches: a phone number identifies a person, and we must not
    // silently take over an account that belongs to someone else's tenant.
    const existing = await this.usersService.findByPhone(member.phone);
    let userId: string;

    if (existing) {
      const sameOrg = !!existing.churchId && branchIds.includes(existing.churchId);
      if (!sameOrg || PROTECTED_ROLES.includes(existing.role)) {
        throw new ConflictException(
          'This phone number already belongs to another registered account, so it cannot be made a Branch Pastor. Use a different number or contact support.',
        );
      }
      await this.userRepo.update(existing.id, {
        role: UserRole.BRANCH_PASTOR,
        churchId: branchId,
        firstName: existing.firstName || member.firstName,
        lastName: existing.lastName || member.lastName,
      });
      userId = existing.id;
    } else {
      // Branch Pastors sign in by phone OTP only. The password is a random value nobody knows.
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

      // Email is NOT NULL + unique. Use the member's if it is free, else a placeholder.
      const memberEmail = member.email?.trim().toLowerCase();
      const emailTaken = memberEmail ? !!(await this.usersService.findByEmail(memberEmail)) : true;
      const email = memberEmail && !emailTaken ? memberEmail : `pastor-${member.id}@portal.internal`;

      const saved = await this.userRepo.save(
        this.userRepo.create({
          firstName: member.firstName,
          lastName: member.lastName,
          phone: member.phone,
          email,
          role: UserRole.BRANCH_PASTOR,
          churchId: branchId,
          passwordHash,
          isEmailVerified: true,
        }),
      );
      userId = saved.id;
    }

    // Sync member record to reflect the promotion
    await this.memberRepo.update(
      { id: memberId, churchId: In(branchIds) },
      { churchId: branchId, status: MemberStatus.PASTOR, churchRole: ChurchRole.BRANCH_PASTOR },
    );

    return {
      success: true,
      userId,
      branchName: branch.name,
      message: `${member.firstName} ${member.lastName} can now log in as Branch Pastor of ${branch.name} using their phone number.`,
    };
  }

  /** The caller's own church plus its direct branches. */
  async getBranchIds(parentChurchId: string): Promise<string[]> {
    const branches = await this.repo.find({ where: { parentChurchId } });
    return [parentChurchId, ...branches.map((b) => b.id)];
  }

  private _slugify(name: string): string {
    const base = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
    return `${base || 'church'}-${randomBytes(4).toString('hex')}`;
  }
}
