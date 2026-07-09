import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Household } from './household.entity';

@Injectable()
export class HouseholdsService {
  constructor(
    @InjectRepository(Household)
    private readonly repo: Repository<Household>,
  ) {}

  findAll(churchId: string) {
    return this.repo.find({ where: { churchId } });
  }

  create(churchId: string, data: Partial<Household>) {
    return this.repo.save(this.repo.create({ ...data, churchId }));
  }
}
