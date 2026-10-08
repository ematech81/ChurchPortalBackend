import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Member } from './member.entity';
import { Church } from '../churches/church.entity';
import { MemberExportDto, MemberExportCountDto } from './dto/member-export.dto';
import { ExportLogService } from '../exports/export-log.service';
import { MemberStatus, UserRole } from '@/types';
import { PASTOR_CHURCH_ROLES } from '../../constants/pastor-roles';
import { toE164, phoneDigitVariants } from '../../common/utils/phone';
import {
  ExportFile, MIME, buildCsv, buildVcf, buildXlsx, safeFilename, toExportFile,
} from '../../common/utils/export-file';

const MAX_ROWS = 20_000;
const humanize = (v?: string | null) => (v ? v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');
const fullName = (m: Member) => [m.firstName, m.lastName].filter(Boolean).join(' ').trim();

@Injectable()
export class MembersExportService {
  constructor(
    @InjectRepository(Member) private readonly repo: Repository<Member>,
    @InjectRepository(Church) private readonly churchRepo: Repository<Church>,
    private readonly exportLog: ExportLogService,
  ) {}

  /**
   * Which churches the caller may export from.
   *  - Senior Pastor: 'all' = whole organisation, a branch id = that branch (must be theirs),
   *    omitted = own church.
   *  - Everyone else: always their own church, whatever they send.
   */
  private async resolveChurchIds(churchId: string, role: string, branchId?: string): Promise<string[]> {
    const isSenior = role === UserRole.SENIOR_PASTOR || role === UserRole.SUPER_ADMIN;
    if (!isSenior || !branchId) return [churchId];

    const branches = await this.churchRepo.find({ where: { parentChurchId: churchId }, select: ['id'] });
    const orgIds = [churchId, ...branches.map((b) => b.id)];
    if (branchId === 'all') return orgIds;
    if (!orgIds.includes(branchId)) throw new BadRequestException('Branch not found.');
    return [branchId];
  }

  private buildQuery(churchIds: string[], f: MemberExportCountDto) {
    const qb = this.repo
      .createQueryBuilder('m')
      .where('m.churchId IN (:...churchIds)', { churchIds });

    const statuses = f.statuses?.length ? f.statuses : ['all'];
    if (statuses.includes('all')) {
      // "Everyone" means the living, current congregation — unless those statuses were asked for by name.
      qb.andWhere('m.status NOT IN (:...gone)', { gone: [MemberStatus.DECEASED, MemberStatus.TRANSFERRED] });
    } else {
      const conds: string[] = [];
      const params: Record<string, unknown> = {};
      const plain = statuses.filter((s) => s !== 'pastor' && s !== 'minister');
      if (plain.length) {
        conds.push('m.status IN (:...plainStatuses)');
        params.plainStatuses = plain;
      }
      if (statuses.includes('pastor')) {
        // Same definition as the Members screen: status pastor OR a pastoral church role
        conds.push('(m.status = :pastorStatus OR m.churchRole IN (:...pastorRoles))');
        params.pastorStatus = MemberStatus.PASTOR;
        params.pastorRoles = PASTOR_CHURCH_ROLES;
      }
      if (statuses.includes('minister')) {
        conds.push('(m.status = :ministerStatus AND (m.churchRole IS NULL OR m.churchRole NOT IN (:...pastorRoles2)))');
        params.ministerStatus = MemberStatus.MINISTER;
        params.pastorRoles2 = PASTOR_CHURCH_ROLES;
      }
      qb.andWhere(`(${conds.join(' OR ')})`, params);
    }

    if (f.flaggedOnly) qb.andWhere(':tag = ANY(m.tags)', { tag: 'Follow-Up Needed' });

    if (f.groupId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM ministry_group_members g
                 WHERE g."memberId" = m.id AND g."groupId" = :groupId
                   AND g."leftAt" IS NULL AND g."deletedAt" IS NULL)`,
        { groupId: f.groupId },
      );
    }
    return qb;
  }

  async count(churchId: string, role: string, f: MemberExportCountDto) {
    const ids = await this.resolveChurchIds(churchId, role, f.branchId);
    const total = await this.buildQuery(ids, f).getCount();
    return { count: total };
  }

  async export(churchId: string, role: string, userId: string, dto: MemberExportDto): Promise<ExportFile & { count: number; skipped: number }> {
    const ids = await this.resolveChurchIds(churchId, role, dto.branchId);
    const members = await this.buildQuery(ids, dto)
      .orderBy('m.firstName', 'ASC')
      .addOrderBy('m.lastName', 'ASC')
      .take(MAX_ROWS + 1)
      .getMany();
    if (members.length > MAX_ROWS) {
      throw new BadRequestException(`That is more than ${MAX_ROWS.toLocaleString()} people. Narrow the selection and try again.`);
    }

    // Only numbers that look like real phone numbers are exported, in one consistent +234… format.
    const valid = members.filter((m) => phoneDigitVariants(m.phone).length > 0);
    const skipped = members.length - valid.length;

    const churchNames = new Map(
      (await this.churchRepo.find({ where: { id: In(ids) }, select: ['id', 'name'] })).map((c) => [c.id, c.name]),
    );

    let file: ExportFile;
    let rowCount: number;
    const stem = `members-${(dto.statuses?.length ? dto.statuses : ['all']).join('-')}`;

    if (dto.format === 'vcf') {
      rowCount = valid.length;
      file = toExportFile(safeFilename(stem, 'vcf'), MIME.vcf, buildVcf(valid.map((m) => ({ name: fullName(m), phone: toE164(m.phone) }))));
    } else if (dto.format === 'txt') {
      // numbers only → one unique number per line; with names → "Name - number"
      if (dto.detail === 'numbers') {
        const unique = [...new Set(valid.map((m) => toE164(m.phone)))];
        rowCount = unique.length;
        file = toExportFile(safeFilename(stem, 'txt'), MIME.txt, unique.join('\r\n') + '\r\n');
      } else {
        rowCount = valid.length;
        file = toExportFile(
          safeFilename(stem, 'txt'),
          MIME.txt,
          valid.map((m) => `${fullName(m)} - ${toE164(m.phone)}`).join('\r\n') + '\r\n',
        );
      }
    } else {
      const { headers, rows, phoneCol } = this.tabular(valid, dto.detail, churchNames);
      rowCount = rows.length;
      file =
        dto.format === 'csv'
          ? toExportFile(safeFilename(stem, 'csv'), MIME.csv, buildCsv(headers, rows, phoneCol))
          : toExportFile(safeFilename(stem, 'xlsx'), MIME.xlsx, await buildXlsx('Members', headers, rows));
    }

    await this.exportLog.record({
      churchId,
      userId,
      kind: 'members',
      format: dto.format,
      rowCount,
      details: {
        detail: dto.detail,
        statuses: dto.statuses ?? ['all'],
        flaggedOnly: !!dto.flaggedOnly,
        groupId: dto.groupId ?? null,
        branchId: dto.branchId ?? null,
        skippedInvalidPhone: skipped,
      },
    });

    return { ...file, count: rowCount, skipped };
  }

  private tabular(members: Member[], detail: MemberExportDto['detail'], churchNames: Map<string, string>) {
    if (detail === 'numbers') {
      const unique = [...new Set(members.map((m) => toE164(m.phone)))];
      return { headers: ['Phone'], rows: unique.map((p) => [p]), phoneCol: [0] };
    }
    if (detail === 'name_number') {
      return {
        headers: ['Name', 'Phone'],
        rows: members.map((m) => [fullName(m), toE164(m.phone)]),
        phoneCol: [1],
      };
    }
    return {
      headers: [
        'Member ID', 'First name', 'Last name', 'Phone', 'Alternate phone', 'Email', 'Gender',
        'Status', 'Department', 'Branch', 'Address', 'City', 'State', 'Date joined',
      ],
      rows: members.map((m) => [
        m.memberId ?? '',
        m.firstName,
        m.lastName,
        toE164(m.phone),
        m.alternatePhone ? toE164(m.alternatePhone) : '',
        m.email ?? '',
        humanize(m.gender),
        humanize(m.status),
        m.departmentName ?? '',
        churchNames.get(m.churchId) ?? '',
        m.address ?? '',
        m.city ?? '',
        m.state ?? '',
        m.membershipDate ? new Date(m.membershipDate).toISOString().slice(0, 10) : '',
      ]),
      phoneCol: [3, 4],
    };
  }
}
