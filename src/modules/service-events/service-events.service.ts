import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceEvent } from './service-event.entity';

export interface CreateServiceEventDto {
  name: string;
  day?: string;
  time: string;
  endTime?: string;
  location?: string;
  format?: string;
  kind?: string;
  eventType?: string;
  eventDate?: string;
}

@Injectable()
export class ServiceEventsService {
  constructor(
    @InjectRepository(ServiceEvent)
    private readonly repo: Repository<ServiceEvent>,
  ) {}

  async bulkCreate(churchId: string, dtos: CreateServiceEventDto[]) {
    const entities = dtos.map((dto) =>
      this.repo.create({
        churchId,
        name: dto.name,
        day: dto.day ?? null,
        time: dto.time,
        endTime: dto.endTime ?? null,
        location: dto.location ?? null,
        format: dto.format ?? 'in-person',
        kind: dto.kind ?? 'regular',
        eventType: dto.eventType ?? null,
        eventDate: dto.eventDate ?? null,
      }),
    );
    return this.repo.save(entities);
  }

  findByChurch(churchId: string) {
    return this.repo.find({ where: { churchId }, order: { createdAt: 'ASC' } });
  }

  async replaceAll(churchId: string, dtos: CreateServiceEventDto[]) {
    await this.repo.delete({ churchId });
    return this.bulkCreate(churchId, dtos);
  }
}
