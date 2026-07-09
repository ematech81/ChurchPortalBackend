import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Visit, VisitStatus } from './visit.entity';

@Injectable()
export class VisitsService {
  constructor(
    @InjectRepository(Visit) private readonly repo: Repository<Visit>,
  ) {}

  create(churchId: string, workerId: string, data: Partial<Visit>) {
    return this.repo.save(this.repo.create({ ...data, churchId, workerId }));
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

  update(id: string, churchId: string, data: Partial<Visit>) {
    return this.repo.update({ id, churchId }, data as any);
  }
}
