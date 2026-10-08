import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportLog } from './export-log.entity';

@Injectable()
export class ExportLogService {
  constructor(@InjectRepository(ExportLog) private readonly repo: Repository<ExportLog>) {}

  record(entry: { churchId: string; userId: string; kind: string; format: string; rowCount: number; details?: Record<string, unknown> }) {
    return this.repo.save(this.repo.create({ ...entry, details: entry.details ?? {} }));
  }
}
