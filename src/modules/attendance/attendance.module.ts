import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from './attendance-record.entity';
import { ServiceEvent } from './service-event.entity';
import { Member } from '../members/member.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceRecord, ServiceEvent, Member])],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
