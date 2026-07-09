import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Family } from './family.entity';
import { FamiliesService } from './families.service';
import { FamiliesController } from './families.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Family])],
  controllers: [FamiliesController],
  providers: [FamiliesService],
  exports: [FamiliesService],
})
export class FamiliesModule {}
