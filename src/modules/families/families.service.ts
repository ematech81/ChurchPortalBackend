import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Family } from './family.entity';

@Injectable()
export class FamiliesService {
  constructor(
    @InjectRepository(Family)
    private readonly repo: Repository<Family>,
  ) {}

  findAll(churchId: string) {
    return this.repo.find({ where: { churchId }, order: { familyName: 'ASC' } });
  }

  async findByIdOrFail(id: string, churchId: string) {
    const family = await this.repo.findOne({ where: { id, churchId } });
    if (!family) throw new NotFoundException('Family not found');
    return family;
  }

  create(churchId: string, data: Partial<Family>) {
    return this.repo.save(this.repo.create({ ...data, churchId }));
  }

  async update(id: string, churchId: string, data: Partial<Family>) {
    await this.repo.update({ id, churchId }, data as any);
    return this.findByIdOrFail(id, churchId);
  }

  async remove(id: string, churchId: string) {
    await this.repo.softDelete({ id, churchId });
  }
}
