import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecord } from './attendance-record.entity';
import { ServiceEvent } from './service-event.entity';
import { Member } from '../members/member.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly recordRepo: Repository<AttendanceRecord>,
    @InjectRepository(ServiceEvent)
    private readonly eventRepo: Repository<ServiceEvent>,
    @InjectRepository(Member)
    private readonly memberRepo: Repository<Member>,
  ) {}

  // ── Service Events ─────────────────────────────────────────────────────────

  createEvent(churchId: string, data: Partial<ServiceEvent>) {
    return this.eventRepo.save(this.eventRepo.create({ ...data, churchId }));
  }

  async getEvents(churchId: string) {
    const events = await this.eventRepo.find({
      where: { churchId },
      order: { date: 'DESC' },
    });

    const counts = await this.recordRepo
      .createQueryBuilder('r')
      .select('r.serviceEventId', 'eventId')
      .addSelect('COUNT(r.id)', 'count')
      .where('r.churchId = :churchId', { churchId })
      .groupBy('r.serviceEventId')
      .getRawMany();

    const countMap = new Map(counts.map((c) => [c.eventId, parseInt(c.count, 10)]));

    return events.map((e) => ({ ...e, attendanceCount: countMap.get(e.id) ?? 0 }));
  }

  async getEventById(churchId: string, eventId: string) {
    const event = await this.eventRepo.findOne({ where: { id: eventId, churchId } });
    if (!event) throw new NotFoundException('Service event not found');
    return event;
  }

  async deleteEvent(churchId: string, eventId: string) {
    const event = await this.getEventById(churchId, eventId);
    await this.recordRepo.delete({ churchId, serviceEventId: event.id });
    await this.eventRepo.remove(event);
  }

  // ── Attendance Records ──────────────────────────────────────────────────────

  async checkIn(churchId: string, serviceEventId: string, memberId: string, checkedInBy: string) {
    const existing = await this.recordRepo.findOne({ where: { churchId, serviceEventId, memberId } });
    if (existing) throw new ConflictException('Member is already checked in for this service');
    return this.recordRepo.save(
      this.recordRepo.create({ churchId, serviceEventId, memberId, checkedInAt: new Date(), checkedInBy }),
    );
  }

  async checkInVisitor(churchId: string, serviceEventId: string, visitorName: string, checkedInBy: string) {
    return this.recordRepo.save(
      this.recordRepo.create({ churchId, serviceEventId, visitorName, checkedInAt: new Date(), checkedInBy }),
    );
  }

  async uncheckIn(churchId: string, serviceEventId: string, recordId: string) {
    const record = await this.recordRepo.findOne({ where: { id: recordId, churchId, serviceEventId } });
    if (!record) throw new NotFoundException('Attendance record not found');
    await this.recordRepo.remove(record);
  }

  async getAttendanceForEvent(churchId: string, serviceEventId: string) {
    const records = await this.recordRepo.find({
      where: { churchId, serviceEventId },
      order: { checkedInAt: 'ASC' },
    });

    const memberIds = records.map((r) => r.memberId).filter(Boolean) as string[];
    const members = memberIds.length ? await this.memberRepo.findByIds(memberIds) : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    return records.map((r) => ({
      id: r.id,
      checkedInAt: r.checkedInAt,
      visitorName: r.visitorName,
      member: r.memberId ? memberMap.get(r.memberId) ?? null : null,
    }));
  }

  async isCheckedIn(churchId: string, serviceEventId: string, memberId: string) {
    const record = await this.recordRepo.findOne({ where: { churchId, serviceEventId, memberId } });
    return { checkedIn: !!record, recordId: record?.id ?? null };
  }

  // ── Service Report ──────────────────────────────────────────────────────────

  async getEventReport(churchId: string, eventId: string) {
    const [event, totalMembers] = await Promise.all([
      this.getEventById(churchId, eventId),
      this.memberRepo.count({ where: { churchId } }),
    ]);

    const records = await this.getAttendanceForEvent(churchId, eventId);
    const memberRecords = records.filter((r) => r.member);
    const visitorRecords = records.filter((r) => !r.member);

    // Gender distribution from checked-in members
    const genderCounts = { male: 0, female: 0 };
    memberRecords.forEach((r) => {
      if ((r.member as any)?.gender === 'male') genderCounts.male++;
      else if ((r.member as any)?.gender === 'female') genderCounts.female++;
    });

    // Previous event of same type for % change
    const prevEvent = await this.eventRepo
      .createQueryBuilder('e')
      .where('e.churchId = :churchId AND e.type = :type AND e.id != :eventId AND e.date < :date', {
        churchId, type: event.type, eventId, date: event.date,
      })
      .orderBy('e.date', 'DESC')
      .getOne();

    let previousCount: number | null = null;
    if (prevEvent) {
      previousCount = await this.recordRepo.count({ where: { churchId, serviceEventId: prevEvent.id } });
    }

    const changePercent = previousCount !== null && previousCount > 0
      ? Math.round(((records.length - previousCount) / previousCount) * 1000) / 10
      : null;

    // Absent regulars — members who attended at least one of the last 2 same-type services
    // but are NOT checked in to this one
    const checkedInIds = new Set(memberRecords.map((r) => (r.member as any)?.id).filter(Boolean));

    const recentEvents = await this.eventRepo
      .createQueryBuilder('e')
      .where('e.churchId = :churchId AND e.type = :type AND e.id != :eventId', {
        churchId, type: event.type, eventId,
      })
      .orderBy('e.date', 'DESC')
      .take(2)
      .getMany();

    let absentRegulars: Member[] = [];
    let absentRegularsTotal = 0;

    if (recentEvents.length > 0) {
      const recentIds = recentEvents.map((e) => e.id);
      const regularRaw = await this.recordRepo
        .createQueryBuilder('r')
        .select('DISTINCT r.memberId', 'memberId')
        .where('r.churchId = :churchId AND r.serviceEventId IN (:...ids) AND r.memberId IS NOT NULL', {
          churchId, ids: recentIds,
        })
        .getRawMany();

      const absentIds = regularRaw
        .map((r: any) => r.memberId)
        .filter((id: string) => !checkedInIds.has(id));

      absentRegularsTotal = absentIds.length;
      if (absentIds.length > 0) {
        absentRegulars = await this.memberRepo.findByIds(absentIds.slice(0, 20));
      }
    }

    // Department breakdown
    const deptPresent = new Map<string, number>();
    memberRecords.forEach((r) => {
      const dept = (r.member as any)?.departmentName;
      if (dept) deptPresent.set(dept, (deptPresent.get(dept) ?? 0) + 1);
    });

    const deptTotals = await this.memberRepo
      .createQueryBuilder('m')
      .select('m.departmentName', 'dept')
      .addSelect('COUNT(m.id)', 'total')
      .where('m.churchId = :churchId AND m.departmentName IS NOT NULL', { churchId })
      .groupBy('m.departmentName')
      .getRawMany();

    const departments = deptTotals
      .map((row: any) => ({
        name: row.dept as string,
        present: deptPresent.get(row.dept) ?? 0,
        total: parseInt(row.total, 10),
      }))
      .filter((d) => d.present > 0 || d.total > 0)
      .sort((a, b) => b.present - a.present)
      .slice(0, 8);

    return {
      event,
      totalAttendance: records.length,
      memberCount: memberRecords.length,
      visitorCount: visitorRecords.length,
      totalMembers,
      genderDistribution: genderCounts,
      previousCount,
      changePercent,
      absentRegulars,
      absentRegularsTotal,
      departments,
    };
  }
}
