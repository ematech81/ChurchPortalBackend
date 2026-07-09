import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Household } from './household.entity';
import { HouseholdsService } from './households.service';
import { HouseholdsController } from './households.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Household])],
  controllers: [HouseholdsController],
  providers: [HouseholdsService],
  exports: [HouseholdsService],
})
export class HouseholdsModule {}
