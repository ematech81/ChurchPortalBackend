import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GivingRecord } from './giving-record.entity';
import { Member } from '../members/member.entity';
import { GivingService } from './giving.service';
import { GivingController } from './giving.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GivingRecord, Member])],
  controllers: [GivingController],
  providers: [GivingService],
  exports: [GivingService],
})
export class GivingModule {}
