import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Visit, VisitStatus } from './visit.entity';
import { CreateVisitDto, UpdateVisitDto } from './dto/visit.dto';

@Injectable()
export class VisitsService {
  constructor(
    @InjectRepository(Visit) private readonly repo: Repository<Visit>,
  ) {}

  create(churchId: string, workerId: string, dto: CreateVisitDto) {
    return this.repo.save(
      this.repo.create({
        churchId,
        workerId,
        title: dto.title.trim(),
        scheduledAt: new Date(dto.scheduledAt),
        memberId: dto.memberId ?? null,
        address: dto.address ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        context: dto.context ?? null,
      }),
    );
  }

  getForWorker(workerId: string, churchId: string) {
    return this.repo.find({
      where: {
        workerId,
        churchId,
        status: VisitStatus.SCHEDULED,
        scheduledAt: MoreThanOrEqual(new Date()),
      },
      order: { scheduledAt: 'ASC' },
    });
  }

  getUpcoming(workerId: string, churchId: string, limit = 10) {
    return this.repo.find({
      where: { workerId, churchId, status: VisitStatus.SCHEDULED },
      order: { scheduledAt: 'ASC' },
      take: limit,
    });
  }

  /** `onlyWorkerId`: when set, the visit must belong to that worker (non-admin callers). */
  async update(id: string, churchId: string, dto: UpdateVisitDto, onlyWorkerId: string | null) {
    const visit = await this.repo.findOne({
      where: { id, churchId, ...(onlyWorkerId ? { workerId: onlyWorkerId } : {}) },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    const { scheduledAt, ...rest } = dto;
    await this.repo.update(
      { id, churchId },
      { ...rest, ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}) } as any,
    );
    return this.repo.findOne({ where: { id, churchId } });
  }
}
