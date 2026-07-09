import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CellGroup } from './cell-group.entity';

@Injectable()
export class CellsService {
  constructor(
    @InjectRepository(CellGroup)
    private readonly repo: Repository<CellGroup>,
  ) {}

  findAll(churchId: string) {
    return this.repo.find({ where: { churchId, isActive: true } });
  }

  create(churchId: string, data: Partial<CellGroup>) {
    return this.repo.save(this.repo.create({ ...data, churchId }));
  }
}
