import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Church } from './church.entity';
import { Member } from '../members/member.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '@/types';
import { CreateChurchDto } from './dto/create-church.dto';

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

  async update(id: string, data: Partial<Church>) {
    await this.repo.update(id, data as any);
    return this.findByIdOrFail(id);
  }

  async createForUser(userId: string, dto: CreateChurchDto) {
    const slug = this._slugify(dto.name);
    const role = dto.parentChurchId ? UserRole.BRANCH_PASTOR : UserRole.SENIOR_PASTOR;

    const church = await this.create({
      name: dto.name, slug,
      denomination: dto.denomination ?? null,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      logoUrl: dto.logoUrl ?? null,
      parentChurchId: dto.parentChurchId ?? null,
    });

    await this.usersService.setChurchAndRole(userId, church.id, role);
    const user = await this.usersService.findById(userId);
    const tokens = await this.authService.issueTokens(user!);
    return { church, ...tokens };
  }

  async createBranch(parentChurchId: string, dto: { name: string; address?: string; city?: string; phone?: string }) {
    const slug = this._slugify(dto.name);
    return this.create({
      name: dto.name, slug,
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
      .where('m.churchId IN (:...ids) AND m.status = :status', { ids, status: 'worker' })
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
    if (branchIds.length === 0) return [];

    return this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.firstName', 'u.lastName', 'u.email', 'u.phone', 'u.churchId', 'u.role', 'u.avatarUrl'])
      .where('u.churchId IN (:...ids) AND u.role = :role', { ids: branchIds, role: UserRole.BRANCH_PASTOR })
      .orderBy('u.firstName', 'ASC')
      .getMany();
  }

  async updateBranch(id: string, parentChurchId: string, data: Partial<Church>) {
    const branch = await this.repo.findOne({ where: { id, parentChurchId } });
    if (!branch) throw new NotFoundException('Branch not found');
    await this.repo.update(id, data as any);
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

    await this.repo.remove(branch);
  }

  async assignPastorToBranch(parentChurchId: string, pastorId: string, branchId: string) {
    const branchIds = await this.getBranchIds(parentChurchId);
    if (!branchIds.includes(branchId)) throw new NotFoundException('Branch not found');

    const pastor = await this.userRepo.findOne({ where: { id: pastorId } });
    if (!pastor) throw new NotFoundException('Pastor not found');

    await this.userRepo.update(pastorId, { churchId: branchId } as any);
    const branch = await this.repo.findOne({ where: { id: branchId } });
    return { success: true, branchName: branch?.name };
  }

  /**
   * Promotes a Member-source pastor to a real Branch Pastor User account.
   * This is what enables phone OTP login for member-registered pastors.
   *
   * Flow:
   *  1. Validate branch belongs to this church
   *  2. Load the Member record
   *  3. Find or create a User with BRANCH_PASTOR role using the member's phone
   *  4. Update the Member's status and churchId to match
   */
  async promoteMemberToBranchPastor(parentChurchId: string, memberId: string, branchId: string) {
    // Verify branch
    const branchIds = await this.getBranchIds(parentChurchId);
    if (!branchIds.includes(branchId)) throw new NotFoundException('Branch not found');

    const branch = await this.repo.findOneOrFail({ where: { id: branchId } });

    // Load member
    const member = await this.memberRepo.findOne({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');
    if (!member.phone) {
      throw new BadRequestException(
        'This pastor has no phone number on file. A phone number is required for Branch Pastor login access.',
      );
    }

    // Find or create a User account with this phone number
    const existing = await this.userRepo.findOne({ where: { phone: member.phone } });
    let userId: string;

    if (existing) {
      // Update existing user to branch pastor
      await this.userRepo.update(existing.id, {
        role: UserRole.BRANCH_PASTOR,
        churchId: branchId,
        firstName: existing.firstName || member.firstName,
        lastName:  existing.lastName  || member.lastName,
      } as any);
      userId = existing.id;
    } else {
      // Create a new User account — this enables phone OTP login.
      // Branch Pastors authenticate via phone OTP only, so the passwordHash is
      // set to a bcrypt hash of a random token they can never know or use.
      const randomToken = Math.random().toString(36) + Date.now().toString(36);
      const passwordHash = await bcrypt.hash(randomToken, 12);

      const newUser = this.userRepo.create({
        firstName:    member.firstName,
        lastName:     member.lastName,
        phone:        member.phone,
        role:         UserRole.BRANCH_PASTOR,
        churchId:     branchId,
        passwordHash,
      } as any);
      if (member.email) (newUser as any).email = member.email;
      (newUser as any).isEmailVerified = true;
      const saved = (await this.userRepo.save(newUser)) as unknown as User;
      userId = saved.id;
    }

    // Sync member record to reflect the promotion
    await this.memberRepo.update(memberId, {
      churchId:  branchId,
      status:    'pastor' as any,
      churchRole:'branch_pastor' as any,
    });

    return {
      success: true,
      userId,
      branchName: branch.name,
      message: `${member.firstName} ${member.lastName} can now log in as Branch Pastor of ${branch.name} using their phone number.`,
    };
  }

  async getBranchIds(parentChurchId: string): Promise<string[]> {
    const branches = await this.repo.find({ where: { parentChurchId } });
    return [parentChurchId, ...branches.map((b) => b.id)];
  }

  private _slugify(name: string): string {
    return (
      name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
      '-' + Date.now().toString(36)
    );
  }
}
