import {
  Injectable, ForbiddenException, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Member } from '../members/member.entity';
import { User } from '../users/user.entity';
import { UserRole } from '@/types';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(Member) private readonly memberRepo: Repository<Member>,
    @InjectRepository(User)   private readonly userRepo:   Repository<User>,
  ) {}

  async wipeMembersCheck(callerId: string, password: string, dryRun: boolean) {
    if (process.env.ENABLE_MAINTENANCE_ENDPOINTS !== 'true') {
      throw new ForbiddenException(
        'Maintenance endpoints are disabled. Set ENABLE_MAINTENANCE_ENDPOINTS=true to enable.',
      );
    }

    // Re-verify caller's password as a second confirmation step
    const caller = await this.userRepo.findOne({ where: { id: callerId } });
    if (!caller) throw new NotFoundException('Caller account not found.');

    const passwordMatch = await bcrypt.compare(password, caller.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Incorrect password. Wipe cancelled.');

    // Find all members that would be deleted.
    // We preserve nothing — the Senior Pastor has a User record, not a Member record.
    const targets = await this.memberRepo
      .createQueryBuilder('m')
      .withDeleted()               // include already-soft-deleted rows
      .where('m.churchId = :cid', { cid: caller.churchId })
      .select(['m.id', 'm.firstName', 'm.lastName', 'm.phone', 'm.status', 'm.createdAt'])
      .getMany();

    if (dryRun) {
      return {
        dryRun: true,
        wouldDelete: targets.length,
        sample: targets.slice(0, 20).map((m) => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          phone: m.phone,
          status: m.status,
        })),
        message: `Dry run complete. ${targets.length} member record(s) would be permanently deleted.`,
      };
    }

    // Hard-delete all member records for this church
    if (targets.length > 0) {
      const ids = targets.map((m) => m.id);
      await this.memberRepo
        .createQueryBuilder()
        .delete()
        .from(Member)
        .where('id IN (:...ids)', { ids })
        .execute();
    }

    console.log(JSON.stringify({
      event: 'MAINTENANCE_WIPE_MEMBERS',
      executedBy: callerId,
      churchId: caller.churchId,
      recordsDeleted: targets.length,
      timestamp: new Date().toISOString(),
    }));

    return {
      dryRun: false,
      deleted: targets.length,
      message: `${targets.length} member record(s) permanently deleted. Senior Pastor account preserved.`,
    };
  }
}
