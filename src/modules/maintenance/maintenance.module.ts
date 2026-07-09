import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { Member } from '../members/member.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Member, User])],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
